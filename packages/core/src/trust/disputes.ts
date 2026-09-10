/**
 * Polymorphic disputes — order / payment / delivery / vendor / courier / auction.
 * Evidence + messaging + resolution + appeal, with an SLA clock the worker sweeps.
 */
import { prisma, type Prisma, type DisputeKind, type DisputeStatus } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { platformRevenue, postTxn, userWallet } from "../wallet/ledger.ts";
import { getOrCreateWallet } from "../wallet/wallet.ts";
import { notify } from "../comms/notifications.ts";

async function assertParty(userId: string, kind: DisputeKind, refId: string): Promise<{ againstId?: string; platformSlug?: string }> {
  switch (kind) {
    case "ORDER": {
      const o = await prisma.order.findUnique({ where: { id: refId }, include: { vendorOrders: { select: { vendorId: true, vendor: { select: { userId: true } } } } } });
      if (!o) throw new AppError("NOT_FOUND", "Order not found");
      const vendorUserIds = o.vendorOrders.map((v) => v.vendor.userId);
      if (o.customerId !== userId && !vendorUserIds.includes(userId)) throw new AppError("FORBIDDEN", "Not your order");
      return { againstId: o.customerId === userId ? vendorUserIds[0] : o.customerId, platformSlug: o.platformSlug };
    }
    case "DELIVERY": {
      const d = await prisma.delivery.findUnique({ where: { id: refId }, include: { courier: { select: { userId: true } } } });
      if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
      if (d.customerId !== userId && d.courier?.userId !== userId) throw new AppError("FORBIDDEN", "Not your delivery");
      return { againstId: d.customerId === userId ? d.courier?.userId ?? undefined : d.customerId ?? undefined, platformSlug: d.platformSlug };
    }
    case "PAYMENT": {
      const pi = await prisma.paymentIntent.findUnique({ where: { id: refId } });
      if (!pi) throw new AppError("NOT_FOUND", "Payment not found");
      if (pi.userId !== userId) throw new AppError("FORBIDDEN", "Not your payment");
      return {};
    }
    case "AUCTION": {
      const a = await prisma.auction.findUnique({ where: { id: refId } });
      if (!a) throw new AppError("NOT_FOUND", "Auction not found");
      const p = await prisma.auctionParticipant.findUnique({ where: { auctionId_userId: { auctionId: refId, userId } } });
      if (!p) throw new AppError("FORBIDDEN", "You didn't take part in this draw");
      return { platformSlug: a.platformSlug };
    }
    case "VENDOR": {
      const vendor = await prisma.vendorProfile.findUnique({ where: { id: refId }, select: { userId: true } });
      if (!vendor) throw new AppError("NOT_FOUND", "Vendor not found");
      const hasOrdered = await prisma.vendorOrder.findFirst({
        where: { vendorId: refId, order: { customerId: userId } },
        select: { id: true },
      });
      if (!hasOrdered) throw new AppError("FORBIDDEN", "You can only dispute a vendor you've ordered from");
      return { againstId: vendor.userId };
    }
    case "COURIER": {
      const courier = await prisma.courierProfile.findUnique({ where: { id: refId }, select: { userId: true } });
      if (!courier) throw new AppError("NOT_FOUND", "Courier not found");
      const hasDelivery = await prisma.delivery.findFirst({
        where: { courierId: refId, customerId: userId },
        select: { id: true },
      });
      if (!hasDelivery) throw new AppError("FORBIDDEN", "You can only dispute a courier who has delivered to you");
      return { againstId: courier.userId };
    }
    default:
      return {};
  }
}

export interface OpenDisputeInput {
  kind: DisputeKind;
  refId: string;
  category: string;
  body: string;
  evidence?: { kind?: "TEXT" | "IMAGE" | "DOC"; fileKey?: string; body?: string }[];
}

export async function openDispute(userId: string, input: OpenDisputeInput) {
  const { againstId, platformSlug } = await assertParty(userId, input.kind, input.refId);

  const existing = await prisma.dispute.findFirst({
    where: { kind: input.kind, refId: input.refId, openedById: userId, status: { notIn: ["RESOLVED", "CLOSED"] } },
  });
  if (existing) throw new AppError("CONFLICT", "You already have an open dispute for this");

  const dispute = await prisma.dispute.create({
    data: {
      kind: input.kind,
      refId: input.refId,
      openedById: userId,
      againstId,
      category: input.category,
      body: input.body,
      status: "OPEN",
      slaDueAt: new Date(Date.now() + env.DISPUTE_SLA_HOURS * 3_600_000),
      evidence: {
        create: [
          { byUserId: userId, kind: "TEXT", body: input.body },
          ...(input.evidence ?? []).map((e) => ({ byUserId: userId, kind: (e.kind ?? "TEXT") as never, fileKey: e.fileKey, body: e.body })),
        ],
      },
    },
  });

  await prisma.outboxEvent.create({ data: { type: "dispute.opened", aggregateType: "Dispute", aggregateId: dispute.id, payload: { kind: input.kind, refId: input.refId, platformSlug } } });
  if (againstId) await notify({ userId: againstId, category: "SUPPORT", title: "A dispute was opened", body: `A ${input.kind.toLowerCase()} dispute needs your response.`, data: { disputeId: dispute.id } }).catch(() => {});
  return { id: dispute.id, status: dispute.status, slaDueAt: dispute.slaDueAt?.toISOString() ?? null };
}

const shapeInclude = {
  evidence: { orderBy: { at: "asc" }, include: { byUser: { select: { firstName: true } } } },
  messages: { orderBy: { at: "asc" }, include: { sender: { select: { firstName: true } } } },
  appeal: true,
} satisfies Prisma.DisputeInclude;

function shape(d: Prisma.DisputeGetPayload<{ include: typeof shapeInclude }>, viewerIsStaff: boolean) {
  return {
    id: d.id,
    kind: d.kind,
    refId: d.refId,
    category: d.category,
    body: d.body,
    status: d.status,
    resolution: d.resolution,
    refundMinor: d.refundMinor,
    slaDueAt: d.slaDueAt?.toISOString() ?? null,
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    evidence: d.evidence.map((e) => ({ by: e.byUser.firstName ?? "User", kind: e.kind, fileKey: e.fileKey, body: e.body, at: e.at.toISOString() })),
    messages: d.messages
      .filter((m) => viewerIsStaff || !m.staffOnly)
      .map((m) => ({ by: m.sender.firstName ?? "User", body: m.body, staffOnly: m.staffOnly, at: m.at.toISOString() })),
    appeal: d.appeal ? { status: d.appeal.status, body: d.appeal.body, decidedAt: d.appeal.decidedAt?.toISOString() ?? null } : null,
  };
}

export async function listDisputes(userId: string) {
  const rows = await prisma.dispute.findMany({ where: { openedById: userId }, orderBy: { createdAt: "desc" }, include: shapeInclude });
  return { items: rows.map((d) => shape(d, false)) };
}

export async function getDispute(userId: string, id: string, isStaff = false) {
  const d = await prisma.dispute.findUnique({ where: { id }, include: shapeInclude });
  if (!d) throw new AppError("NOT_FOUND", "Dispute not found");
  if (!isStaff && d.openedById !== userId && d.againstId !== userId) throw new AppError("FORBIDDEN", "Not your dispute");
  return shape(d, isStaff);
}

export async function addDisputeEvidence(userId: string, disputeId: string, input: { kind?: "TEXT" | "IMAGE" | "DOC"; fileKey?: string; body?: string }) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!d) throw new AppError("NOT_FOUND", "Dispute not found");
  if (d.openedById !== userId && d.againstId !== userId) throw new AppError("FORBIDDEN", "Not your dispute");
  if (["RESOLVED", "CLOSED"].includes(d.status)) throw new AppError("CONFLICT", "This dispute is closed");
  await prisma.disputeEvidence.create({ data: { disputeId, byUserId: userId, kind: (input.kind ?? "TEXT") as never, fileKey: input.fileKey, body: input.body } });
  if (d.status === "OPEN") await prisma.dispute.update({ where: { id: disputeId }, data: { status: "EVIDENCE" } });
  return { added: true };
}

export async function sendDisputeMessage(userId: string, disputeId: string, body: string, opts: { staff?: boolean; staffOnly?: boolean } = {}) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!d) throw new AppError("NOT_FOUND", "Dispute not found");
  if (!opts.staff && d.openedById !== userId && d.againstId !== userId) throw new AppError("FORBIDDEN", "Not your dispute");
  await prisma.disputeMessage.create({ data: { disputeId, senderId: userId, body, staffOnly: opts.staffOnly ?? false } });
  const notifyUserId = d.openedById === userId ? d.againstId : d.openedById;
  if (notifyUserId && !opts.staffOnly) await notify({ userId: notifyUserId, category: "SUPPORT", title: "Dispute update", body: body.slice(0, 140), data: { disputeId } }).catch(() => {});
  return { sent: true };
}

// --- STAFF ---------------------------------------------------------

export async function listStaffDisputes(opts: { status?: DisputeStatus } = {}) {
  const rows = await prisma.dispute.findMany({
    where: opts.status ? { status: opts.status } : { status: { notIn: ["RESOLVED", "CLOSED"] } },
    orderBy: [{ slaDueAt: "asc" }],
    include: shapeInclude,
  });
  return { items: rows.map((d) => shape(d, true)) };
}

export async function assignDispute(staffId: string, disputeId: string) {
  await prisma.dispute.update({ where: { id: disputeId }, data: { assignedToId: staffId, status: "UNDER_REVIEW" } });
  return { assigned: true };
}

export async function resolveDispute(
  staffId: string,
  disputeId: string,
  input: { outcome: string; notes?: string; refundMinor?: number },
) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!d) throw new AppError("NOT_FOUND", "Dispute not found");
  if (["RESOLVED", "CLOSED"].includes(d.status)) throw new AppError("CONFLICT", "Already resolved");

  let platformSlug = "grandprice";
  if (d.kind === "ORDER") platformSlug = (await prisma.order.findUnique({ where: { id: d.refId }, select: { platformSlug: true } }))?.platformSlug ?? platformSlug;
  else if (d.kind === "DELIVERY") platformSlug = (await prisma.delivery.findUnique({ where: { id: d.refId }, select: { platformSlug: true } }))?.platformSlug ?? platformSlug;

  if (input.refundMinor && input.refundMinor > 0) {
    await getOrCreateWallet(d.openedById);
    await prisma.$transaction(async (tx) => {
      const txn = await postTxn(
        {
          type: "ADJUSTMENT",
          memo: `Dispute resolution ${disputeId}`,
          reference: { disputeId },
          lines: [
            { account: platformRevenue(platformSlug), direction: "DEBIT", amountMinor: input.refundMinor! },
            { account: userWallet(d.openedById), direction: "CREDIT", amountMinor: input.refundMinor! },
          ],
        },
        tx,
      );
      const w = await tx.wallet.findUnique({ where: { userId: d.openedById } });
      if (w) {
        const balAfter = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: w.accountId } })).balanceMinor;
        await tx.walletTransaction.create({ data: { walletId: w.id, ledgerTxnId: txn.id, directionLabel: "credit", amountMinor: input.refundMinor!, balanceAfterMinor: balAfter, description: "Dispute resolution credit" } });
      }
    });
  }

  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: "RESOLVED",
      resolution: { outcome: input.outcome, notes: input.notes } as Prisma.InputJsonValue,
      refundMinor: input.refundMinor ?? null,
      resolvedById: staffId,
      resolvedAt: new Date(),
    },
  });
  await notify({ userId: d.openedById, category: "SUPPORT", title: "Dispute resolved", body: input.outcome, data: { disputeId } }).catch(() => {});
  return { status: "RESOLVED" as const, refundMinor: input.refundMinor ?? 0 };
}

export async function appealDispute(userId: string, disputeId: string, body: string) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { appeal: true } });
  if (!d) throw new AppError("NOT_FOUND", "Dispute not found");
  if (d.openedById !== userId) throw new AppError("FORBIDDEN", "Not your dispute");
  if (d.status !== "RESOLVED") throw new AppError("CONFLICT", "You can only appeal a resolved dispute");
  if (d.appeal) throw new AppError("CONFLICT", "You've already appealed");
  if (d.resolvedAt && Date.now() - d.resolvedAt.getTime() > env.APPEAL_WINDOW_HOURS * 3_600_000) {
    throw new AppError("CONFLICT", "The appeal window has passed");
  }
  await prisma.$transaction([
    prisma.appeal.create({ data: { disputeId, byUserId: userId, body } }),
    prisma.dispute.update({ where: { id: disputeId }, data: { status: "APPEALED" } }),
  ]);
  return { status: "APPEALED" as const };
}

export async function decideAppeal(staffId: string, disputeId: string, decision: "UPHELD" | "DENIED", notes?: string) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { appeal: true } });
  if (!d?.appeal) throw new AppError("NOT_FOUND", "No appeal to decide");
  await prisma.$transaction([
    prisma.appeal.update({ where: { disputeId }, data: { status: decision, decidedById: staffId, decidedAt: new Date() } }),
    prisma.dispute.update({ where: { id: disputeId }, data: { status: decision === "UPHELD" ? "UNDER_REVIEW" : "CLOSED", resolution: { ...(d.resolution as object), appeal: decision, appealNotes: notes } as Prisma.InputJsonValue } }),
  ]);
  await notify({ userId: d.openedById, category: "SUPPORT", title: `Appeal ${decision.toLowerCase()}`, body: notes ?? "", data: { disputeId } }).catch(() => {});
  return { status: decision };
}

/** Worker: disputes past their SLA still awaiting review → escalate. */
export async function sweepDisputeSla(): Promise<{ escalated: number }> {
  const overdue = await prisma.dispute.findMany({
    where: { status: { in: ["OPEN", "EVIDENCE"] }, slaDueAt: { lt: new Date() } },
    select: { id: true, assignedToId: true },
    take: 100,
  });
  for (const d of overdue) {
    await prisma.dispute.update({ where: { id: d.id }, data: { status: "UNDER_REVIEW" } });
    await prisma.outboxEvent.create({ data: { type: "dispute.sla_breached", aggregateType: "Dispute", aggregateId: d.id, payload: {} } });
  }
  return { escalated: overdue.length };
}
