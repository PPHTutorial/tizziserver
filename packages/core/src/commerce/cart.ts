import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { evaluateCoupon } from "./coupons.ts";

const MAX_QTY = 99;

async function ensureCart(userId: string, platformSlug: string) {
  return prisma.cart.upsert({
    where: { userId_platformSlug: { userId, platformSlug } },
    create: { userId, platformSlug },
    update: {},
  });
}

interface OfferLoad {
  id: string;
  priceMinor: number;
  currency: string;
  status: string;
  vendorId: string;
  vendorName: string;
  product: { id: string; title: string; slug: string; status: string; platformSlugs: string[]; image: string | null; categorySlug: string | null };
}

async function loadOffer(offerId: string): Promise<OfferLoad> {
  const o = await prisma.vendorOffer.findUnique({
    where: { id: offerId },
    include: {
      vendor: { select: { id: true, displayName: true } },
      product: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          platformSlugs: true,
          media: { orderBy: { sortOrder: "asc" }, take: 1, select: { fileKey: true } },
          category: { select: { slug: true } },
        },
      },
    },
  });
  if (!o) throw new AppError("NOT_FOUND", "That offer no longer exists");
  return {
    id: o.id,
    priceMinor: o.priceMinor,
    currency: o.currency,
    status: o.status,
    vendorId: o.vendorId,
    vendorName: o.vendor.displayName,
    product: {
      id: o.product.id,
      title: o.product.title,
      slug: o.product.slug,
      status: o.product.status,
      platformSlugs: o.product.platformSlugs,
      image: o.product.media[0]?.fileKey ?? null,
      categorySlug: o.product.category?.slug ?? null,
    },
  };
}

function assertPurchasable(offer: OfferLoad, platformSlug: string) {
  const tenantOk = offer.product.platformSlugs.length === 0 || offer.product.platformSlugs.includes(platformSlug);
  if (!tenantOk) throw new AppError("NOT_FOUND", "That product isn't available on this store");
  if (offer.product.status !== "PUBLISHED") throw new AppError("CONFLICT", "That product is no longer published");
  if (offer.status !== "ACTIVE") throw new AppError("CONFLICT", "That seller's offer is currently unavailable");
}

export async function addToCart(input: {
  userId: string;
  platformSlug: string;
  offerId: string;
  variantId?: string;
  qty?: number;
}) {
  const qty = Math.min(Math.max(1, Math.trunc(input.qty ?? 1)), MAX_QTY);
  const offer = await loadOffer(input.offerId);
  assertPurchasable(offer, input.platformSlug);

  let unitPriceMinor = offer.priceMinor;
  if (input.variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: input.variantId, productId: offer.product.id },
    });
    if (!variant) throw new AppError("VALIDATION", "That variant doesn't belong to this product");
    unitPriceMinor = variant.priceMinor;
  }

  const cart = await ensureCart(input.userId, input.platformSlug);
  const existing = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, offerId: offer.id, variantId: input.variantId ?? null },
  });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { qty: Math.min(existing.qty + qty, MAX_QTY), unitPriceMinor, savedForLater: false },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        offerId: offer.id,
        productId: offer.product.id,
        variantId: input.variantId ?? null,
        vendorId: offer.vendorId,
        titleSnapshot: offer.product.title,
        imageKey: offer.product.image,
        qty,
        unitPriceMinor,
      },
    });
  }
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return getCart({ userId: input.userId, platformSlug: input.platformSlug });
}

async function ownItem(userId: string, itemId: string) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } }, include: { cart: true } });
  if (!item) throw new AppError("NOT_FOUND", "Cart item not found");
  return item;
}

export async function updateCartItem(input: { userId: string; itemId: string; qty: number }) {
  const item = await ownItem(input.userId, input.itemId);
  const qty = Math.trunc(input.qty);
  if (qty <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
  } else {
    await prisma.cartItem.update({ where: { id: item.id }, data: { qty: Math.min(qty, MAX_QTY) } });
  }
  return getCart({ userId: input.userId, platformSlug: item.cart.platformSlug });
}

export async function removeCartItem(input: { userId: string; itemId: string }) {
  const item = await ownItem(input.userId, input.itemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
  return getCart({ userId: input.userId, platformSlug: item.cart.platformSlug });
}

export async function setSavedForLater(input: { userId: string; itemId: string; saved: boolean }) {
  const item = await ownItem(input.userId, input.itemId);
  await prisma.cartItem.update({ where: { id: item.id }, data: { savedForLater: input.saved } });
  return getCart({ userId: input.userId, platformSlug: item.cart.platformSlug });
}

export async function clearCart(input: { userId: string; platformSlug: string; includeSaved?: boolean }) {
  const cart = await ensureCart(input.userId, input.platformSlug);
  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id, ...(input.includeSaved ? {} : { savedForLater: false }) },
  });
  await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  return getCart({ userId: input.userId, platformSlug: input.platformSlug });
}

export async function applyCoupon(input: { userId: string; platformSlug: string; code: string }) {
  const view = await getCart({ userId: input.userId, platformSlug: input.platformSlug });
  const evaln = await evaluateCoupon(input.code, {
    userId: input.userId,
    platformSlug: input.platformSlug,
    subtotalMinor: view.subtotalMinor,
    vendorIds: view.groups.map((g) => g.vendorId),
    categorySlugs: view.groups.flatMap((g) => g.items.map((i) => i.categorySlug).filter(Boolean) as string[]),
  });
  if (!evaln.valid) throw new AppError("VALIDATION", evaln.reason ?? "Coupon can't be applied");
  await prisma.cart.update({
    where: { userId_platformSlug: { userId: input.userId, platformSlug: input.platformSlug } },
    data: { couponCode: evaln.code },
  });
  return getCart({ userId: input.userId, platformSlug: input.platformSlug });
}

export async function removeCoupon(input: { userId: string; platformSlug: string }) {
  await prisma.cart.updateMany({
    where: { userId: input.userId, platformSlug: input.platformSlug },
    data: { couponCode: null },
  });
  return getCart({ userId: input.userId, platformSlug: input.platformSlug });
}

export interface CartItemView {
  id: string;
  offerId: string;
  productId: string;
  productSlug: string;
  variantId: string | null;
  title: string;
  image: string | null;
  categorySlug: string | null;
  qty: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currentUnitPriceMinor: number;
  priceChanged: boolean;
  available: boolean;
}

export interface CartGroup {
  vendorId: string;
  vendorName: string;
  items: CartItemView[];
  subtotalMinor: number;
}

export interface CartView {
  id: string;
  platformSlug: string;
  currency: string;
  couponCode: string | null;
  couponValid: boolean;
  couponDiscountMinor: number;
  freeDelivery: boolean;
  groups: CartGroup[];
  itemCount: number;
  subtotalMinor: number;
  savedForLater: CartItemView[];
}

export async function getCart(input: { userId: string; platformSlug: string }): Promise<CartView> {
  const cart = await ensureCart(input.userId, input.platformSlug);
  const rows = await prisma.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { addedAt: "asc" } });

  // Revalidate every line against live offers in one pass.
  const offers = await prisma.vendorOffer.findMany({
    where: { id: { in: rows.map((r) => r.offerId) } },
    include: {
      vendor: { select: { displayName: true } },
      product: { select: { slug: true, status: true, platformSlugs: true, category: { select: { slug: true } } } },
    },
  });
  const offerById = new Map(offers.map((o) => [o.id, o]));

  const toView = (r: (typeof rows)[number]): CartItemView => {
    const o = offerById.get(r.offerId);
    const currentUnitPriceMinor = o?.priceMinor ?? r.unitPriceMinor;
    const tenantOk =
      !o || o.product.platformSlugs.length === 0 || o.product.platformSlugs.includes(input.platformSlug);
    const available = Boolean(o) && o!.status === "ACTIVE" && o!.product.status === "PUBLISHED" && tenantOk;
    return {
      id: r.id,
      offerId: r.offerId,
      productId: r.productId,
      productSlug: o?.product.slug ?? "",
      variantId: r.variantId,
      title: r.titleSnapshot,
      image: r.imageKey,
      categorySlug: o?.product.category?.slug ?? null,
      qty: r.qty,
      unitPriceMinor: r.unitPriceMinor,
      lineTotalMinor: r.unitPriceMinor * r.qty,
      currentUnitPriceMinor,
      priceChanged: currentUnitPriceMinor !== r.unitPriceMinor,
      available,
    };
  };

  const activeRows = rows.filter((r) => !r.savedForLater);
  const active = activeRows.map(toView);
  const saved = rows.filter((r) => r.savedForLater).map(toView);

  const byVendor = new Map<string, CartGroup>();
  activeRows.forEach((r, i) => {
    const v = active[i]!;
    const g = byVendor.get(r.vendorId) ?? {
      vendorId: r.vendorId,
      vendorName: offerById.get(r.offerId)?.vendor.displayName ?? "Seller",
      items: [],
      subtotalMinor: 0,
    };
    g.items.push(v);
    g.subtotalMinor += v.lineTotalMinor;
    byVendor.set(r.vendorId, g);
  });
  const groups = [...byVendor.values()];
  const subtotalMinor = groups.reduce((s, g) => s + g.subtotalMinor, 0);

  let couponValid = false;
  let couponDiscountMinor = 0;
  let freeDelivery = false;
  if (cart.couponCode && active.length) {
    const evaln = await evaluateCoupon(cart.couponCode, {
      userId: input.userId,
      platformSlug: input.platformSlug,
      subtotalMinor,
      vendorIds: groups.map((g) => g.vendorId),
      categorySlugs: active.map((i) => i.categorySlug).filter(Boolean) as string[],
    });
    couponValid = evaln.valid;
    couponDiscountMinor = evaln.discountMinor;
    freeDelivery = evaln.freeDelivery;
  }

  return {
    id: cart.id,
    platformSlug: input.platformSlug,
    currency: cart.currency,
    couponCode: cart.couponCode,
    couponValid,
    couponDiscountMinor,
    freeDelivery,
    groups,
    itemCount: active.reduce((n, i) => n + i.qty, 0),
    subtotalMinor,
    savedForLater: saved,
  };
}
