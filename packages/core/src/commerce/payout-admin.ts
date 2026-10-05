/**
 * Manual payout settlement for the admin console. Until a real disbursement
 * gateway is wired, a withdrawal (vendor `requestVendorPayout` / courier
 * `requestCourierPayout`) stays PENDING here — the worker only auto-settles
 * under PAYMENTS_PROVIDER=mock — and staff send the money by MoMo/bank, then
 * mark it PAID with the transfer reference, or FAIL it, which reverses the
 * withdrawal's ledger entries so the funds return to the owner's balance.
 */
import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { postTxn } from "../wallet/ledger.ts";

export async function listOpenPayouts() {
  const payouts = await prisma.payout.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const vendorIds = payouts.filter((p) => p.ownerType === "VENDOR").map((p) => p.ownerId);
  const courierIds = payouts.filter((p) => p.ownerType === "COURIER").map((p) => p.ownerId);
  const [vendors, couriers] = await Promise.all([
    prisma.vendorProfile.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, displayName: true, user: { select: { phone: true } } },
    }),
    prisma.courierProfile.findMany({
      where: { id: { in: courierIds } },
      select: { id: true, user: { select: { phone: true, firstName: true, lastName: true } } },
    }),
  ]);
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const courierById = new Map(couriers.map((c) => [c.id, c]));
  return payouts.map((p) => {
    const v = p.ownerType === "VENDOR" ? vendorById.get(p.ownerId) : undefined;
    const c = p.ownerType === "COURIER" ? courierById.get(p.ownerId) : undefined;
    return {
      id: p.id,
      ownerType: p.ownerType,
      ownerName:
        v?.displayName ?? ([c?.user.firstName, c?.user.lastName].filter(Boolean).join(" ") || p.ownerId),
      ownerPhone: v?.user.phone ?? c?.user.phone ?? null,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

async function openPayout(payoutId: string) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new AppError("NOT_FOUND", "Payout not found");
  if (payout.status !== "PENDING" && payout.status !== "PROCESSING") {
    throw new AppError("CONFLICT", `Payout is already ${payout.status}`);
  }
  return payout;
}

/** Staff sent the money: record the MoMo/bank transfer reference. */
export async function markPayoutPaid(payoutId: string, staffUserId: string, transferRef: string) {
  const ref = transferRef.trim();
  if (ref.length < 3) throw new AppError("VALIDATION", "Enter the transfer reference");
  const payout = await openPayout(payoutId);
  // Conditional update: two staff settling at once can't both win.
  const { count } = await prisma.payout.updateMany({
    where: { id: payout.id, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "PAID", gatewayRef: `manual:${ref}` },
  });
  if (count === 0) throw new AppError("CONFLICT", "Payout was settled by someone else");
  await prisma.auditLog.create({
    data: {
      actorId: staffUserId,
      actorType: "USER",
      action: "payout.mark_paid",
      targetType: "Payout",
      targetId: payout.id,
      after: { transferRef: ref, amountMinor: payout.amountMinor },
    },
  });
  return { id: payout.id, status: "PAID" as const };
}

/**
 * The transfer couldn't be made (bad account, owner request): mark FAILED and
 * post the exact mirror of the withdrawal transaction so the owner's PAYABLE
 * balance is restored.
 */
export async function failPayout(payoutId: string, staffUserId: string, reason: string) {
  const payout = await openPayout(payoutId);
  if (!payout.ledgerTxnId) throw new AppError("CONFLICT", "Payout has no ledger transaction to reverse");
  const entries = await prisma.ledgerEntry.findMany({
    where: { txnId: payout.ledgerTxnId },
    include: { account: { select: { ownerType: true, ownerId: true, kind: true, currency: true } } },
  });
  if (entries.length === 0) throw new AppError("CONFLICT", "Payout ledger transaction not found");

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.payout.updateMany({
      where: { id: payout.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", note: [payout.note, `failed: ${reason.trim() || "no reason"}`].filter(Boolean).join(" · ") },
    });
    if (count === 0) throw new AppError("CONFLICT", "Payout was settled by someone else");
    await postTxn(
      {
        type: "ADJUSTMENT",
        memo: "Payout failed — funds returned",
        reference: { payoutId: payout.id, reverses: payout.ledgerTxnId },
        lines: entries.map((e) => ({
          account: { ...e.account, ownerId: e.account.ownerId ?? payout.ownerId },
          direction: e.direction === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
          amountMinor: e.amountMinor,
        })),
      },
      tx,
    );
    await tx.auditLog.create({
      data: {
        actorId: staffUserId,
        actorType: "USER",
        action: "payout.fail",
        targetType: "Payout",
        targetId: payout.id,
        after: { reason, amountMinor: payout.amountMinor },
      },
    });
  });
  return { id: payout.id, status: "FAILED" as const };
}
