/**
 * Vendor payout — cash out the accrued PAYABLE balance built up by completed
 * sub-orders (`completeVendorOrder` in `./orders.ts` credits it). Mirrors the
 * courier payout in `../delivery/earnings.ts`; the two are kept separate
 * because they sit in different domains, not because the logic differs.
 */
import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { verifyPin } from "../auth/credentials.ts";
import { balanceOf, gatewayClearing, postTxn, vendorPayable } from "../wallet/ledger.ts";
import { vendorProfileFor } from "./orders.ts";

export async function vendorBalanceMinor(vendorId: string, currency = "GHS"): Promise<number> {
  return balanceOf(vendorPayable(vendorId, currency));
}

/** PIN-gated vendor payout request: debit the vendor PAYABLE, open a PENDING Payout. */
export async function requestVendorPayout(input: {
  userId: string;
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
  const vp = await vendorProfileFor(input.userId);
  await verifyPin(input.userId, input.pin);

  const bal = await vendorBalanceMinor(vp.id, currency);
  if (bal < input.amountMinor) {
    throw new AppError("INSUFFICIENT_FUNDS", "Your payout balance is too low for this withdrawal", {
      balanceMinor: bal,
      requiredMinor: input.amountMinor,
    });
  }

  return prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "PAYOUT",
        memo: "Vendor payout",
        reference: { vendorId: vp.id },
        lines: [
          {
            account: vendorPayable(vp.id, currency),
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
        ownerType: "VENDOR",
        ownerId: vp.id,
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

export async function listVendorPayouts(userId: string) {
  const vp = await vendorProfileFor(userId);
  const rows = await prisma.payout.findMany({
    where: { ownerType: "VENDOR", ownerId: vp.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((p) => ({ id: p.id, amountMinor: p.amountMinor, currency: p.currency, status: p.status, at: p.createdAt.toISOString() }));
}
