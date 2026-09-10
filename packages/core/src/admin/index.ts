/**
 * Ops / admin console service layer. Thin orchestration over `platform`,
 * `analytics`, `trust`, `auctions`, `comms` + the config tables the web console
 * edits directly (feature flags, pricing rules, fee schedules, broadcasts).
 *
 * Every mutating call here is expected to run behind an ADMIN/STAFF guard and be
 * wrapped by the route's `audit` option.
 */
import { prisma, type Prisma, type FeeParty, type FeeKind, type PricingRuleScope } from "@stall/db";
import { AppError } from "../errors.ts";
import { platformAnalytics } from "../analytics/platform.ts";
import { notify } from "../comms/notifications.ts";

// --- dashboard ---------------------------------------------------------

export async function dashboard(platformSlug: string) {
  const a = await platformAnalytics(platformSlug, { days: 30 });
  const [users, vendors, couriers, liveDraws] = await Promise.all([
    prisma.user.count(),
    prisma.vendorProfile.count({ where: { status: "ACTIVE" } }),
    prisma.courierProfile.count({ where: { status: "ACTIVE" } }),
    prisma.auction.count({ where: { status: { in: ["OPEN", "FILLING", "ANNOUNCED", "DRAWING"] } } }).catch(() => 0),
  ]);
  return { ...a, totals: { users, vendors, couriers, liveDraws } };
}

// --- feature flags ---------------------------------------------------

export async function listFeatureMatrix() {
  const [flags, platforms, values] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    prisma.platform.findMany({ orderBy: { slug: "asc" }, select: { slug: true, name: true } }),
    prisma.platformFeature.findMany(),
  ]);
  const map = new Map(values.map((v) => [`${v.platformSlug}:${v.flagKey}`, v.value]));
  return {
    platforms,
    flags: flags.map((f) => ({
      key: f.key,
      description: f.description,
      valueType: f.valueType,
      values: Object.fromEntries(platforms.map((p) => [p.slug, map.get(`${p.slug}:${f.key}`) ?? null])),
    })),
  };
}

export async function setPlatformFeature(platformSlug: string, flagKey: string, value: unknown) {
  const flag = await prisma.featureFlag.findUnique({ where: { key: flagKey } });
  if (!flag) throw new AppError("NOT_FOUND", "Unknown feature flag");
  const before = await prisma.platformFeature.findUnique({ where: { platformSlug_flagKey: { platformSlug, flagKey } } });
  await prisma.platformFeature.upsert({
    where: { platformSlug_flagKey: { platformSlug, flagKey } },
    create: { platformSlug, flagKey, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
  return { platformSlug, flagKey, before: before?.value ?? null, after: value };
}

// --- pricing rules + fee schedules --------------------------------

export async function listPricing() {
  const [rules, fees, config] = await Promise.all([
    prisma.pricingRule.findMany({ orderBy: [{ scope: "asc" }, { priority: "desc" }] }),
    prisma.feeSchedule.findMany({ orderBy: [{ party: "asc" }, { kind: "asc" }] }),
    prisma.appConfig.findMany({ where: { key: { in: ["checkout.fees", "support.faq"] } } }),
  ]);
  return { rules, fees, config };
}

export async function upsertPricingRule(input: {
  id?: string;
  scope: PricingRuleScope;
  platformSlug?: string;
  regionCode?: string;
  params: Record<string, unknown>;
  priority?: number;
  activeFrom?: Date;
  activeTo?: Date;
}) {
  const data = {
    scope: input.scope,
    platformSlug: input.platformSlug,
    regionCode: input.regionCode,
    params: input.params as Prisma.InputJsonValue,
    priority: input.priority ?? 0,
    activeFrom: input.activeFrom,
    activeTo: input.activeTo,
  };
  const row = input.id
    ? await prisma.pricingRule.update({ where: { id: input.id }, data })
    : await prisma.pricingRule.create({ data });
  return row;
}

export async function upsertFeeSchedule(input: {
  id?: string;
  party: FeeParty;
  kind: FeeKind;
  params: Record<string, unknown>;
  platformSlug?: string;
  activeFrom?: Date;
  activeTo?: Date;
}) {
  const data = {
    party: input.party,
    kind: input.kind,
    params: input.params as Prisma.InputJsonValue,
    platformSlug: input.platformSlug,
    activeFrom: input.activeFrom,
    activeTo: input.activeTo,
  };
  return input.id
    ? prisma.feeSchedule.update({ where: { id: input.id }, data })
    : prisma.feeSchedule.create({ data });
}

// --- broadcasts ----------------------------------------------------

export interface BroadcastAudience {
  roles?: string[];
  platformSlugs?: string[];
  hasOrdered?: boolean;
  userIds?: string[];
}

async function resolveAudience(a: BroadcastAudience): Promise<string[]> {
  if (a.userIds?.length) return [...new Set(a.userIds)];
  const where: Prisma.UserWhereInput = { status: "ACTIVE" };
  if (a.roles?.length) where.roles = { some: { role: { in: a.roles as never[] }, status: "ACTIVE" } };
  if (a.hasOrdered) where.orders = { some: {} };
  const rows = await prisma.user.findMany({ where, select: { id: true }, take: 50_000 });
  return rows.map((r) => r.id);
}

export async function composeBroadcast(input: {
  createdById: string;
  title: string;
  body: string;
  templateKey?: string;
  audience: BroadcastAudience;
  scheduledFor?: Date;
  sendNow?: boolean;
}) {
  const b = await prisma.broadcast.create({
    data: {
      title: input.title,
      body: input.body,
      templateKey: input.templateKey ?? "generic",
      audience: input.audience as Prisma.InputJsonValue,
      scheduledFor: input.scheduledFor,
      status: input.sendNow ? "SENDING" : input.scheduledFor ? "SCHEDULED" : "DRAFT",
      createdById: input.createdById,
    },
  });
  if (input.sendNow) return sendBroadcast(b.id);
  return { id: b.id, status: b.status, estimatedRecipients: (await resolveAudience(input.audience)).length };
}

export async function sendBroadcast(broadcastId: string) {
  const b = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!b) throw new AppError("NOT_FOUND", "Broadcast not found");
  if (b.status === "SENT") return { id: b.id, status: b.status, sentCount: b.sentCount };
  await prisma.broadcast.update({ where: { id: b.id }, data: { status: "SENDING" } });
  const targets = await resolveAudience(b.audience as BroadcastAudience);
  let sent = 0;
  for (const uid of targets) {
    await notify({ userId: uid, category: "PROMO", title: b.title, body: b.body, data: { broadcastId: b.id } }).catch(() => {});
    sent++;
  }
  await prisma.broadcast.update({ where: { id: b.id }, data: { status: "SENT", sentCount: sent } });
  return { id: b.id, status: "SENT" as const, sentCount: sent };
}

export async function listBroadcasts() {
  const rows = await prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return {
    items: rows.map((b) => ({ id: b.id, title: b.title, status: b.status, sentCount: b.sentCount, scheduledFor: b.scheduledFor?.toISOString() ?? null, at: b.createdAt.toISOString() })),
  };
}

export async function dueBroadcasts() {
  const due = await prisma.broadcast.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } }, select: { id: true } });
  for (const b of due) await sendBroadcast(b.id).catch((e) => console.error("[broadcast]", b.id, e));
  return { sent: due.length };
}

// --- audit log ---------------------------------------------------

export async function auditLog(opts: { actorId?: string; action?: string; targetId?: string; cursor?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const rows = await prisma.auditLog.findMany({
    where: {
      actorId: opts.actorId,
      action: opts.action ? { contains: opts.action } : undefined,
      targetId: opts.targetId,
    },
    orderBy: { at: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  return {
    items: rows.slice(0, limit).map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorType: r.actorType,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      ip: r.ip,
      at: r.at.toISOString(),
    })),
    nextCursor,
  };
}

// --- user directory ---------------------------------------------

export async function findUsers(q: string, limit = 20) {
  const term = q.trim();
  const rows = await prisma.user.findMany({
    where: term
      ? { OR: [{ phone: { contains: term } }, { email: { contains: term, mode: "insensitive" } }, { firstName: { contains: term, mode: "insensitive" } }, { lastName: { contains: term, mode: "insensitive" } }] }
      : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
    include: { roles: { select: { role: true, status: true } } },
  });
  return {
    items: rows.map((u) => ({
      id: u.id,
      name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "—",
      phone: u.phone,
      email: u.email,
      status: u.status,
      roles: u.roles.map((r) => `${r.role}${r.status === "ACTIVE" ? "" : `(${r.status})`}`),
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

export async function userDetail(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
      vendorProfile: { select: { id: true, displayName: true, status: true } },
      courierProfile: { select: { id: true, status: true, completedDeliveries: true } },
      wallet: { select: { currency: true } },
    },
  });
  if (!u) throw new AppError("NOT_FOUND", "User not found");
  const [orders, disputes, sessions] = await Promise.all([
    prisma.order.count({ where: { customerId: userId } }),
    prisma.dispute.count({ where: { openedById: userId } }),
    prisma.session.count({ where: { userId, revokedAt: null } }),
  ]);
  return {
    id: u.id,
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "—",
    phone: u.phone,
    email: u.email,
    status: u.status,
    locale: u.locale,
    createdAt: u.createdAt.toISOString(),
    roles: u.roles.map((r) => ({ role: r.role, status: r.status, kycStatus: r.kycStatus })),
    vendor: u.vendorProfile,
    courier: u.courierProfile,
    stats: { orders, disputes, activeSessions: sessions },
  };
}
