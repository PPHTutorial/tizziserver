/**
 * Ad serving — picks sponsored creatives for a placement slot and returns
 * hydrated cards, and exposes the search-rank boost map the catalog ranker uses.
 *
 * Serving does NOT log impressions itself (the caller decides when a card was
 * actually rendered) — use `ads.recordImpressions` with the returned `token`s.
 */
import { prisma, type AdPlacementSlot } from "@stall/db";

export interface SponsoredCard {
  campaignId: string;
  adId: string | null;
  slot: AdPlacementSlot;
  creativeKind: string;
  headline: string | null;
  subtext: string | null;
  imageKey: string | null;
  destinationRoute: string | null;
  badge: string | null;
  product: {
    id: string;
    slug: string;
    title: string;
    brand: string | null;
    image: string | null;
    fromPriceMinor: number | null;
    currency: string;
    ratingAvg: number;
  } | null;
}

function weightedShuffle<T extends { weight: number }>(rows: T[]): T[] {
  return rows
    .map((r) => ({ r, k: Math.random() ** (1 / Math.max(1, r.weight)) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.r);
}

export async function sponsoredCards(input: {
  platformSlug: string;
  slot: AdPlacementSlot;
  categoryId?: string;
  limit?: number;
}): Promise<{ items: SponsoredCard[] }> {
  const limit = Math.min(Math.max(1, input.limit ?? 3), 10);
  const ads = await prisma.advertisement.findMany({
    where: {
      isActive: true,
      slot: input.slot,
      campaign: { status: "ACTIVE", platformSlug: input.platformSlug },
    },
    include: { campaign: { select: { id: true, targeting: true, boostTier: { select: { badge: true } } } } },
    take: 60,
  });

  const matched = ads.filter((a) => {
    const t = (a.campaign.targeting ?? {}) as { categoryIds?: string[] };
    if (input.categoryId && t.categoryIds?.length) return t.categoryIds.includes(input.categoryId);
    return true;
  });

  const chosen = weightedShuffle(matched).slice(0, limit);
  const productIds = chosen.map((a) => a.productId).filter((x): x is string => !!x);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true, slug: true, title: true, brand: true, ratingAvg: true,
          media: { orderBy: { sortOrder: "asc" }, take: 1, select: { fileKey: true } },
          offers: { where: { status: "ACTIVE" }, select: { priceMinor: true, currency: true } },
        },
      })
    : [];
  const pmap = new Map(products.map((p) => [p.id, p]));

  return {
    items: chosen.map((a) => {
      const p = a.productId ? pmap.get(a.productId) : undefined;
      return {
        campaignId: a.campaignId,
        adId: a.id,
        slot: a.slot,
        creativeKind: a.creativeKind,
        headline: a.headline,
        subtext: a.subtext,
        imageKey: a.imageKey,
        destinationRoute: a.destinationRoute,
        badge: a.campaign.boostTier?.badge ?? "Sponsored",
        product: p
          ? {
              id: p.id,
              slug: p.slug,
              title: p.title,
              brand: p.brand,
              image: p.media[0]?.fileKey ?? null,
              fromPriceMinor: p.offers.length ? Math.min(...p.offers.map((o) => o.priceMinor)) : null,
              currency: p.offers[0]?.currency ?? "GHS",
              ratingAvg: p.ratingAvg,
            }
          : null,
      };
    }),
  };
}

/**
 * productId → rank multiplier (bps, 10000 = neutral) for the search / category
 * ranker. Comes from ACTIVE campaigns promoting the product (via `CampaignItem`)
 * and from direct `Boost` rows — the strongest wins.
 */
export async function rankBoostMap(platformSlug: string, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const now = new Date();
  const [campaignItems, boosts] = await Promise.all([
    prisma.campaignItem.findMany({
      where: { productId: { in: productIds }, campaign: { status: "ACTIVE", platformSlug } },
      select: { productId: true, campaign: { select: { boostTier: { select: { rankBoostBps: true } } } } },
    }),
    prisma.boost.findMany({
      where: { productId: { in: productIds }, platformSlug, status: "ACTIVE", endsAt: { gt: now } },
      select: { productId: true, boostTier: { select: { rankBoostBps: true } } },
    }),
  ]);
  const out = new Map<string, number>();
  const bump = (pid: string, bps: number) => out.set(pid, Math.max(out.get(pid) ?? 10000, bps));
  for (const ci of campaignItems) bump(ci.productId, ci.campaign.boostTier?.rankBoostBps ?? 10000);
  for (const b of boosts) bump(b.productId, b.boostTier?.rankBoostBps ?? 10000);
  return out;
}
