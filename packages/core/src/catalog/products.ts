import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { categoryBySlug } from "./categories.ts";
import { clampLimit, type Page } from "./util.ts";

export type ProductSort = "relevance" | "newest" | "price_asc" | "price_desc" | "rating";

export interface ProductListInput {
  platformSlug: string;
  categorySlug?: string;
  vendorId?: string;
  sort?: ProductSort;
  cursor?: string;
  limit?: number;
}

export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  image: string | null;
  ratingAvg: number;
  ratingCount: number;
  fromPriceMinor: number | null;
  currency: string;
  offerCount: number;
  vendorCount: number;
}

const platformFilter = (platformSlug: string) => ({
  status: "PUBLISHED" as const,
  deletedAt: null,
  OR: [{ platformSlugs: { isEmpty: true } }, { platformSlugs: { has: platformSlug } }],
});

function toCard(p: {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  ratingAvg: number;
  ratingCount: number;
  media: { fileKey: string }[];
  offers: { priceMinor: number; currency: string; vendorId: string }[];
}): ProductCard {
  const active = p.offers;
  const prices = active.map((o) => o.priceMinor);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    brand: p.brand,
    image: p.media[0]?.fileKey ?? null,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    fromPriceMinor: prices.length ? Math.min(...prices) : null,
    currency: active[0]?.currency ?? "GHS",
    offerCount: active.length,
    vendorCount: new Set(active.map((o) => o.vendorId)).size,
  };
}

export async function listProducts(input: ProductListInput): Promise<Page<ProductCard>> {
  const take = clampLimit(input.limit);
  const where: Record<string, unknown> = { ...platformFilter(input.platformSlug) };

  if (input.categorySlug) {
    const cat = await categoryBySlug(input.categorySlug);
    if (!cat) throw new AppError("NOT_FOUND", `Unknown category "${input.categorySlug}"`);
    const ids = await prisma.category.findMany({
      where: { OR: [{ id: cat.id }, { path: { startsWith: `${cat.path}/` } }] },
      select: { id: true },
    });
    where.categoryId = { in: ids.map((c) => c.id) };
  }
  if (input.vendorId) {
    where.offers = { some: { vendorId: input.vendorId, status: "ACTIVE" } };
  }

  const orderBy =
    input.sort === "newest" || input.sort === "relevance" || !input.sort
      ? [{ publishedAt: "desc" as const }, { id: "desc" as const }]
      : input.sort === "rating"
        ? [{ ratingAvg: "desc" as const }, { id: "desc" as const }]
        : [{ id: "desc" as const }];

  const rows = await prisma.product.findMany({
    where,
    orderBy,
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      media: { orderBy: { sortOrder: "asc" }, take: 1, select: { fileKey: true } },
      offers: {
        where: { status: "ACTIVE" },
        select: { priceMinor: true, currency: true, vendorId: true },
      },
    },
  });

  const hasMore = rows.length > take;
  let cards = rows.slice(0, take).map(toCard);

  if (input.sort === "price_asc") {
    cards = cards.sort((a, b) => (a.fromPriceMinor ?? Infinity) - (b.fromPriceMinor ?? Infinity));
  } else if (input.sort === "price_desc") {
    cards = cards.sort((a, b) => (b.fromPriceMinor ?? -1) - (a.fromPriceMinor ?? -1));
  }

  return { items: cards, nextCursor: hasMore ? rows[take - 1]!.id : null };
}

/** Resolve a slug (or id) to the product id, scoped to the platform. */
export async function resolveProductId(slugOrId: string, platformSlug: string): Promise<string> {
  const p = await prisma.product.findFirst({
    where: { AND: [{ OR: [{ slug: slugOrId }, { id: slugOrId }] }, platformFilter(platformSlug)] },
    select: { id: true },
  });
  if (!p) throw new AppError("NOT_FOUND", "Product not found");
  return p.id;
}

export async function getProductDetail(slugOrId: string, platformSlug: string) {
  const product = await prisma.product.findFirst({
    where: {
      AND: [{ OR: [{ slug: slugOrId }, { id: slugOrId }] }, platformFilter(platformSlug)],
    },
    include: {
      category: { select: { id: true, slug: true, name: true, path: true } },
      media: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { priceMinor: "asc" } },
      offers: {
        where: { status: "ACTIVE" },
        orderBy: { priceMinor: "asc" },
        include: {
          vendor: { select: { id: true, displayName: true, logo: true, ratingAvg: true, ratingCount: true } },
          gasListing: true,
        },
      },
      reviews: { orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { firstName: true, avatar: true } } } },
      questions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { answers: { orderBy: { createdAt: "asc" } } },
      },
      _count: { select: { reviews: true, questions: true } },
    },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");

  const prices = product.offers.map((o) => o.priceMinor);
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    brand: product.brand,
    condition: product.condition,
    attributes: product.attributes ?? {},
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    category: product.category,
    media: product.media.map((m) => ({ kind: m.kind, fileKey: m.fileKey, alt: m.alt })),
    variants: product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceMinor: v.priceMinor,
      compareAtMinor: v.compareAtMinor,
      options: v.options ?? {},
    })),
    fromPriceMinor: prices.length ? Math.min(...prices) : null,
    currency: product.offers[0]?.currency ?? "GHS",
    offers: product.offers.map((o) => ({
      id: o.id,
      priceMinor: o.priceMinor,
      currency: o.currency,
      condition: o.condition,
      fulfilment: o.fulfilment ?? {},
      vendor: o.vendor,
      gas: o.gasListing
        ? {
            cylinderType: o.gasListing.cylinderType,
            weightKg: o.gasListing.weightKg,
            capacityL: o.gasListing.capacityL,
            requiresExchange: o.gasListing.requiresExchange,
            depositMinor: o.gasListing.depositMinor,
          }
        : null,
    })),
    reviewCount: product._count.reviews,
    questionCount: product._count.questions,
    reviews: product.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: r.user.firstName ?? "Customer",
      avatar: r.user.avatar,
      at: r.createdAt.toISOString(),
    })),
    questions: product.questions.map((q) => ({
      id: q.id,
      body: q.body,
      at: q.createdAt.toISOString(),
      answers: q.answers.map((a) => ({ id: a.id, body: a.body, at: a.createdAt.toISOString() })),
    })),
  };
}
