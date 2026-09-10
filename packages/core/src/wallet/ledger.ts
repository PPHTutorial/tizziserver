import { prisma, type Prisma, type LedgerAccountKind, type LedgerOwnerType, type LedgerTxnType } from "@stall/db";
import { AppError } from "../errors.ts";

/**
 * Minimal double-entry ledger. Every account's cached `balanceMinor` is
 * `Σ credits − Σ debits`; a transaction must balance (Σ debits == Σ credits).
 * Sign convention is uniform across account kinds — a USER `WALLET` balance is
 * spendable funds, an `ESCROW` balance is funds held, a platform `REVENUE`
 * balance is revenue booked.
 */

export interface AccountRef {
  ownerType: LedgerOwnerType;
  ownerId: string;
  kind: LedgerAccountKind;
  currency?: string;
}

export interface TxnLine {
  account: AccountRef;
  direction: "DEBIT" | "CREDIT";
  amountMinor: number;
  /**
   * Force the same atomic non-negative guard normally reserved for WALLET
   * debits, even on a kind (e.g. PAYABLE) that otherwise swings negative
   * freely. Use for a user-initiated withdrawal — never for a
   * system-initiated charge-back (e.g. a return refund clawed back from a
   * vendor's PAYABLE), which must be allowed to leave the account negative.
   */
  guardNonNegative?: boolean;
}

const CUR = "GHS";

type Db = Prisma.TransactionClient | typeof prisma;

/** Get-or-create the ledger account for an owner + kind. */
export async function getAccount(ref: AccountRef, db: Db = prisma) {
  const currency = ref.currency ?? CUR;
  return db.ledgerAccount.upsert({
    where: {
      ownerType_ownerId_currency_kind: {
        ownerType: ref.ownerType,
        ownerId: ref.ownerId,
        currency,
        kind: ref.kind,
      },
    },
    create: { ownerType: ref.ownerType, ownerId: ref.ownerId, currency, kind: ref.kind },
    update: {},
  });
}

export interface PostTxnInput {
  type: LedgerTxnType;
  lines: TxnLine[];
  memo?: string;
  reference?: Record<string, unknown>;
}

export interface PostedTxn {
  id: string;
  type: LedgerTxnType;
  balancesAfter: Record<string, number>; // accountId -> balanceMinor
}

/** Write a balanced transaction + its entries and roll the cached balances. */
export async function postTxn(input: PostTxnInput, db: Db = prisma): Promise<PostedTxn> {
  if (input.lines.length < 2) throw new AppError("VALIDATION", "A ledger txn needs at least two entries");

  let debit = 0;
  let credit = 0;
  for (const l of input.lines) {
    if (!Number.isInteger(l.amountMinor) || l.amountMinor <= 0) {
      throw new AppError("VALIDATION", "Ledger entry amounts must be positive integers (minor units)");
    }
    if (l.direction === "DEBIT") debit += l.amountMinor;
    else credit += l.amountMinor;
  }
  if (debit !== credit) {
    throw new AppError("VALIDATION", `Unbalanced ledger txn: debit ${debit} ≠ credit ${credit}`);
  }

  const run = async (tx: Db): Promise<PostedTxn> => {
    const accounts = await Promise.all(input.lines.map((l) => getAccount(l.account, tx)));
    const txn = await tx.ledgerTxn.create({
      data: { type: input.type, memo: input.memo, reference: (input.reference ?? undefined) as Prisma.InputJsonValue },
    });

    const balancesAfter: Record<string, number> = {};
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      const account = accounts[i]!;
      await tx.ledgerEntry.create({
        data: { txnId: txn.id, accountId: account.id, direction: line.direction, amountMinor: line.amountMinor },
      });

      if (line.direction === "CREDIT") {
        const updated = await tx.ledgerAccount.update({
          where: { id: account.id },
          data: { balanceMinor: { increment: line.amountMinor } },
        });
        balancesAfter[account.id] = updated.balanceMinor;
        continue;
      }

      // A user's real, withdrawable WALLET balance must never go negative —
      // guard its debit atomically so two concurrent transactions can't both
      // read a stale balance and both proceed (the loser's updateMany affects
      // 0 rows and the whole transaction rolls back). Other account kinds
      // (CLEARING, ESCROW, PAYABLE, REVENUE, RECEIVABLE) are internal
      // bookkeeping/suspense accounts that legitimately swing negative as
      // part of normal double-entry flows (e.g. CLEARING nets negative on
      // every top-up, representing money still owed by the gateway) and stay
      // on the original unconditional update — unless the caller explicitly
      // asks for the same guard via `guardNonNegative` (a vendor/courier
      // payout withdrawal debiting their PAYABLE balance, same TOCTOU risk
      // as a wallet withdrawal).
      if (line.account.kind === "WALLET" || line.guardNonNegative) {
        const guard = await tx.ledgerAccount.updateMany({
          where: { id: account.id, balanceMinor: { gte: line.amountMinor } },
          data: { balanceMinor: { decrement: line.amountMinor } },
        });
        if (guard.count === 0) {
          throw new AppError("CONFLICT", "Insufficient balance for this transaction");
        }
        balancesAfter[account.id] = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: account.id } })).balanceMinor;
        continue;
      }

      const updated = await tx.ledgerAccount.update({
        where: { id: account.id },
        data: { balanceMinor: { decrement: line.amountMinor } },
      });
      balancesAfter[account.id] = updated.balanceMinor;
    }
    return { id: txn.id, type: txn.type, balancesAfter };
  };

  // Reuse an outer transaction when we're already inside one.
  return "$transaction" in db ? db.$transaction((tx) => run(tx)) : run(db);
}

/** Current cached balance for an account (0 if it doesn't exist yet). */
export async function balanceOf(ref: AccountRef, db: Db = prisma): Promise<number> {
  const currency = ref.currency ?? CUR;
  const acc = await db.ledgerAccount.findUnique({
    where: {
      ownerType_ownerId_currency_kind: { ownerType: ref.ownerType, ownerId: ref.ownerId, currency, kind: ref.kind },
    },
  });
  return acc?.balanceMinor ?? 0;
}

// --- well-known accounts --------------------------------------------------

export const userWallet = (userId: string, currency = CUR): AccountRef => ({
  ownerType: "USER",
  ownerId: userId,
  kind: "WALLET",
  currency,
});
export const vendorPayable = (vendorId: string, currency = CUR): AccountRef => ({
  ownerType: "VENDOR",
  ownerId: vendorId,
  kind: "PAYABLE",
  currency,
});
export const courierPayable = (courierId: string, currency = CUR): AccountRef => ({
  ownerType: "COURIER",
  ownerId: courierId,
  kind: "PAYABLE",
  currency,
});
export const platformEscrow = (platformSlug: string, currency = CUR): AccountRef => ({
  ownerType: "ESCROW",
  ownerId: platformSlug,
  kind: "ESCROW",
  currency,
});
/** Per-auction escrow — ticket stakes held until the draw resolves. */
export const auctionEscrow = (auctionId: string, currency = CUR): AccountRef => ({
  ownerType: "ESCROW",
  ownerId: `auction:${auctionId}`,
  kind: "ESCROW",
  currency,
});
export const platformRevenue = (platformSlug: string, currency = CUR): AccountRef => ({
  ownerType: "PLATFORM",
  ownerId: platformSlug,
  kind: "REVENUE",
  currency,
});
export const gatewayClearing = (platformSlug: string, currency = CUR): AccountRef => ({
  ownerType: "GATEWAY",
  ownerId: platformSlug,
  kind: "CLEARING",
  currency,
});
