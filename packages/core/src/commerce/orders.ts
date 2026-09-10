import { prisma, Prisma, type FulfilmentMethod, type OrderStatus } from "@stall/db";
import { AppError } from "../errors.ts";
import { randomToken } from "../crypto.ts";
import {
  gatewayClearing,
  platformEscrow,
  platformRevenue,
  postTxn,
  vendorPayable,
  type AccountRef,
} from "../wallet/ledger.ts";
import { payFromWallet, refundToWallet } from "../wallet/wallet.ts";
import { gatewayFor } from "../payments/providers.ts";
import { addressSnapshot, getAddress } from "./addresses.ts";
import { getCart } from "./cart.ts";
import { quoteCheckout } from "./checkout.ts";
import { qualifyReferralForOrder } from "../referrals/index.ts";
import { attributeConversion } from "../ads/rollup.ts";
import { commissionBps } from "./money.ts";
import { ensureDeliveryForVendorOrder } from "../delivery/deliveries.ts";
import { generateInvoicePdf } from "./invoice.ts";

const CUR = "GHS";

function orderNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear().toString().slice(2)}${`${d.getMonth() + 1}`.padStart(2, "0")}${`${d.getDate()}`.padStart(2, "0")}`;
  return `ST-${ymd}-${randomToken(4).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6).padEnd(6, "0")}`;
}

// --------------------------------------------------------------- read side

export type OrderDetail = Awaited<ReturnType<typeof getOrder>>;

const orderInclude = {
  vendorOrders: { include: { items: true, fulfilment: true, returns: true, vendor: { select: { displayName: true } } } },
  events: { orderBy: { at: "asc" } },
  refunds: true,
  invoice: true,
} satisfies Prisma.OrderInclude;

function shapeReturn(r: { id: string; reason: string; status: string; items: Prisma.JsonValue; resolution: string | null; createdAt: Date }) {
  return { id: r.id, reason: r.reason, status: r.status, items: r.items, resolution: r.resolution, createdAt: r.createdAt.toISOString() };
}

function shapeOrder(o: Prisma.OrderGetPayload<{ include: typeof orderInclude }>) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    platformSlug: o.platformSlug,
    currency: o.currency,
    itemsSubtotalMinor: o.itemsSubtotalMinor,
    discountMinor: o.discountMinor,
    couponCode: o.couponCode,
    deliveryFeeMinor: o.deliveryFeeMinor,
    serviceFeeMinor: o.serviceFeeMinor,
    taxMinor: o.taxMinor,
    totalMinor: o.totalMinor,
    fulfilmentMethod: o.fulfilmentMethod,
    paymentMethod: o.paymentMethod,
    address: o.addressSnapshot,
    placedAt: o.placedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    vendorOrders: o.vendorOrders.map((vo) => ({
      id: vo.id,
      number: vo.number,
      vendorId: vo.vendorId,
      vendorName: vo.vendor.displayName,
      status: vo.status,
      subtotalMinor: vo.subtotalMinor,
      commissionMinor: vo.commissionMinor,
      payoutMinor: vo.payoutMinor,
      fulfilment: vo.fulfilment
        ? { method: vo.fulfilment.method, status: vo.fulfilment.status, pickupCode: vo.fulfilment.pickupCode, deliveryId: vo.fulfilment.deliveryId }
        : null,
      returns: vo.returns.map(shapeReturn),
      items: vo.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        offerId: it.offerId,
        variantId: it.variantId,
        title: it.titleSnapshot,
        image: it.imageKey,
        qty: it.qty,
        unitPriceMinor: it.unitPriceMinor,
        totalMinor: it.totalMinor,
      })),
    })),
    events: o.events.map((e) => ({ type: e.type, actorType: e.actorType, at: e.at.toISOString(), data: e.data })),
    refunds: o.refunds.map((r) => ({ id: r.id, amountMinor: r.amountMinor, reason: r.reason, status: r.status, at: r.createdAt.toISOString() })),
    invoice: o.invoice ? { number: o.invoice.number, issuedAt: o.invoice.issuedAt.toISOString() } : null,
  };
}

export async function getOrder(userId: string, orderId: string) {
  const o = await prisma.order.findFirst({ where: { id: orderId, customerId: userId }, include: orderInclude });
  if (!o) throw new AppError("NOT_FOUND", "Order not found");
  return shapeOrder(o);
}

export async function listOrders(
  userId: string,
  opts: { status?: OrderStatus; cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 20)), 50);
  const rows = await prisma.order.findMany({
    where: { customerId: userId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { vendorOrders: { select: { vendorId: true, status: true, items: { select: { qty: true, imageKey: true } } } } },
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  return {
    items: rows.slice(0, limit).map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      totalMinor: o.totalMinor,
      currency: o.currency,
      itemCount: o.vendorOrders.reduce((n, vo) => n + vo.items.reduce((m, it) => m + it.qty, 0), 0),
      vendorCount: o.vendorOrders.length,
      thumbs: o.vendorOrders.flatMap((vo) => vo.items.map((it) => it.imageKey).filter(Boolean)).slice(0, 4),
      createdAt: o.createdAt.toISOString(),
      placedAt: o.placedAt?.toISOString() ?? null,
    })),
    nextCursor,
  };
}

// --------------------------------------------------------------- place order

export interface PlaceOrderInput {
  userId: string;
  platformSlug: string;
  addressId?: string;
  fulfilmentMethod?: FulfilmentMethod;
  couponCode?: string;
  payment: { method: "wallet" | "gateway"; gateway?: string };
}

async function releaseReservations(vendorOrderIds: string[]) {
  const items = await prisma.orderItem.findMany({ where: { vendorOrderId: { in: vendorOrderIds }, variantId: { not: null } } });
  const vendorByVo = new Map(
    (await prisma.vendorOrder.findMany({ where: { id: { in: vendorOrderIds } }, select: { id: true, vendorId: true } })).map(
      (v) => [v.id, v.vendorId],
    ),
  );
  await Promise.all(
    items.map((it) =>
      prisma.inventory.updateMany({
        where: { variantId: it.variantId!, vendorId: vendorByVo.get(it.vendorOrderId) },
        data: { reserved: { decrement: it.qty } },
      }),
    ),
  );
}

export async function placeOrder(input: PlaceOrderInput) {
  const method: FulfilmentMethod = input.fulfilmentMethod ?? "DELIVERY";
  const cart = await getCart({ userId: input.userId, platformSlug: input.platformSlug });
  if (cart.groups.length === 0) throw new AppError("VALIDATION", "Your cart is empty");

  const blocked = cart.groups.flatMap((g) => g.items).filter((i) => !i.available);
  if (blocked.length) throw new AppError("CONFLICT", "Some items are no longer available — please review your cart", { itemIds: blocked.map((i) => i.id) });

  let addr: Awaited<ReturnType<typeof getAddress>> | null = null;
  if (method !== "PICKUP") {
    if (!input.addressId) throw new AppError("VALIDATION", "A delivery address is required");
    addr = await getAddress(input.userId, input.addressId);
  }

  const quote = await quoteCheckout(
    { userId: input.userId, platformSlug: input.platformSlug, fulfilmentMethod: method, couponCode: input.couponCode },
    cart,
  );
  if (input.couponCode && !quote.couponValid) {
    throw new AppError("VALIDATION", quote.couponReason ?? "Coupon can't be applied");
  }

  const commBps = await commissionBps(input.platformSlug);
  const number = orderNumber();

  // 1) Create the order graph + inventory holds (PENDING_PAYMENT).
  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        number,
        customerId: input.userId,
        platformSlug: input.platformSlug,
        status: "PENDING_PAYMENT",
        currency: quote.currency,
        itemsSubtotalMinor: quote.itemsSubtotalMinor,
        discountMinor: quote.discountMinor,
        couponCode: quote.couponValid ? quote.couponCode : null,
        deliveryFeeMinor: quote.deliveryFeeMinor,
        serviceFeeMinor: quote.serviceFeeMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        fulfilmentMethod: method,
        addressId: addr?.id,
        addressSnapshot: addr ? (addressSnapshot(addr) as Prisma.InputJsonValue) : undefined,
        paymentMethod: input.payment.method,
      },
    });

    let n = 0;
    for (const g of cart.groups) {
      n += 1;
      const commissionMinor = Math.round((g.subtotalMinor * commBps) / 10_000);
      const vo = await tx.vendorOrder.create({
        data: {
          orderId: order.id,
          vendorId: g.vendorId,
          number: `${number}-V${n}`,
          status: "NEW",
          currency: quote.currency,
          subtotalMinor: g.subtotalMinor,
          commissionMinor,
          payoutMinor: g.subtotalMinor - commissionMinor,
        },
      });
      await tx.orderItem.createMany({
        data: g.items.map((it) => ({
          vendorOrderId: vo.id,
          offerId: it.offerId,
          productId: it.productId,
          variantId: it.variantId,
          titleSnapshot: it.title,
          imageKey: it.image,
          qty: it.qty,
          unitPriceMinor: it.unitPriceMinor,
          totalMinor: it.lineTotalMinor,
        })),
      });
      await tx.fulfilment.create({
        data: {
          vendorOrderId: vo.id,
          method,
          status: "PENDING",
          pickupCode: method === "PICKUP" ? randomToken(3).replace(/[^0-9A-Za-z]/g, "").slice(0, 6).toUpperCase() : null,
          addressSnapshot: addr ? (addressSnapshot(addr) as Prisma.InputJsonValue) : undefined,
        },
      });
      for (const it of g.items) {
        if (!it.variantId) continue;
        await tx.inventory.updateMany({
          where: { variantId: it.variantId, vendorId: g.vendorId },
          data: { reserved: { increment: it.qty } },
        });
      }
    }

    await tx.orderEvent.create({ data: { orderId: order.id, type: "CREATED", actorType: "USER", actorId: input.userId } });
    await tx.outboxEvent.create({
      data: { type: "order.created", aggregateType: "Order", aggregateId: order.id, payload: { number, totalMinor: quote.totalMinor } },
    });
    return order;
  });

  const vendorOrders = await prisma.vendorOrder.findMany({ where: { orderId: created.id }, select: { id: true } });
  const voIds = vendorOrders.map((v) => v.id);

  // 2) Settle payment.
  try {
    if (input.payment.method === "wallet") {
      await payFromWallet({
        userId: input.userId,
        amountMinor: quote.totalMinor,
        platformSlug: input.platformSlug,
        currency: quote.currency,
        memo: `Order ${number}`,
        reference: { orderId: created.id, number },
      });
    } else {
      const gw = gatewayFor(input.payment.gateway);
      const intent = await gw.createIntent({
        amountMinor: quote.totalMinor,
        currency: quote.currency,
        purpose: "ORDER",
        reference: created.id,
        userId: input.userId,
      });
      const pi = await prisma.paymentIntent.create({
        data: {
          userId: input.userId,
          purpose: "ORDER",
          amountMinor: quote.totalMinor,
          currency: quote.currency,
          status: "PROCESSING",
          gateway: gw.name,
          gatewayRef: intent.ref,
          clientSecret: intent.clientSecret,
          orderId: created.id,
        },
      });
      const cap = await gw.capture(intent.ref, quote.totalMinor);
      if (!cap.ok) {
        await prisma.$transaction([
          prisma.payment.create({ data: { intentId: pi.id, status: "FAILED", gatewayResponse: cap.raw as Prisma.InputJsonValue } }),
          prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "FAILED" } }),
        ]);
        throw new AppError("PAYMENT_FAILED", cap.failureReason ? `Payment declined (${cap.failureReason})` : "Payment was declined");
      }
      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            intentId: pi.id,
            status: "SUCCEEDED",
            capturedMinor: cap.capturedMinor,
            feeMinor: cap.feeMinor,
            gatewayResponse: cap.raw as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });
        await tx.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED" } });
        await postTxn(
          {
            type: "ORDER_CAPTURE",
            memo: `Order ${number} (${gw.name})`,
            reference: { orderId: created.id, number, gatewayRef: intent.ref },
            lines: [
              { account: gatewayClearing(input.platformSlug, quote.currency), direction: "DEBIT", amountMinor: quote.totalMinor },
              { account: platformEscrow(input.platformSlug, quote.currency), direction: "CREDIT", amountMinor: quote.totalMinor },
            ],
          },
          tx,
        );
      });
    }
  } catch (e) {
    // Compensate: unwind the pending order + inventory holds, keep the cart.
    await releaseReservations(voIds).catch(() => {});
    await prisma.order.delete({ where: { id: created.id } }).catch(() => {});
    throw e;
  }

  // 3) Mark placed, redeem coupon, clear the ordered items from the cart.
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: created.id }, data: { status: "PLACED", placedAt: new Date() } });
    await tx.orderEvent.create({ data: { orderId: created.id, type: "PAID", actorType: "USER", actorId: input.userId, data: { method: input.payment.method } } });
    await tx.outboxEvent.create({ data: { type: "order.paid", aggregateType: "Order", aggregateId: created.id, payload: { number, totalMinor: quote.totalMinor } } });

    if (quote.couponValid && quote.couponCode) {
      const coupon = await tx.coupon.findUnique({ where: { code: quote.couponCode } });
      if (coupon) {
        await tx.couponRedemption.create({
          data: { couponId: coupon.id, userId: input.userId, orderId: created.id, amountMinor: quote.discountMinor },
        });
      }
    }

    const cartRow = await tx.cart.findUnique({ where: { userId_platformSlug: { userId: input.userId, platformSlug: input.platformSlug } } });
    if (cartRow) {
      await tx.cartItem.deleteMany({ where: { cartId: cartRow.id, savedForLater: false } });
      await tx.cart.update({ where: { id: cartRow.id }, data: { couponCode: null } });
    }
  });

  // 4) Phase 7 side-effects (best-effort, non-blocking): referral reward + ad conversion.
  try {
    await qualifyReferralForOrder({ customerId: input.userId, orderId: created.id, orderTotalMinor: quote.totalMinor, platformSlug: input.platformSlug });
    const items = await prisma.orderItem.findMany({ where: { vendorOrder: { orderId: created.id } }, select: { productId: true } });
    await attributeConversion({ productIds: [...new Set(items.map((i) => i.productId))], platformSlug: input.platformSlug, userId: input.userId, orderTotalMinor: quote.totalMinor });
  } catch (e) {
    console.error("[order post-hooks]", e);
  }

  return getOrder(input.userId, created.id);
}

// ------------------------------------------------------- lifecycle: customer

/**
 * Refund a customer for `amountMinor`, clawing the money back from
 * `sourceAccount` — platform escrow for a pre-fulfilment cancel (the full
 * amount is still held there), or the vendor's PAYABLE for a post-fulfilment
 * return (the payout already left escrow at completion). Refunds a
 * gateway-paid order back to the original card via the same `PaymentGateway`
 * port used to capture it; a wallet-paid order (or a gateway order with no
 * captured intent on file) falls back to a wallet credit.
 */
async function refundOrderPayment(opts: {
  order: { id: string; customerId: string; platformSlug: string; currency: string; number: string; paymentMethod: string | null };
  amountMinor: number;
  sourceAccount: AccountRef;
  memo: string;
  reference: Record<string, unknown>;
}): Promise<{ ledgerTxnId: string; method: "wallet" | "gateway" }> {
  if (opts.order.paymentMethod === "gateway") {
    const intent = await prisma.paymentIntent.findFirst({
      where: { orderId: opts.order.id, purpose: "ORDER", status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
    });
    if (intent?.gatewayRef) {
      const gw = gatewayFor(intent.gateway);
      const res = await gw.refund(intent.gatewayRef, opts.amountMinor);
      if (!res.ok) throw new AppError("PAYMENT_FAILED", "The payment gateway declined this refund");
      const txn = await postTxn({
        type: "REFUND",
        memo: opts.memo,
        reference: opts.reference,
        lines: [
          { account: opts.sourceAccount, direction: "DEBIT", amountMinor: opts.amountMinor },
          { account: gatewayClearing(opts.order.platformSlug, opts.order.currency), direction: "CREDIT", amountMinor: opts.amountMinor },
        ],
      });
      return { ledgerTxnId: txn.id, method: "gateway" };
    }
  }
  const { ledgerTxnId } = await refundToWallet({
    userId: opts.order.customerId,
    amountMinor: opts.amountMinor,
    platformSlug: opts.order.platformSlug,
    currency: opts.order.currency,
    memo: opts.memo,
    reference: opts.reference,
    sourceAccount: opts.sourceAccount,
  });
  return { ledgerTxnId, method: "wallet" };
}

export async function cancelOrder(userId: string, orderId: string) {
  const o = await prisma.order.findFirst({
    where: { id: orderId, customerId: userId },
    include: { vendorOrders: true },
  });
  if (!o) throw new AppError("NOT_FOUND", "Order not found");
  if (!["PLACED", "CONFIRMED"].includes(o.status)) {
    throw new AppError("CONFLICT", `An order that is ${o.status} can't be cancelled`);
  }
  if (o.vendorOrders.some((vo) => !["NEW", "ACCEPTED"].includes(vo.status))) {
    throw new AppError("CONFLICT", "A seller has already started preparing part of this order — contact support");
  }

  await releaseReservations(o.vendorOrders.map((v) => v.id)).catch(() => {});

  await prisma.$transaction(async (tx) => {
    // Atomic compare-and-swap: only one concurrent cancel request can win this
    // update, so a double-tap / retried request can't both pass the pre-check
    // above and each independently refund the customer below.
    const guard = await tx.order.updateMany({
      where: { id: o.id, status: { in: ["PLACED", "CONFIRMED"] } },
      data: { status: "CANCELLED" },
    });
    if (guard.count === 0) {
      throw new AppError("CONFLICT", "This order was already updated by another request");
    }
    await tx.vendorOrder.updateMany({ where: { orderId: o.id }, data: { status: "CANCELLED" } });
    await tx.fulfilment.updateMany({ where: { vendorOrderId: { in: o.vendorOrders.map((v) => v.id) } }, data: { status: "CANCELLED" } });
    await tx.orderEvent.create({ data: { orderId: o.id, type: "CANCELLED", actorType: "USER", actorId: userId } });
    await tx.outboxEvent.create({ data: { type: "order.cancelled", aggregateType: "Order", aggregateId: o.id, payload: { number: o.number } } });
  });

  // Refund the captured total — to the original card if this was a gateway
  // order, otherwise to the customer's wallet.
  const refund = await prisma.refund.create({
    data: { orderId: o.id, amountMinor: o.totalMinor, reason: "CUSTOMER_CANCEL", status: "PROCESSING" },
  });
  const { ledgerTxnId, method } = await refundOrderPayment({
    order: o,
    amountMinor: o.totalMinor,
    sourceAccount: platformEscrow(o.platformSlug, o.currency),
    memo: `Refund for cancelled order ${o.number}`,
    reference: { orderId: o.id, refundId: refund.id },
  });
  await prisma.$transaction([
    prisma.refund.update({ where: { id: refund.id }, data: { status: "DONE", ledgerTxnId } }),
    prisma.order.update({ where: { id: o.id }, data: { status: "REFUNDED" } }),
    prisma.orderEvent.create({ data: { orderId: o.id, type: "REFUNDED", actorType: "SYSTEM", data: { amountMinor: o.totalMinor, to: method } } }),
  ]);

  return getOrder(userId, o.id);
}

/**
 * Sweep orders stuck in `PENDING_PAYMENT` past `olderThanMs` — the crash
 * window between the order graph being created and its payment step
 * completing. `placeOrder` already compensates synchronously on every payment
 * failure (see its catch block); this only catches the process dying
 * mid-flight before that catch, or before the PLACED transition, ever ran.
 * Called on a worker timer, not from any request path.
 */
export async function releaseStaleReservations(olderThanMs = 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: cutoff } },
    include: { vendorOrders: true },
  });

  let released = 0;
  for (const o of stale) {
    const voIds = o.vendorOrders.map((v) => v.id);
    await releaseReservations(voIds).catch(() => {});

    // The intent-status update and the escrow ledger post happen in one
    // atomic transaction in placeOrder — a SUCCEEDED intent on file means
    // money genuinely landed in escrow before the crash, so this needs a
    // real refund, not a silent drop.
    const capturedIntent = await prisma.paymentIntent.findFirst({
      where: { orderId: o.id, purpose: "ORDER", status: "SUCCEEDED" },
    });

    if (capturedIntent) {
      const refund = await prisma.refund.create({
        data: { orderId: o.id, amountMinor: o.totalMinor, reason: "OTHER", status: "PROCESSING" },
      });
      const { ledgerTxnId, method } = await refundOrderPayment({
        order: o,
        amountMinor: o.totalMinor,
        sourceAccount: platformEscrow(o.platformSlug, o.currency),
        memo: `Refund for abandoned checkout ${o.number}`,
        reference: { orderId: o.id, refundId: refund.id },
      });
      await prisma.$transaction([
        prisma.refund.update({ where: { id: refund.id }, data: { status: "DONE", ledgerTxnId } }),
        prisma.vendorOrder.updateMany({ where: { orderId: o.id }, data: { status: "CANCELLED" } }),
        prisma.fulfilment.updateMany({ where: { vendorOrderId: { in: voIds } }, data: { status: "CANCELLED" } }),
        prisma.order.update({ where: { id: o.id }, data: { status: "REFUNDED" } }),
        prisma.orderEvent.create({
          data: {
            orderId: o.id,
            type: "REFUNDED",
            actorType: "SYSTEM",
            data: { amountMinor: o.totalMinor, to: method, reason: "abandoned_checkout" },
          },
        }),
      ]);
    } else {
      // No captured payment on file — safe to drop the order graph entirely,
      // the same compensation placeOrder does synchronously on failure.
      await prisma.order.delete({ where: { id: o.id } }).catch(() => {});
    }
    released += 1;
  }
  return { released };
}

/** Customer requests a return on specific items of a completed sub-order. */
export async function requestReturn(
  userId: string,
  vendorOrderId: string,
  input: { reason: string; items: { orderItemId: string; qty: number }[] },
) {
  // Serializable: two concurrent requests for the same items must not both
  // read the pre-insert "not yet returned" state and both pass validation —
  // Postgres aborts the loser with a serialization failure instead.
  try {
    return await prisma.$transaction(
      async (tx) => {
        const vo = await tx.vendorOrder.findFirst({
          where: { id: vendorOrderId, order: { customerId: userId } },
          include: { items: true, returns: true },
        });
        if (!vo) throw new AppError("NOT_FOUND", "Sub-order not found");
        if (vo.status !== "COMPLETED") throw new AppError("CONFLICT", "You can only return a completed order");
        if (!input.items.length) throw new AppError("VALIDATION", "Select at least one item to return");

        const itemsById = new Map(vo.items.map((it) => [it.id, it]));
        const alreadyReturned = new Map<string, number>();
        for (const r of vo.returns) {
          if (r.status === "REJECTED") continue;
          for (const line of (r.items as { orderItemId: string; qty: number }[] | null) ?? []) {
            alreadyReturned.set(line.orderItemId, (alreadyReturned.get(line.orderItemId) ?? 0) + line.qty);
          }
        }

        let amountMinor = 0;
        for (const line of input.items) {
          if (!Number.isInteger(line.qty) || line.qty <= 0) throw new AppError("VALIDATION", "Return quantity must be a positive integer");
          const item = itemsById.get(line.orderItemId);
          if (!item) throw new AppError("VALIDATION", "Return item does not belong to this order");
          const already = alreadyReturned.get(line.orderItemId) ?? 0;
          if (already + line.qty > item.qty) {
            throw new AppError("VALIDATION", `Only ${item.qty - already} of "${item.titleSnapshot}" left to return`);
          }
          amountMinor += item.unitPriceMinor * line.qty;
        }

        const ret = await tx.return.create({
          data: { vendorOrderId, reason: input.reason, items: input.items as unknown as Prisma.InputJsonValue, status: "REQUESTED" },
        });
        await tx.orderEvent.create({
          data: { orderId: vo.orderId, type: "RETURN_REQUESTED", actorType: "USER", actorId: userId, data: { vendorOrderId, returnId: ret.id, amountMinor } },
        });
        return { id: ret.id, status: ret.status, amountMinor };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new AppError("CONFLICT", "Another return request for this order is in progress — please try again");
    }
    throw err;
  }
}

/**
 * Vendor approves or rejects a return. Approval refunds the customer (to the
 * original card for a gateway order, otherwise to their wallet) by clawing
 * the money back from the vendor's PAYABLE — the payout already left escrow
 * when the sub-order was completed, so this is a charge-back, not an escrow
 * release. The platform's commission on the returned items is not clawed
 * back (a deliberate simplification — real marketplaces vary on this).
 */
export async function reviewReturn(userId: string, returnId: string, decision: "APPROVED" | "REJECTED", note?: string) {
  const vp = await vendorProfileFor(userId);

  let ret;
  try {
    ret = await prisma.$transaction(
      async (tx) => {
        const ret = await tx.return.findFirst({
          where: { id: returnId, vendorOrder: { vendorId: vp.id } },
          include: { vendorOrder: { include: { order: true, items: true, returns: true } } },
        });
        if (!ret) throw new AppError("NOT_FOUND", "Return not found");
        if (ret.status !== "REQUESTED") throw new AppError("CONFLICT", `Return was already ${ret.status.toLowerCase()}`);

        if (decision === "APPROVED") {
          // Defense in depth against requestReturn's race window: re-validate
          // against every OTHER non-rejected return on this sub-order, in case
          // two overlapping return requests both slipped past creation.
          const itemsById = new Map(ret.vendorOrder.items.map((it) => [it.id, it]));
          const otherReturned = new Map<string, number>();
          for (const r of ret.vendorOrder.returns) {
            if (r.id === ret.id || r.status === "REJECTED") continue;
            for (const line of (r.items as { orderItemId: string; qty: number }[] | null) ?? []) {
              otherReturned.set(line.orderItemId, (otherReturned.get(line.orderItemId) ?? 0) + line.qty);
            }
          }
          for (const line of (ret.items as { orderItemId: string; qty: number }[] | null) ?? []) {
            const item = itemsById.get(line.orderItemId);
            const already = otherReturned.get(line.orderItemId) ?? 0;
            if (!item || already + line.qty > item.qty) {
              throw new AppError("CONFLICT", "This return overlaps another return already requested or approved on this order");
            }
          }
        }

        // Atomic compare-and-swap, same pattern as the other order-lifecycle
        // mutations in this file: only one concurrent review can win.
        const guard = await tx.return.updateMany({
          where: { id: ret.id, status: "REQUESTED" },
          data: { status: decision, resolution: note },
        });
        if (guard.count === 0) throw new AppError("CONFLICT", "This return was already reviewed by another request");

        await tx.orderEvent.create({
          data: {
            orderId: ret.vendorOrder.orderId,
            type: `RETURN_${decision}`,
            actorType: "USER",
            actorId: userId,
            data: { vendorOrderId: ret.vendorOrderId, returnId: ret.id },
          },
        });
        return ret;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new AppError("CONFLICT", "This return is being reviewed concurrently — please try again");
    }
    throw err;
  }

  if (decision === "REJECTED") {
    return { id: ret.id, status: "REJECTED" as const };
  }

  const items = (ret.items as { orderItemId: string; qty: number }[] | null) ?? [];
  const itemsById = new Map(ret.vendorOrder.items.map((it) => [it.id, it]));
  const amountMinor = items.reduce((sum, line) => sum + (itemsById.get(line.orderItemId)?.unitPriceMinor ?? 0) * line.qty, 0);
  if (amountMinor <= 0) throw new AppError("CONFLICT", "Return has no refundable items");

  const order = ret.vendorOrder.order;
  const refund = await prisma.refund.create({
    data: { orderId: order.id, vendorOrderId: ret.vendorOrderId, amountMinor, reason: "RETURN", status: "PROCESSING" },
  });
  const { ledgerTxnId, method } = await refundOrderPayment({
    order,
    amountMinor,
    sourceAccount: vendorPayable(vp.id, order.currency),
    memo: `Return refund · ${order.number}`,
    reference: { orderId: order.id, vendorOrderId: ret.vendorOrderId, returnId: ret.id, refundId: refund.id },
  });
  await prisma.$transaction([
    prisma.refund.update({ where: { id: refund.id }, data: { status: "DONE", ledgerTxnId } }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "RETURN_REFUNDED",
        actorType: "SYSTEM",
        data: { vendorOrderId: ret.vendorOrderId, returnId: ret.id, amountMinor, to: method },
      },
    }),
  ]);

  return { id: ret.id, status: "APPROVED" as const, refund: { amountMinor, method } };
}

/** The vendor's return queue (pending + past decisions). */
export async function listVendorReturns(userId: string, opts: { status?: "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED" } = {}) {
  const vp = await vendorProfileFor(userId);
  const rows = await prisma.return.findMany({
    where: { vendorOrder: { vendorId: vp.id }, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { vendorOrder: { select: { number: true, order: { select: { number: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    vendorOrderId: r.vendorOrderId,
    vendorOrderNumber: r.vendorOrder.number,
    orderNumber: r.vendorOrder.order.number,
    reason: r.reason,
    status: r.status,
    items: r.items,
    resolution: r.resolution,
    createdAt: r.createdAt.toISOString(),
  }));
}

// --------------------------------------------------------- lifecycle: vendor

export async function vendorProfileFor(userId: string) {
  const vp = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vp) throw new AppError("FORBIDDEN", "Not a vendor");
  return vp;
}

export async function listVendorOrders(userId: string, opts: { status?: string } = {}) {
  const vp = await vendorProfileFor(userId);
  const rows = await prisma.vendorOrder.findMany({
    where: { vendorId: vp.id, ...(opts.status ? { status: opts.status as never } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: true, order: { select: { number: true, fulfilmentMethod: true, addressSnapshot: true } } },
  });
  return rows.map((vo) => ({
    id: vo.id,
    number: vo.number,
    orderNumber: vo.order.number,
    status: vo.status,
    subtotalMinor: vo.subtotalMinor,
    commissionMinor: vo.commissionMinor,
    payoutMinor: vo.payoutMinor,
    fulfilmentMethod: vo.order.fulfilmentMethod,
    itemCount: vo.items.reduce((n, it) => n + it.qty, 0),
    items: vo.items.map((it) => ({ title: it.titleSnapshot, qty: it.qty, totalMinor: it.totalMinor })),
    createdAt: vo.createdAt.toISOString(),
  }));
}

export async function getVendorOrder(userId: string, vendorOrderId: string) {
  const vp = await vendorProfileFor(userId);
  const vo = await prisma.vendorOrder.findFirst({
    where: { id: vendorOrderId, vendorId: vp.id },
    include: {
      items: true,
      fulfilment: true,
      returns: true,
      order: {
        select: {
          number: true,
          fulfilmentMethod: true,
          addressSnapshot: true,
          placedAt: true,
          events: { orderBy: { at: "asc" } },
        },
      },
    },
  });
  if (!vo) throw new AppError("NOT_FOUND", "Sub-order not found");

  // The parent order's timeline carries both order-level events (no vendorOrderId)
  // and per-sub-order events — keep ours plus the shared ones.
  const events = vo.order.events.filter((e) => {
    const vid = (e.data as { vendorOrderId?: string } | null)?.vendorOrderId;
    return !vid || vid === vo.id;
  });

  return {
    id: vo.id,
    number: vo.number,
    orderNumber: vo.order.number,
    status: vo.status,
    fulfilmentMethod: vo.order.fulfilmentMethod,
    currency: vo.currency,
    subtotalMinor: vo.subtotalMinor,
    commissionMinor: vo.commissionMinor,
    payoutMinor: vo.payoutMinor,
    placedAt: vo.order.placedAt?.toISOString() ?? null,
    createdAt: vo.createdAt.toISOString(),
    address:
      vo.order.fulfilmentMethod === "PICKUP"
        ? null
        : ((vo.fulfilment?.addressSnapshot ?? vo.order.addressSnapshot ?? null) as Prisma.JsonValue),
    fulfilment: vo.fulfilment
      ? {
          method: vo.fulfilment.method,
          status: vo.fulfilment.status,
          pickupCode: vo.fulfilment.pickupCode,
          deliveryId: vo.fulfilment.deliveryId,
        }
      : null,
    items: vo.items.map((it) => ({
      id: it.id,
      title: it.titleSnapshot,
      image: it.imageKey,
      qty: it.qty,
      unitPriceMinor: it.unitPriceMinor,
      totalMinor: it.totalMinor,
    })),
    returns: vo.returns.map(shapeReturn),
    events: events.map((e) => ({ type: e.type, actorType: e.actorType, at: e.at.toISOString() })),
  };
}

export async function setVendorOrderStatus(userId: string, vendorOrderId: string, next: "ACCEPTED" | "PREPARING" | "READY_FOR_PICKUP" | "HANDED_OVER") {
  const vp = await vendorProfileFor(userId);
  const vo = await prisma.vendorOrder.findFirst({ where: { id: vendorOrderId, vendorId: vp.id } });
  if (!vo) throw new AppError("NOT_FOUND", "Sub-order not found");
  if (["COMPLETED", "CANCELLED"].includes(vo.status)) throw new AppError("CONFLICT", `Sub-order is already ${vo.status}`);
  await prisma.$transaction([
    prisma.vendorOrder.update({ where: { id: vo.id }, data: { status: next } }),
    prisma.orderEvent.create({ data: { orderId: vo.orderId, type: `VENDOR_${next}`, actorType: "USER", actorId: userId, data: { vendorOrderId } } }),
    ...(next === "READY_FOR_PICKUP"
      ? [prisma.fulfilment.updateMany({ where: { vendorOrderId: vo.id }, data: { status: "READY", readyAt: new Date() } })]
      : []),
  ]);

  // Ready for pickup + delivery fulfilment ⇒ spawn a Delivery and start dispatch.
  let deliveryId: string | null = null;
  if (next === "READY_FOR_PICKUP") {
    const ful = await prisma.fulfilment.findUnique({ where: { vendorOrderId: vo.id } });
    if (ful?.method === "DELIVERY") {
      deliveryId = ful.deliveryId ?? (await ensureDeliveryForVendorOrder(vo.id).catch((e) => {
        console.error("[delivery] spawn from fulfilment", e);
        return null;
      }));
    }
  }

  return { id: vo.id, status: next, deliveryId };
}

/**
 * Vendor marks their sub-order COMPLETED → release escrow: payout to the
 * vendor's PAYABLE, commission to platform REVENUE. When every sub-order of the
 * parent order is done, release the order-level fees and issue an invoice.
 */
export async function completeVendorOrder(userId: string, vendorOrderId: string) {
  const vp = await vendorProfileFor(userId);
  const vo = await prisma.vendorOrder.findFirst({ where: { id: vendorOrderId, vendorId: vp.id }, include: { items: true, order: true } });
  if (!vo) throw new AppError("NOT_FOUND", "Sub-order not found");
  if (vo.status === "COMPLETED") throw new AppError("CONFLICT", "Sub-order is already completed");
  if (vo.status === "CANCELLED") throw new AppError("CONFLICT", "Sub-order was cancelled");

  const order = vo.order;
  let orderFulfilled = false;

  await prisma.$transaction(async (tx) => {
    // Atomic compare-and-swap: only one concurrent completion request can win
    // this update (Postgres row-locks it), so a double-tap / retried request
    // can't both pass the pre-check above and each post a RELEASE below.
    const guard = await tx.vendorOrder.updateMany({
      where: { id: vo.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { status: "COMPLETED" },
    });
    if (guard.count === 0) {
      throw new AppError("CONFLICT", "Sub-order was already completed or cancelled");
    }
    await tx.fulfilment.updateMany({ where: { vendorOrderId: vo.id }, data: { status: "COMPLETED", completedAt: new Date() } });

    // consume the held inventory
    for (const it of vo.items) {
      if (!it.variantId) continue;
      await tx.inventory.updateMany({
        where: { variantId: it.variantId, vendorId: vp.id },
        data: { reserved: { decrement: it.qty }, quantity: { decrement: it.qty } },
      });
    }

    // escrow → vendor payable + platform revenue
    await postTxn(
      {
        type: "RELEASE",
        memo: `Release ${vo.number}`,
        reference: { vendorOrderId: vo.id, orderId: order.id },
        lines: [
          { account: platformEscrow(order.platformSlug, order.currency), direction: "DEBIT", amountMinor: vo.subtotalMinor },
          ...(vo.payoutMinor > 0
            ? [{ account: vendorPayable(vp.id, order.currency), direction: "CREDIT" as const, amountMinor: vo.payoutMinor }]
            : []),
          ...(vo.commissionMinor > 0
            ? [{ account: platformRevenue(order.platformSlug, order.currency), direction: "CREDIT" as const, amountMinor: vo.commissionMinor }]
            : []),
        ],
      },
      tx,
    );

    await tx.orderEvent.create({ data: { orderId: order.id, type: "VENDOR_COMPLETED", actorType: "USER", actorId: userId, data: { vendorOrderId: vo.id, payoutMinor: vo.payoutMinor } } });
    await tx.outboxEvent.create({ data: { type: "vendor_order.completed", aggregateType: "VendorOrder", aggregateId: vo.id, payload: { number: vo.number } } });

    const siblings = await tx.vendorOrder.findMany({ where: { orderId: order.id }, select: { status: true } });
    const allDone = siblings.every((s) => s.status === "COMPLETED" || s.status === "CANCELLED");
    if (allDone) {
      // A delivery-backed fulfilment settles the delivery fee itself (escrow →
      // courier PAYABLE + platform REVENUE) on COMPLETED — don't double-release
      // it here. Pickup-only orders release the full fee to revenue.
      const hasDelivery =
        (await tx.fulfilment.count({ where: { vendorOrder: { orderId: order.id }, deliveryId: { not: null } } })) > 0;
      const feeMinor =
        (hasDelivery ? 0 : order.deliveryFeeMinor) + order.serviceFeeMinor + order.taxMinor;
      if (feeMinor > 0) {
        await postTxn(
          {
            type: "FEE",
            memo: `Order fees ${order.number}`,
            reference: { orderId: order.id },
            lines: [
              { account: platformEscrow(order.platformSlug, order.currency), direction: "DEBIT", amountMinor: feeMinor },
              { account: platformRevenue(order.platformSlug, order.currency), direction: "CREDIT", amountMinor: feeMinor },
            ],
          },
          tx,
        );
      }
      await tx.order.update({ where: { id: order.id }, data: { status: "FULFILLED" } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: "FULFILLED", actorType: "SYSTEM" } });
      await tx.invoice.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          number: `INV-${order.number}`,
          lines: {
            subtotalMinor: order.itemsSubtotalMinor,
            discountMinor: order.discountMinor,
            deliveryFeeMinor: order.deliveryFeeMinor,
            serviceFeeMinor: order.serviceFeeMinor,
            taxMinor: order.taxMinor,
            totalMinor: order.totalMinor,
          } as Prisma.InputJsonValue,
        },
        update: {},
      });
      orderFulfilled = true;
    } else {
      await tx.order.update({ where: { id: order.id }, data: { status: "PARTIALLY_FULFILLED" } });
    }
  });

  // Best-effort: render + store the invoice PDF outside the DB transaction
  // (it's slow I/O, not something the ledger/order state needs to roll back
  // on). A failure here (e.g. storage misconfigured) doesn't undo the
  // completion — the invoice download route generates lazily on first
  // request as a fallback.
  if (orderFulfilled) {
    try {
      await generateInvoicePdf(order.id);
    } catch (e) {
      console.error("[invoice-pdf]", e);
    }
  }

  return { vendorOrderId: vo.id, status: "COMPLETED" as const };
}
