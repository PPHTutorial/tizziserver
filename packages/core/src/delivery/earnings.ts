/**
 * Courier earnings → double-entry ledger.
 *
 * A completed delivery releases the courier's cut from platform escrow to the
 * courier PAYABLE account (mirrors vendor payout in `commerce/orders`). Tips and
 * manual adjustments post the same way. The `Payout` drain is a worker job.
 */
import { prisma, type Prisma, type CourierEarningKind } from "@stall/db";
import { AppError } from "../errors.ts";
import { verifyPin } from "../auth/credentials.ts";
import { balanceOf, courierPayable, gatewayClearing, platformEscrow, platformRevenue, postTxn } from "../wallet/ledger.ts";

type Db = Prisma.TransactionClient | typeof prisma;

export interface PostEarningInput {
  courierId: string;
  deliveryId?: string;
  platformSlug: string;
  currency?: string;
  kind: CourierEarningKind;
  grossMinor: number;
  deductionMinor?: number;
  memo?: string;
  /** when true the funds come from platform escrow (delivery fee already captured). */
  fromEscrow?: boolean;
}

export async function postCourierEarning(input: PostEarningInput, db: Db = prisma) {
  const currency = input.currency ?? "GHS";
  const deduction = input.deductionMinor ?? 0;
  const netMinor = input.grossMinor - deduction;
  if (netMinor <= 0) {
    return db.courierEarning.create({
      data: {
        courierId: input.courierId,
        deliveryId: input.deliveryId,
        kind: input.kind,
        grossMinor: input.grossMinor,
        deductionMinor: deduction,
        netMinor,
        currency,
        memo: input.memo,
      },
    });
  }

  const run = async (tx: Db) => {
    const source = input.fromEscrow
      ? platformEscrow(input.platformSlug, currency)
      : platformRevenue(input.platformSlug, currency);
    const txn = await postTxn(
      {
        type: input.kind === "TIP" ? "TIP" : "RELEASE",
        memo: input.memo ?? `Courier ${input.kind.toLowerCase()}`,
        reference: { courierId: input.courierId, deliveryId: input.deliveryId },
        lines: [
          { account: source, direction: "DEBIT", amountMinor: netMinor },
          { account: courierPayable(input.courierId, currency), direction: "CREDIT", amountMinor: netMinor },
        ],
      },
      tx,
    );
    return tx.courierEarning.create({
      data: {
        courierId: input.courierId,
        deliveryId: input.deliveryId,
        kind: input.kind,
        grossMinor: input.grossMinor,
        deductionMinor: deduction,
        netMinor,
        currency,
        ledgerTxnId: txn.id,
        memo: input.memo,
      },
    });
  };

  return "$transaction" in db ? db.$transaction((tx) => run(tx)) : run(db);
}

export async function courierBalanceMinor(courierId: string, currency = "GHS"): Promise<number> {
  return balanceOf(courierPayable(courierId, currency));
}

export interface EarningsSummary {
  currency: string;
  balanceMinor: number;
  today: number;
  week: number;
  month: number;
  lifetimeNetMinor: number;
  deliveries: number;
}

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export async function courierEarningsSummary(courierId: string): Promise<EarningsSummary> {
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = new Date(dayStart.getTime() - ((dayStart.getDay() + 6) % 7) * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await prisma.courierEarning.findMany({ where: { courierId }, select: { netMinor: true, at: true, kind: true } });
  const sum = (from: Date) => rows.filter((r) => r.at >= from).reduce((n, r) => n + r.netMinor, 0);

  return {
    currency: "GHS",
    balanceMinor: await courierBalanceMinor(courierId),
    today: sum(dayStart),
    week: sum(weekStart),
    month: sum(monthStart),
    lifetimeNetMinor: rows.reduce((n, r) => n + r.netMinor, 0),
    deliveries: rows.filter((r) => r.kind === "DELIVERY").length,
  };
}

/** PIN-gated courier payout request: debit courier PAYABLE, open a PENDING Payout. */
export async function requestCourierPayout(input: {
  userId: string;
  courierId: string;
  platformSlug: string;
  amountMinor: number;
  pin: string;
  payoutAccountId?: string;
  currency?: string;
}): Promise<{ payoutId: string; balanceMinor: number }> {
  const currency = input.currency ?? "GHS";
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new AppError("VALIDATION", "Withdrawal amount must be a positive integer");
  }
  await verifyPin(input.userId, input.pin);
  const bal = await courierBalanceMinor(input.courierId, currency);
  if (bal < input.amountMinor) {
    throw new AppError("INSUFFICIENT_FUNDS", "Earnings balance is too low for this withdrawal", { balanceMinor: bal, requiredMinor: input.amountMinor });
  }
  return prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "PAYOUT",
        memo: "Courier payout",
        reference: { courierId: input.courierId },
        lines: [
          {
            account: courierPayable(input.courierId, currency),
            direction: "DEBIT",
            amountMinor: input.amountMinor,
            guardNonNegative: true,
          },
          { account: gatewayClearing(input.platformSlug, currency), direction: "CREDIT", amountMinor: input.amountMinor },
        ],
      },
      tx,
    );
    const payout = await tx.payout.create({
      data: {
        ownerType: "COURIER",
        ownerId: input.courierId,
        amountMinor: input.amountMinor,
        currency,
        status: "PENDING",
        ledgerTxnId: txn.id,
        note: input.payoutAccountId ? `account:${input.payoutAccountId}` : null,
      },
    });
    return { payoutId: payout.id, balanceMinor: bal - input.amountMinor };
  });
}

export async function listCourierPayouts(courierId: string) {
  const rows = await prisma.payout.findMany({
    where: { ownerType: "COURIER", ownerId: courierId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((p) => ({ id: p.id, amountMinor: p.amountMinor, currency: p.currency, status: p.status, at: p.createdAt.toISOString() }));
}

export async function listCourierEarnings(courierId: string, opts: { cursor?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 30)), 100);
  const rows = await prisma.courierEarning.findMany({
    where: { courierId },
    orderBy: { at: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { delivery: { select: { code: true } } },
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  return {
    items: rows.slice(0, limit).map((r) => ({
      id: r.id,
      kind: r.kind,
      grossMinor: r.grossMinor,
      deductionMinor: r.deductionMinor,
      netMinor: r.netMinor,
      currency: r.currency,
      deliveryCode: r.delivery?.code ?? null,
      memo: r.memo,
      at: r.at.toISOString(),
    })),
    nextCursor,
  };
}
