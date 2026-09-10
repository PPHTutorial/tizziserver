/**
 * Direct product boost — a lightweight alternative to a full campaign. A vendor
 * pays a `BoostTier` price for N days of rank/pin/feature boost on one product.
 */
import { prisma, type BoostKind } from "@stall/db";
import { AppError } from "../errors.ts";
import { getOrCreateWallet, refundToWallet, walletBalanceMinor } from "../wallet/wallet.ts";
import { platformEscrow, platformRevenue, postTxn, userWallet } from "../wallet/ledger.ts";
import { getBoostTier } from "./tiers.ts";

export interface CreateBoostInput {
  vendorId: string;
  platformSlug: string;
  productId: string;
  boostTierKey: string;
  kind?: BoostKind;
  categoryId?: string;
  days: number;
}

export async function createBoost(input: CreateBoostInput) {
  const days = Math.min(Math.max(1, Math.trunc(input.days)), 30);
  const tier = await getBoostTier(input.boostTierKey);
  if (!tier.platformSlugs.includes(input.platformSlug)) throw new AppError("VALIDATION", "That tier isn't available on this platform");
  // FLAT_DAILY tiers price per day; CPM/CPC tiers use their unit price as a day rate here.
  const priceMinor = tier.priceMinor * days;

  await getOrCreateWallet(input.vendorId);
  const bal = await walletBalanceMinor(input.vendorId);
  if (bal < priceMinor) throw new AppError("INSUFFICIENT_FUNDS", "Wallet balance is too low", { balanceMinor: bal, requiredMinor: priceMinor });

  const boost = await prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "HOLD",
        memo: `Product boost · ${input.productId} · ${days}d`,
        reference: { productId: input.productId, tier: tier.key },
        lines: [
          { account: userWallet(input.vendorId), direction: "DEBIT", amountMinor: priceMinor },
          { account: platformEscrow(input.platformSlug), direction: "CREDIT", amountMinor: priceMinor },
        ],
      },
      tx,
    );
    const w = await tx.wallet.findUniqueOrThrow({ where: { userId: input.vendorId } });
    const after = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: w.accountId } })).balanceMinor;
    await tx.walletTransaction.create({ data: { walletId: w.id, ledgerTxnId: txn.id, directionLabel: "debit", amountMinor: priceMinor, balanceAfterMinor: after, description: "Product boost", meta: { productId: input.productId } } });
    return tx.boost.create({
      data: {
        vendorId: input.vendorId,
        productId: input.productId,
        platformSlug: input.platformSlug,
        boostTierId: tier.id,
        kind: input.kind ?? "SEARCH_RANK",
        status: "ACTIVE",
        categoryId: input.categoryId,
        endsAt: new Date(Date.now() + days * 86_400_000),
        priceMinor,
        spentMinor: 0,
      },
    });
  });
  return { id: boost.id, status: boost.status, endsAt: boost.endsAt.toISOString(), priceMinor };
}

export async function listMyBoosts(vendorId: string) {
  const rows = await prisma.boost.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    include: { boostTier: { select: { key: true, name: true, badge: true } } },
  });
  return {
    items: rows.map((b) => ({
      id: b.id,
      productId: b.productId,
      kind: b.kind,
      status: b.status,
      tier: b.boostTier.name,
      priceMinor: b.priceMinor,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
    })),
  };
}

export async function cancelBoost(vendorId: string, boostId: string) {
  const b = await prisma.boost.findUnique({ where: { id: boostId } });
  if (!b || b.vendorId !== vendorId) throw new AppError("NOT_FOUND", "Boost not found");
  if (b.status !== "ACTIVE") throw new AppError("CONFLICT", `Boost is ${b.status.toLowerCase()}`);
  // pro-rata: charge the elapsed fraction, refund the rest
  const total = b.endsAt.getTime() - b.startsAt.getTime();
  const used = Math.min(1, Math.max(0, (Date.now() - b.startsAt.getTime()) / total));
  const spent = Math.round(b.priceMinor * used);
  const refund = b.priceMinor - spent;
  if (spent > 0) {
    await postTxn({
      type: "RELEASE",
      memo: `Boost settle · ${boostId}`,
      lines: [
        { account: platformEscrow(b.platformSlug), direction: "DEBIT", amountMinor: spent },
        { account: platformRevenue(b.platformSlug), direction: "CREDIT", amountMinor: spent },
      ],
    });
  }
  if (refund > 0) await refundToWallet({ userId: vendorId, amountMinor: refund, platformSlug: b.platformSlug, memo: `Boost refund · ${boostId}` });
  await prisma.boost.update({ where: { id: boostId }, data: { status: "CANCELLED", spentMinor: spent } });
  return { id: boostId, status: "CANCELLED", refundMinor: refund };
}

/** Worker sweep — expire finished boosts and release their spend to REVENUE. */
export async function expireFinishedBoosts() {
  const done = await prisma.boost.findMany({ where: { status: "ACTIVE", endsAt: { lte: new Date() } } });
  for (const b of done) {
    const remaining = b.priceMinor - b.spentMinor;
    if (remaining > 0) {
      await postTxn({
        type: "RELEASE",
        memo: `Boost expiry settle · ${b.id}`,
        lines: [
          { account: platformEscrow(b.platformSlug), direction: "DEBIT", amountMinor: remaining },
          { account: platformRevenue(b.platformSlug), direction: "CREDIT", amountMinor: remaining },
        ],
      }).catch((e) => console.error("[boost expiry]", b.id, e));
    }
    await prisma.boost.update({ where: { id: b.id }, data: { status: "EXPIRED", spentMinor: b.priceMinor } });
  }
  return { expired: done.length };
}
