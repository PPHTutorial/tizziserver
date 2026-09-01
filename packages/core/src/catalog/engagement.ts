import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { clampLimit } from "./util.ts";

// --- wishlist -------------------------------------------------------

export async function addToWishlist(userId: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
  return { wished: true };
}

export async function removeFromWishlist(userId: string, productId: string) {
  await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  return { wished: false };
}

export async function listWishlist(userId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        include: {
          media: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileKey: true } },
          offers: { where: { status: "ACTIVE" }, select: { priceMinor: true, currency: true } },
        },
      },
    },
  });
  return rows.map((w) => ({
    productId: w.productId,
    slug: w.product.slug,
    title: w.product.title,
    image: w.product.media[0]?.fileKey ?? null,
    fromPriceMinor: w.product.offers.length ? Math.min(...w.product.offers.map((o) => o.priceMinor)) : null,
    currency: w.product.offers[0]?.currency ?? "GHS",
  }));
}

// --- recently viewed --------------------------------------------

export async function recordView(userId: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { recorded: false };
  await prisma.recentlyViewed.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: { at: new Date() },
  });
  return { recorded: true };
}

export async function listRecentlyViewed(userId: string, limit?: number) {
  const rows = await prisma.recentlyViewed.findMany({
    where: { userId },
    orderBy: { at: "desc" },
    take: clampLimit(limit, 12, 40),
    include: {
      product: {
        include: {
          media: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileKey: true } },
          offers: { where: { status: "ACTIVE" }, select: { priceMinor: true, currency: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    productId: r.productId,
    slug: r.product.slug,
    title: r.product.title,
    image: r.product.media[0]?.fileKey ?? null,
    fromPriceMinor: r.product.offers.length ? Math.min(...r.product.offers.map((o) => o.priceMinor)) : null,
    currency: r.product.offers[0]?.currency ?? "GHS",
  }));
}

// --- reviews + Q&A --------------------------------------------

export async function addReview(input: {
  userId: string;
  productId: string;
  rating: number;
  title?: string;
  body?: string;
}) {
  if (input.rating < 1 || input.rating > 5) throw new AppError("VALIDATION", "Rating must be 1–5");
  const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true } });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");

  await prisma.productReview.upsert({
    where: { productId_userId: { productId: input.productId, userId: input.userId } },
    create: { productId: input.productId, userId: input.userId, rating: input.rating, title: input.title, body: input.body },
    update: { rating: input.rating, title: input.title, body: input.body },
  });

  // Recompute the aggregate.
  const agg = await prisma.productReview.aggregate({
    where: { productId: input.productId },
    _avg: { rating: true },
    _count: true,
  });
  await prisma.product.update({
    where: { id: input.productId },
    data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
  });
  return { rating: input.rating, ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count };
}

export async function askQuestion(userId: string, productId: string, body: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  const q = await prisma.productQuestion.create({ data: { userId, productId, body } });
  return { id: q.id };
}

export async function answerQuestion(userId: string, questionId: string, body: string) {
  const question = await prisma.productQuestion.findUnique({ where: { id: questionId } });
  if (!question) throw new AppError("NOT_FOUND", "Question not found");
  const a = await prisma.productAnswer.create({ data: { questionId, answeredById: userId, body } });
  return { id: a.id };
}
