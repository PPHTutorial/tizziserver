import { prisma, type CouponType } from "@stall/db";

export interface CouponScope {
  vendorIds?: string[];
  categorySlugs?: string[];
  firstOrderOnly?: boolean;
}

export interface CouponContext {
  userId: string;
  platformSlug: string;
  subtotalMinor: number;
  vendorIds: string[];
  categorySlugs?: string[];
}

export interface CouponEvaluation {
  valid: boolean;
  reason?: string;
  code?: string;
  type?: CouponType;
  discountMinor: number;
  freeDelivery: boolean;
}

const INVALID = (reason: string): CouponEvaluation => ({ valid: false, reason, discountMinor: 0, freeDelivery: false });

/** Validate a coupon against a cart context and compute its discount (no writes). */
export async function evaluateCoupon(code: string, ctx: CouponContext): Promise<CouponEvaluation> {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon) return INVALID("Coupon not found");
  if (coupon.status !== "ACTIVE") return INVALID("Coupon is not active");
  if (coupon.platformSlug && coupon.platformSlug !== ctx.platformSlug) return INVALID("Coupon isn't valid on this store");

  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) return INVALID("Coupon isn't active yet");
  if (coupon.endsAt && coupon.endsAt.getTime() < now) return INVALID("Coupon has expired");
  if (coupon.minSpendMinor && ctx.subtotalMinor < coupon.minSpendMinor) {
    return INVALID(`Spend at least ${(coupon.minSpendMinor / 100).toFixed(2)} to use this coupon`);
  }

  const scope = (coupon.scope ?? {}) as CouponScope;
  if (scope.vendorIds?.length && !ctx.vendorIds.some((v) => scope.vendorIds!.includes(v))) {
    return INVALID("Coupon doesn't apply to items in your cart");
  }
  if (scope.categorySlugs?.length && ctx.categorySlugs && !ctx.categorySlugs.some((c) => scope.categorySlugs!.includes(c))) {
    return INVALID("Coupon doesn't apply to items in your cart");
  }

  // redemption limits
  if (coupon.maxRedemptions != null) {
    const total = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    if (total >= coupon.maxRedemptions) return INVALID("Coupon has been fully redeemed");
  }
  const perUser = coupon.perUserLimit ?? 1;
  const mine = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId: ctx.userId } });
  if (mine >= perUser) return INVALID("You've already used this coupon");

  if (scope.firstOrderOnly) {
    const priorOrders = await prisma.order.count({
      where: { customerId: ctx.userId, status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } },
    });
    if (priorOrders > 0) return INVALID("Coupon is for your first order only");
  }

  let discountMinor = 0;
  let freeDelivery = false;
  if (coupon.type === "PERCENT") discountMinor = Math.min(ctx.subtotalMinor, Math.round((ctx.subtotalMinor * coupon.value) / 10_000));
  else if (coupon.type === "FIXED") discountMinor = Math.min(ctx.subtotalMinor, coupon.value);
  else freeDelivery = true;

  return { valid: true, code: coupon.code, type: coupon.type, discountMinor, freeDelivery };
}

/** Public coupons a shopper could apply on this platform (coupon centre). */
export async function listCoupons(platformSlug: string) {
  const now = new Date();
  const rows = await prisma.coupon.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ platformSlug }, { platformSlug: null }],
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((c) => ({
    code: c.code,
    type: c.type,
    value: c.value,
    minSpendMinor: c.minSpendMinor,
    endsAt: c.endsAt?.toISOString() ?? null,
  }));
}
