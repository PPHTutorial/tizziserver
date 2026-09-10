import { prisma, type Prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { verifyPin } from "../auth/credentials.ts";
import { gatewayFor } from "../payments/providers.ts";
import {
  balanceOf,
  gatewayClearing,
  getAccount,
  platformEscrow,
  postTxn,
  userWallet,
  type AccountRef,
} from "./ledger.ts";

const CUR = "GHS";

export interface WalletView {
  currency: string;
  balanceMinor: number;
  pinRequired: boolean;
}

/** Ensure the user has a Wallet + backing WALLET ledger account. */
export async function getOrCreateWallet(userId: string, currency = CUR) {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  const account = await getAccount(userWallet(userId, currency));
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId, currency, accountId: account.id },
    update: {},
  });
}

export async function getWallet(userId: string): Promise<WalletView> {
  const w = await getOrCreateWallet(userId);
  return { currency: w.currency, balanceMinor: await balanceOf(userWallet(userId, w.currency)), pinRequired: w.pinRequired };
}

export const walletBalanceMinor = (userId: string, currency = CUR) => balanceOf(userWallet(userId, currency));

async function recordWalletTxn(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
  args: { ledgerTxnId: string; direction: "credit" | "debit"; amountMinor: number; description: string; meta?: Record<string, unknown> },
) {
  const w = await db.wallet.findUniqueOrThrow({ where: { userId } });
  const balanceAfter = (await db.ledgerAccount.findUniqueOrThrow({ where: { id: w.accountId } })).balanceMinor;
  await db.walletTransaction.create({
    data: {
      walletId: w.id,
      ledgerTxnId: args.ledgerTxnId,
      directionLabel: args.direction,
      amountMinor: args.amountMinor,
      balanceAfterMinor: balanceAfter,
      description: args.description,
      meta: (args.meta ?? undefined) as Prisma.InputJsonValue,
    },
  });
  return balanceAfter;
}

/** Credit the wallet from a settled gateway payment (top-up). */
export async function topUpWallet(input: {
  userId: string;
  amountMinor: number;
  platformSlug: string;
  gateway: string;
  gatewayRef?: string;
  currency?: string;
}): Promise<{ balanceMinor: number }> {
  const currency = input.currency ?? CUR;
  await getOrCreateWallet(input.userId, currency);

  const balanceMinor = await prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "TOPUP",
        memo: `Wallet top-up via ${input.gateway}`,
        reference: { gatewayRef: input.gatewayRef },
        lines: [
          { account: userWallet(input.userId, currency), direction: "CREDIT", amountMinor: input.amountMinor },
          { account: gatewayClearing(input.platformSlug, currency), direction: "DEBIT", amountMinor: input.amountMinor },
        ],
      },
      tx,
    );
    return recordWalletTxn(tx, input.userId, {
      ledgerTxnId: txn.id,
      direction: "credit",
      amountMinor: input.amountMinor,
      description: "Wallet top-up",
      meta: { gateway: input.gateway, gatewayRef: input.gatewayRef },
    });
  });

  return { balanceMinor };
}

/**
 * Top up via a payment gateway: create a `PaymentIntent`, capture it, and — on
 * success — credit the wallet. With `PAYMENTS_PROVIDER=mock` the capture is
 * synchronous; real providers would confirm via `payments/webhook`.
 */
export async function initiateTopUp(input: {
  userId: string;
  amountMinor: number;
  platformSlug: string;
  gateway?: string;
  currency?: string;
}): Promise<{ status: "SUCCEEDED" | "FAILED"; balanceMinor?: number; intentId: string; gatewayRef: string; failureReason?: string }> {
  const currency = input.currency ?? CUR;
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 100) {
    throw new AppError("VALIDATION", "Minimum top-up is 100 minor units");
  }
  const gw = gatewayFor(input.gateway);
  const intent = await gw.createIntent({
    amountMinor: input.amountMinor,
    currency,
    purpose: "WALLET_TOPUP",
    reference: `${input.userId}:${Date.now()}`,
    userId: input.userId,
  });
  const pi = await prisma.paymentIntent.create({
    data: {
      userId: input.userId,
      purpose: "WALLET_TOPUP",
      amountMinor: input.amountMinor,
      currency,
      status: "PROCESSING",
      gateway: gw.name,
      gatewayRef: intent.ref,
      clientSecret: intent.clientSecret,
    },
  });

  const cap = await gw.capture(intent.ref, input.amountMinor);
  if (!cap.ok) {
    await prisma.$transaction([
      prisma.payment.create({ data: { intentId: pi.id, status: "FAILED", gatewayResponse: cap.raw as Prisma.InputJsonValue } }),
      prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "FAILED" } }),
    ]);
    return { status: "FAILED", intentId: pi.id, gatewayRef: intent.ref, failureReason: cap.failureReason };
  }

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        intentId: pi.id,
        status: "SUCCEEDED",
        capturedMinor: cap.capturedMinor,
        feeMinor: cap.feeMinor,
        gatewayResponse: cap.raw as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    }),
    prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED" } }),
  ]);
  const { balanceMinor } = await topUpWallet({
    userId: input.userId,
    amountMinor: cap.capturedMinor,
    platformSlug: input.platformSlug,
    gateway: gw.name,
    gatewayRef: intent.ref,
    currency,
  });
  return { status: "SUCCEEDED", balanceMinor, intentId: pi.id, gatewayRef: intent.ref };
}

/** Move funds from the user's wallet into platform escrow (order payment). */
export async function payFromWallet(input: {
  userId: string;
  amountMinor: number;
  platformSlug: string;
  currency?: string;
  memo?: string;
  reference?: Record<string, unknown>;
}): Promise<{ ledgerTxnId: string; balanceMinor: number }> {
  const currency = input.currency ?? CUR;
  await getOrCreateWallet(input.userId, currency);
  const bal = await walletBalanceMinor(input.userId, currency);
  if (bal < input.amountMinor) {
    throw new AppError("INSUFFICIENT_FUNDS", "Wallet balance is too low for this payment", {
      balanceMinor: bal,
      requiredMinor: input.amountMinor,
    });
  }

  return prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "ORDER_CAPTURE",
        memo: input.memo ?? "Order payment (wallet)",
        reference: input.reference,
        lines: [
          { account: userWallet(input.userId, currency), direction: "DEBIT", amountMinor: input.amountMinor },
          { account: platformEscrow(input.platformSlug, currency), direction: "CREDIT", amountMinor: input.amountMinor },
        ],
      },
      tx,
    );
    const balanceMinor = await recordWalletTxn(tx, input.userId, {
      ledgerTxnId: txn.id,
      direction: "debit",
      amountMinor: input.amountMinor,
      description: input.memo ?? "Order payment",
      meta: input.reference,
    });
    return { ledgerTxnId: txn.id, balanceMinor };
  });
}

/**
 * Credit a customer's wallet as a refund. Money is clawed back from
 * `sourceAccount` — platform escrow for a pre-fulfilment cancel (the order's
 * full amount is still held there), or the vendor's PAYABLE for a post-
 * fulfilment return (the payout already left escrow at completion).
 */
export async function refundToWallet(input: {
  userId: string;
  amountMinor: number;
  platformSlug: string;
  currency?: string;
  memo?: string;
  reference?: Record<string, unknown>;
  sourceAccount?: AccountRef;
}): Promise<{ ledgerTxnId: string; balanceMinor: number }> {
  const currency = input.currency ?? CUR;
  await getOrCreateWallet(input.userId, currency);
  const source = input.sourceAccount ?? platformEscrow(input.platformSlug, currency);

  return prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "REFUND",
        memo: input.memo ?? "Refund to wallet",
        reference: input.reference,
        lines: [
          { account: source, direction: "DEBIT", amountMinor: input.amountMinor },
          { account: userWallet(input.userId, currency), direction: "CREDIT", amountMinor: input.amountMinor },
        ],
      },
      tx,
    );
    const balanceMinor = await recordWalletTxn(tx, input.userId, {
      ledgerTxnId: txn.id,
      direction: "credit",
      amountMinor: input.amountMinor,
      description: input.memo ?? "Refund",
      meta: input.reference,
    });
    return { ledgerTxnId: txn.id, balanceMinor };
  });
}

/** PIN-gated withdrawal request. Debits the wallet and opens a PENDING payout. */
export async function requestWithdrawal(input: {
  userId: string;
  amountMinor: number;
  pin: string;
  platformSlug: string;
  currency?: string;
}): Promise<{ payoutId: string; balanceMinor: number }> {
  const currency = input.currency ?? CUR;
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new AppError("VALIDATION", "Withdrawal amount must be a positive integer");
  }
  await verifyPin(input.userId, input.pin); // throws on a bad / missing / locked PIN

  const bal = await walletBalanceMinor(input.userId, currency);
  if (bal < input.amountMinor) {
    throw new AppError("INSUFFICIENT_FUNDS", "Wallet balance is too low for this withdrawal", {
      balanceMinor: bal,
      requiredMinor: input.amountMinor,
    });
  }

  return prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "WITHDRAWAL",
        memo: "Wallet withdrawal",
        lines: [
          { account: userWallet(input.userId, currency), direction: "DEBIT", amountMinor: input.amountMinor },
          { account: gatewayClearing(input.platformSlug, currency), direction: "CREDIT", amountMinor: input.amountMinor },
        ],
      },
      tx,
    );
    const balanceMinor = await recordWalletTxn(tx, input.userId, {
      ledgerTxnId: txn.id,
      direction: "debit",
      amountMinor: input.amountMinor,
      description: "Withdrawal",
    });
    const payout = await tx.payout.create({
      data: {
        ownerType: "USER",
        ownerId: input.userId,
        amountMinor: input.amountMinor,
        currency,
        status: "PENDING",
        ledgerTxnId: txn.id,
      },
    });
    return { payoutId: payout.id, balanceMinor };
  });
}

export async function listWalletTransactions(userId: string, opts: { cursor?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 20)), 60);
  const w = await getOrCreateWallet(userId);
  const rows = await prisma.walletTransaction.findMany({
    where: { walletId: w.id },
    orderBy: { at: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  return {
    items: rows.slice(0, limit).map((r) => ({
      id: r.id,
      direction: r.directionLabel,
      amountMinor: r.amountMinor,
      balanceAfterMinor: r.balanceAfterMinor,
      description: r.description,
      at: r.at.toISOString(),
    })),
    nextCursor,
  };
}
