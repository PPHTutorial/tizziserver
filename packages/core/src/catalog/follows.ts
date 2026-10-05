import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { clampLimit } from "./util.ts";

/** Storefront follow state for the vendor page header. */
export async function vendorFollowState(vendorId: string, userId?: string) {
  const [followers, mine] = await Promise.all([
    prisma.vendorFollow.count({ where: { vendorId } }),
    userId ? prisma.vendorFollow.findUnique({ where: { userId_vendorId: { userId, vendorId } } }) : null,
  ]);
  return { followerCount: followers, isFollowing: mine != null };
}

async function requireFollowableVendor(vendorId: string, platformSlug: string) {
  const vendor = await prisma.vendorProfile.findFirst({
    where: { id: vendorId, status: "ACTIVE", deletedAt: null, platformIds: { has: platformSlug } },
    select: { id: true, userId: true },
  });
  if (!vendor) throw new AppError("NOT_FOUND", "Vendor not found");
  return vendor;
}

/** Idempotent — following twice is a no-op. Vendors can't follow themselves. */
export async function followVendor(userId: string, vendorId: string, platformSlug: string) {
  const vendor = await requireFollowableVendor(vendorId, platformSlug);
  if (vendor.userId === userId) throw new AppError("VALIDATION", "You can't follow your own store");
  await prisma.vendorFollow.upsert({
    where: { userId_vendorId: { userId, vendorId } },
    create: { userId, vendorId },
    update: {},
  });
  return vendorFollowState(vendorId, userId);
}

/** Idempotent — unfollowing a store you don't follow is a no-op. */
export async function unfollowVendor(userId: string, vendorId: string) {
  await prisma.vendorFollow.deleteMany({ where: { userId, vendorId } });
  return vendorFollowState(vendorId, userId);
}

/** The caller's followed storefronts, newest first (keyset on follow id). */
export async function listFollowedVendors(userId: string, platformSlug: string, opts: { cursor?: string; limit?: number } = {}) {
  const take = clampLimit(opts.limit);
  const rows = await prisma.vendorFollow.findMany({
    where: { userId, vendor: { status: "ACTIVE", deletedAt: null, platformIds: { has: platformSlug } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      vendor: {
        select: { id: true, displayName: true, logo: true, ratingAvg: true, ratingCount: true, verifiedAt: true },
      },
    },
  });
  const page = rows.slice(0, take);
  return {
    items: page.map((r) => ({
      id: r.vendor.id,
      displayName: r.vendor.displayName,
      logo: r.vendor.logo,
      ratingAvg: r.vendor.ratingAvg,
      ratingCount: r.vendor.ratingCount,
      verified: r.vendor.verifiedAt != null,
      followedAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > take ? page[page.length - 1]!.id : null,
  };
}
