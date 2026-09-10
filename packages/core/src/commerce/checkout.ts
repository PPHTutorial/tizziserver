import type { FulfilmentMethod } from "@stall/db";
import { AppError } from "../errors.ts";
import { getCart, type CartView } from "./cart.ts";
import { evaluateCoupon } from "./coupons.ts";
import { applyBps, checkoutFeeConfig } from "./money.ts";

export interface QuoteInput {
  userId: string;
  platformSlug: string;
  fulfilmentMethod?: FulfilmentMethod;
  couponCode?: string;
}

export interface QuoteLine {
  key: "subtotal" | "discount" | "delivery" | "service" | "tax" | "total";
  label: string;
  amountMinor: number;
}

export interface CheckoutQuote {
  currency: string;
  fulfilmentMethod: FulfilmentMethod;
  itemsSubtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  serviceFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: QuoteLine[];
  couponCode: string | null;
  couponValid: boolean;
  couponReason: string | null;
  freeDelivery: boolean;
  vendorBreakdown: { vendorId: string; vendorName: string; subtotalMinor: number }[];
  itemCount: number;
  unavailableItemIds: string[];
}

/**
 * Price a checkout from the caller's active cart. Pure read — no writes, no
 * inventory holds. `couponCode` overrides whatever is stored on the cart.
 */
export async function quoteCheckout(input: QuoteInput, cartOverride?: CartView): Promise<CheckoutQuote> {
  const cart = cartOverride ?? (await getCart({ userId: input.userId, platformSlug: input.platformSlug }));
  if (cart.groups.length === 0) throw new AppError("VALIDATION", "Your cart is empty");

  const method: FulfilmentMethod = input.fulfilmentMethod ?? "DELIVERY";
  const fees = await checkoutFeeConfig(input.platformSlug);
  const itemsSubtotalMinor = cart.subtotalMinor;

  // Coupon: an explicit code re-evaluates; otherwise use what the cart resolved.
  let couponCode = cart.couponCode;
  let couponValid = cart.couponValid;
  let couponReason: string | null = null;
  let discountMinor = cart.couponValid ? cart.couponDiscountMinor : 0;
  let freeDelivery = cart.couponValid ? cart.freeDelivery : false;

  if (input.couponCode !== undefined && input.couponCode.trim().toUpperCase() !== (cart.couponCode ?? "")) {
    const evaln = await evaluateCoupon(input.couponCode, {
      userId: input.userId,
      platformSlug: input.platformSlug,
      subtotalMinor: itemsSubtotalMinor,
      vendorIds: cart.groups.map((g) => g.vendorId),
      categorySlugs: cart.groups.flatMap((g) => g.items.map((i) => i.categorySlug).filter(Boolean) as string[]),
    });
    couponCode = input.couponCode.trim().toUpperCase();
    couponValid = evaln.valid;
    couponReason = evaln.reason ?? null;
    discountMinor = evaln.valid ? evaln.discountMinor : 0;
    freeDelivery = evaln.valid ? evaln.freeDelivery : false;
  }

  const netAfterDiscount = Math.max(0, itemsSubtotalMinor - discountMinor);
  const deliveryFeeMinor =
    method === "PICKUP" || freeDelivery || itemsSubtotalMinor >= fees.freeDeliveryThresholdMinor
      ? 0
      : fees.deliveryFlatMinor;
  const serviceFeeMinor = applyBps(netAfterDiscount, fees.serviceFeeBps);
  const taxMinor = applyBps(netAfterDiscount, fees.taxBps);
  const totalMinor = netAfterDiscount + deliveryFeeMinor + serviceFeeMinor + taxMinor;

  const lines: QuoteLine[] = [
    { key: "subtotal", label: "Items subtotal", amountMinor: itemsSubtotalMinor },
    ...(discountMinor > 0 ? [{ key: "discount" as const, label: "Discount", amountMinor: -discountMinor }] : []),
    { key: "delivery", label: method === "PICKUP" ? "Pickup" : "Delivery fee", amountMinor: deliveryFeeMinor },
    { key: "service", label: "Service fee", amountMinor: serviceFeeMinor },
    ...(taxMinor > 0 ? [{ key: "tax" as const, label: "Tax", amountMinor: taxMinor }] : []),
    { key: "total", label: "Total", amountMinor: totalMinor },
  ];

  return {
    currency: cart.currency,
    fulfilmentMethod: method,
    itemsSubtotalMinor,
    discountMinor,
    deliveryFeeMinor,
    serviceFeeMinor,
    taxMinor,
    totalMinor,
    lines,
    couponCode: couponCode ?? null,
    couponValid,
    couponReason,
    freeDelivery,
    vendorBreakdown: cart.groups.map((g) => ({ vendorId: g.vendorId, vendorName: g.vendorName, subtotalMinor: g.subtotalMinor })),
    itemCount: cart.itemCount,
    unavailableItemIds: cart.groups.flatMap((g) => g.items.filter((i) => !i.available).map((i) => i.id)),
  };
}
