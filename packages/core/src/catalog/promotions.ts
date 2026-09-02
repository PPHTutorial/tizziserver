import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";

export type PromotionKind = "FLASH_DEAL" | "CAMPAIGN" | "BANNER";

export interface PromotionItemCard {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  image: string | null;
  currency: string;
  /** the cheapest active offer */
  priceMinor: number | null;
  /** discounted price for FLASH_DEAL items, else null */
  dealPriceMinor: number | null;
  discountBps: number | null;
}

export interface PromotionView {
  slug: string;
  kind: PromotionKind;
  title: string;
  subtitle: string | null;
  imageKey: string | null;
  ctaRoute: string | null;
  endsAt: string | null;
  items: PromotionItemCard[];
}

const now = () => new Date();

const activeWhere = (platformSlug: string) => ({
  isActive: true,
  OR: [{ platformSlugs: { isEmpty: true } }, { platformSlugs: { has: platformSlug } }],
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: now() } }] },
    { OR: [{ endsAt: null }, { endsAt: { gte: now() } }] },
  ],
});

function toCard(row: {
  productId: string;
  discountBps: number | null;
  product: {
    slug: string;
    title: string;
    brand: string | null;
    media: { fileKey: string }[];
    offers: { priceMinor: number; currency: string }[];
  };
}): PromotionItemCard {
  const prices = row.product.offers.map((o) => o.priceMinor);
  const priceMinor = prices.length ? Math.min(...prices) : null;
  const dealPriceMinor =
    priceMinor != null && row.discountBps
      ? Math.round(priceMinor * (1 - row.discountBps / 10_000))
      : null;
  return {
    productId: row.productId,
    slug: row.product.slug,
    title: row.product.title,
    brand: row.product.brand,
    image: row.product.media[0]?.fileKey ?? null,
    currency: row.product.offers[0]?.currency ?? "GHS",
    priceMinor,
    dealPriceMinor,
    discountBps: row.discountBps,
  };
}

const itemInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    product: {
      select: {
        slug: true,
        title: true,
        brand: true,
        status: true,
        media: { take: 1, orderBy: { sortOrder: "asc" as const }, select: { fileKey: true } },
        offers: { where: { status: "ACTIVE" as const }, select: { priceMinor: true, currency: true } },
      },
    },
  },
};

export async function activePromotions(input: { platformSlug: string; kind?: PromotionKind }): Promise<PromotionView[]> {
  const rows = await prisma.promotion.findMany({
    where: { ...activeWhere(input.platformSlug), ...(input.kind ? { kind: input.kind } : {}) },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: { items: itemInclude },
  });

  return rows.map((p) => ({
    slug: p.slug,
    kind: p.kind as PromotionKind,
    title: p.title,
    subtitle: p.subtitle,
    imageKey: p.imageKey,
    ctaRoute: p.ctaRoute,
    endsAt: p.endsAt?.toISOString() ?? null,
    items: p.items
      .filter((i) => i.product.status === "PUBLISHED")
      .map((i) => toCard({ productId: i.productId, discountBps: i.discountBps, product: i.product })),
  }));
}

export async function promotionBySlug(slug: string, platformSlug: string): Promise<PromotionView> {
  const p = await prisma.promotion.findFirst({
    where: { slug, ...activeWhere(platformSlug) },
    include: { items: itemInclude },
  });
  if (!p) throw new AppError("NOT_FOUND", "Promotion not found or not running");
  return {
    slug: p.slug,
    kind: p.kind as PromotionKind,
    title: p.title,
    subtitle: p.subtitle,
    imageKey: p.imageKey,
    ctaRoute: p.ctaRoute,
    endsAt: p.endsAt?.toISOString() ?? null,
    items: p.items
      .filter((i) => i.product.status === "PUBLISHED")
      .map((i) => toCard({ productId: i.productId, discountBps: i.discountBps, product: i.product })),
  };
}
