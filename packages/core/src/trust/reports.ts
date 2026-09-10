/**
 * Reports + safety actions. Report a user / product / vendor / courier /
 * conversation / order / delivery; STAFF triages and may apply a `SafetyAction`
 * that feeds `User.status` / `UserRole.status`.
 */
import { prisma, type Prisma, type ReportStatus, type ReportTargetType, type SafetyActionType } from "@stall/db";
import { AppError } from "../errors.ts";
import { notify } from "../comms/notifications.ts";

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  category: string;
  body: string;
  evidence?: unknown;
}

export async function submitReport(userId: string, input: ReportInput) {
  const r = await prisma.report.create({
    data: {
      reporterId: userId,
      targetType: input.targetType,
      targetId: input.targetId,
      category: input.category,
      body: input.body,
      evidence: (input.evidence ?? undefined) as Prisma.InputJsonValue,
    },
  });
  await prisma.outboxEvent.create({ data: { type: "report.filed", aggregateType: "Report", aggregateId: r.id, payload: { targetType: input.targetType, targetId: input.targetId } } });
  return { id: r.id, status: r.status };
}

export async function listMyReports(userId: string) {
  const rows = await prisma.report.findMany({ where: { reporterId: userId }, orderBy: { createdAt: "desc" } });
  return { items: rows.map((r) => ({ id: r.id, targetType: r.targetType, category: r.category, status: r.status, at: r.createdAt.toISOString() })) };
}

// --- STAFF ---------------------------------------------------------

export async function listReports(opts: { status?: ReportStatus } = {}) {
  const rows = await prisma.report.findMany({
    where: opts.status ? { status: opts.status } : { status: { in: ["OPEN", "REVIEWING"] } },
    orderBy: { createdAt: "asc" },
    include: { reporter: { select: { firstName: true } } },
  });
  return { items: rows.map((r) => ({ id: r.id, targetType: r.targetType, targetId: r.targetId, category: r.category, body: r.body, status: r.status, reporter: r.reporter.firstName ?? "User", at: r.createdAt.toISOString() })) };
}

export async function actionReport(
  staffId: string,
  reportId: string,
  input: { status: ReportStatus; note?: string; safetyAction?: { targetUserId: string; action: SafetyActionType; reason: string; expiresAt?: Date } },
) {
  const r = await prisma.report.findUnique({ where: { id: reportId } });
  if (!r) throw new AppError("NOT_FOUND", "Report not found");
  await prisma.report.update({ where: { id: reportId }, data: { status: input.status, reviewedById: staffId, note: input.note } });
  if (input.safetyAction) await applySafetyAction(staffId, { targetType: "USER", targetId: input.safetyAction.targetUserId, action: input.safetyAction.action, reason: input.safetyAction.reason, expiresAt: input.safetyAction.expiresAt });
  return { status: input.status };
}

export async function applySafetyAction(
  staffId: string,
  input: { targetType: string; targetId: string; action: SafetyActionType; reason: string; expiresAt?: Date },
) {
  await prisma.safetyAction.create({
    data: { actorId: staffId, targetType: input.targetType, targetId: input.targetId, action: input.action, reason: input.reason, expiresAt: input.expiresAt },
  });

  if (input.targetType === "USER") {
    const status =
      input.action === "SUSPEND" ? "SUSPENDED" : input.action === "BAN" ? "BANNED" : input.action === "CLEAR" ? "ACTIVE" : undefined;
    if (status) {
      await prisma.user.update({ where: { id: input.targetId }, data: { status: status as never } });
      await prisma.userRole.updateMany({
        where: { userId: input.targetId },
        data: { status: status === "ACTIVE" ? "ACTIVE" : "SUSPENDED" },
      });
      await prisma.session.updateMany({ where: { userId: input.targetId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: `safety:${input.action}` } });
      await prisma.tokenEpoch.upsert({ where: { userId: input.targetId }, create: { userId: input.targetId, ver: 2 }, update: { ver: { increment: 1 } } });
    }
    await notify({ userId: input.targetId, category: "SECURITY", title: "Account action", body: `${input.action}: ${input.reason}`, data: {} }).catch(() => {});
  }
  return { applied: input.action };
}

/** Security centre summary for a user. */
export async function safetyCenter(userId: string) {
  const [sessions, activity, blocks, reports, creds] = await Promise.all([
    prisma.session.count({ where: { userId, revokedAt: null } }),
    prisma.loginActivity.findMany({ where: { userId }, orderBy: { at: "desc" }, take: 10 }),
    prisma.block.count({ where: { byUserId: userId } }),
    prisma.report.count({ where: { reporterId: userId } }),
    prisma.credential.findMany({ where: { userId }, select: { kind: true } }),
  ]);
  return {
    activeSessions: sessions,
    twoFactorEnabled: creds.some((c) => c.kind === "TOTP"),
    pinSet: creds.some((c) => c.kind === "PIN"),
    passwordSet: creds.some((c) => c.kind === "PASSWORD"),
    blockedCount: blocks,
    reportsFiled: reports,
    recentLogins: activity.map((a) => ({ ip: a.ip, ua: a.ua, geo: a.geo, result: a.result, at: a.at.toISOString() })),
  };
}
