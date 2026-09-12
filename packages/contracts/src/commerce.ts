import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * Phase 3 commerce contract — cart, coupons, checkout, orders, wallet, payments.
 * Mirrors `@stall/core/{commerce,wallet,payments}` and the `/api/v1/{cart,
 * checkout,orders,wallet,coupons,me/addresses,me/payment-methods}` routes.
 */

export const FulfilmentMethod = z.enum(["DELIVERY", "PICKUP", "VENDOR_LOGISTICS"]);
export const OrderStatus = z.enum([
  "PENDING_PAYMENT",
  "PLACED",
  "CONFIRMED",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CANCELLED",
  "REFUNDED",
]);
export const VendorOrderStatus = z.enum([
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "HANDED_OVER",
  "COMPLETED",
  "CANCELLED",
]);

// --- addresses --------------------------------------------------------
export const Address = z.object({
  id: z.string(),
  label: z.string().nullable(),
  recipientName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  region: z.string().nullable(),
  country: z.string(),
  postalCode: z.string().nullable(),
  kind: z.enum(["HOME", "WORK", "OTHER"]),
  isDefault: z.boolean(),
});
export const AddressInput = z.object({
  label: z.string().max(40).optional(),
  recipientName: z.string().min(2).max(120),
  phone: z.string().min(6).max(24),
  line1: z.string().min(2).max(160),
  line2: z.string().max(160).optional(),
  city: z.string().min(1).max(80),
  region: z.string().max(80).optional(),
  country: z.string().length(2),
  postalCode: z.string().max(16).optional(),
  kind: z.enum(["HOME", "WORK", "OTHER"]).optional(),
  isDefault: z.boolean().optional(),
});
export const AddressesResponse = ok(z.object({ items: z.array(Address) }));
export const AddressResponse = ok(Address);
export const DeletedResponse = ok(z.object({ deleted: z.boolean() }));

// --- cart ------------------------------------------------------------
export const CartItem = z.object({
  id: z.string(),
  offerId: z.string(),
  productId: z.string(),
  productSlug: z.string(),
  variantId: z.string().nullable(),
  title: z.string(),
  image: z.string().nullable(),
  categorySlug: z.string().nullable(),
  qty: z.number().int(),
  unitPriceMinor: z.number().int(),
  lineTotalMinor: z.number().int(),
  currentUnitPriceMinor: z.number().int(),
  priceChanged: z.boolean(),
  available: z.boolean(),
});
export const CartGroup = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  items: z.array(CartItem),
  subtotalMinor: z.number().int(),
});
export const Cart = z.object({
  id: z.string(),
  platformSlug: z.string(),
  currency: z.string(),
  couponCode: z.string().nullable(),
  couponValid: z.boolean(),
  couponDiscountMinor: z.number().int(),
  freeDelivery: z.boolean(),
  groups: z.array(CartGroup),
  itemCount: z.number().int(),
  subtotalMinor: z.number().int(),
  savedForLater: z.array(CartItem),
});
export const CartResponse = ok(Cart);
export const AddItemRequest = z.object({
  offerId: z.string(),
  variantId: z.string().optional(),
  qty: z.number().int().positive().max(99).optional(),
});
export const UpdateItemRequest = z.object({
  qty: z.number().int().min(0).max(99).optional(),
  savedForLater: z.boolean().optional(),
});
export const CouponCodeRequest = z.object({ code: z.string().min(2).max(40) });

// --- coupons -------------------------------------------------------
export const CouponEvaluation = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
  code: z.string().optional(),
  type: z.enum(["PERCENT", "FIXED", "FREE_DELIVERY"]).optional(),
  discountMinor: z.number().int(),
  freeDelivery: z.boolean(),
});
export const CouponEvaluationResponse = ok(CouponEvaluation);
export const CouponsResponse = ok(
  z.object({
    items: z.array(
      z.object({
        code: z.string(),
        type: z.enum(["PERCENT", "FIXED", "FREE_DELIVERY"]),
        value: z.number().int(),
        minSpendMinor: z.number().int().nullable(),
        endsAt: z.string().nullable(),
      }),
    ),
  }),
);

// --- checkout -----------------------------------------------------
export const QuoteLine = z.object({
  key: z.enum(["subtotal", "discount", "delivery", "service", "tax", "total"]),
  label: z.string(),
  amountMinor: z.number().int(),
});
export const CheckoutQuote = z.object({
  currency: z.string(),
  fulfilmentMethod: FulfilmentMethod,
  itemsSubtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  deliveryFeeMinor: z.number().int(),
  serviceFeeMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  lines: z.array(QuoteLine),
  couponCode: z.string().nullable(),
  couponValid: z.boolean(),
  couponReason: z.string().nullable(),
  freeDelivery: z.boolean(),
  vendorBreakdown: z.array(z.object({ vendorId: z.string(), vendorName: z.string(), subtotalMinor: z.number().int() })),
  itemCount: z.number().int(),
  unavailableItemIds: z.array(z.string()),
});
export const QuoteRequest = z.object({
  fulfilmentMethod: FulfilmentMethod.optional(),
  couponCode: z.string().max(40).optional(),
});
export const CheckoutQuoteResponse = ok(CheckoutQuote);
export const PlaceOrderRequest = z.object({
  fulfilmentMethod: FulfilmentMethod.optional(),
  addressId: z.string().optional(),
  couponCode: z.string().max(40).optional(),
  payment: z.object({ method: z.enum(["wallet", "gateway"]), gateway: z.string().max(24).optional() }),
});

// --- orders ------------------------------------------------------
export const OrderItem = z.object({
  id: z.string(),
  productId: z.string(),
  offerId: z.string(),
  variantId: z.string().nullable(),
  title: z.string(),
  image: z.string().nullable(),
  qty: z.number().int(),
  unitPriceMinor: z.number().int(),
  totalMinor: z.number().int(),
});
export const ReturnItem = z.object({ orderItemId: z.string(), qty: z.number().int().positive() });
export const ReturnSummary = z.object({
  id: z.string(),
  reason: z.string(),
  status: z.string(),
  items: z.unknown(),
  resolution: z.string().nullable(),
  createdAt: z.string(),
});
export const VendorOrder = z.object({
  id: z.string(),
  number: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  status: VendorOrderStatus,
  subtotalMinor: z.number().int(),
  commissionMinor: z.number().int(),
  payoutMinor: z.number().int(),
  fulfilment: z
    .object({ method: FulfilmentMethod, status: z.string(), pickupCode: z.string().nullable(), deliveryId: z.string().nullable() })
    .nullable(),
  returns: z.array(ReturnSummary),
  items: z.array(OrderItem),
});
export const OrderDetail = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatus,
  platformSlug: z.string(),
  currency: z.string(),
  itemsSubtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  couponCode: z.string().nullable(),
  deliveryFeeMinor: z.number().int(),
  serviceFeeMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  fulfilmentMethod: FulfilmentMethod,
  paymentMethod: z.string().nullable(),
  address: z.unknown().nullable(),
  placedAt: z.string().nullable(),
  createdAt: z.string(),
  vendorOrders: z.array(VendorOrder),
  events: z.array(z.object({ type: z.string(), actorType: z.string(), at: z.string(), data: z.unknown().nullable() })),
  refunds: z.array(z.object({ id: z.string(), amountMinor: z.number().int(), reason: z.string(), status: z.string(), at: z.string() })),
  invoice: z.object({ number: z.string(), issuedAt: z.string() }).nullable(),
});
export const OrderCard = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatus,
  totalMinor: z.number().int(),
  currency: z.string(),
  itemCount: z.number().int(),
  vendorCount: z.number().int(),
  thumbs: z.array(z.string()),
  createdAt: z.string(),
  placedAt: z.string().nullable(),
});
export const OrdersResponse = ok(z.object({ items: z.array(OrderCard), nextCursor: z.string().nullable() }));
export const OrderDetailResponse = ok(OrderDetail);
export const ReturnRequest = z.object({
  vendorOrderId: z.string(),
  reason: z.string().min(3).max(500),
  items: z.array(ReturnItem).min(1),
});
export const ReturnResponse = ok(z.object({ id: z.string(), status: z.string(), amountMinor: z.number().int() }));

// --- vendor sub-orders ---------------------------------------------
export const VendorOrderCard = z.object({
  id: z.string(),
  number: z.string(),
  orderNumber: z.string(),
  status: VendorOrderStatus,
  subtotalMinor: z.number().int(),
  commissionMinor: z.number().int(),
  payoutMinor: z.number().int(),
  fulfilmentMethod: FulfilmentMethod,
  buyerName: z.string(),
  itemCount: z.number().int(),
  items: z.array(z.object({ title: z.string(), qty: z.number().int(), totalMinor: z.number().int() })),
  createdAt: z.string(),
});
export const VendorOrdersResponse = ok(z.object({ items: z.array(VendorOrderCard) }));
export const VendorOrderDetail = z.object({
  id: z.string(),
  number: z.string(),
  orderNumber: z.string(),
  status: VendorOrderStatus,
  fulfilmentMethod: FulfilmentMethod,
  currency: z.string(),
  subtotalMinor: z.number().int(),
  commissionMinor: z.number().int(),
  payoutMinor: z.number().int(),
  placedAt: z.string().nullable(),
  createdAt: z.string(),
  address: z.unknown().nullable(),
  fulfilment: z
    .object({ method: FulfilmentMethod, status: z.string(), pickupCode: z.string().nullable(), deliveryId: z.string().nullable() })
    .nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      image: z.string().nullable(),
      qty: z.number().int(),
      unitPriceMinor: z.number().int(),
      totalMinor: z.number().int(),
    }),
  ),
  returns: z.array(ReturnSummary),
  events: z.array(z.object({ type: z.string(), actorType: z.string(), at: z.string() })),
});
export const VendorOrderDetailResponse = ok(VendorOrderDetail);
export const VendorOrderStatusRequest = z.object({
  status: z.enum(["ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "HANDED_OVER"]),
});
export const VendorOrderMutationResponse = ok(
  z.object({ id: z.string(), status: z.string(), deliveryId: z.string().nullable().optional() }),
);

// --- vendor returns ------------------------------------------------
export const ReturnStatus = z.enum(["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"]);
export const VendorReturnCard = z.object({
  id: z.string(),
  vendorOrderId: z.string(),
  vendorOrderNumber: z.string(),
  orderNumber: z.string(),
  reason: z.string(),
  status: ReturnStatus,
  items: z.unknown(),
  resolution: z.string().nullable(),
  createdAt: z.string(),
});
export const VendorReturnsResponse = ok(z.object({ items: z.array(VendorReturnCard) }));
export const ReturnReviewRequest = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(500).optional(),
});
export const ReturnReviewResponse = ok(
  z.object({
    id: z.string(),
    status: z.string(),
    refund: z.object({ amountMinor: z.number().int(), method: z.enum(["wallet", "gateway"]) }).optional(),
  }),
);

// --- vendor payouts ------------------------------------------------
export const VendorPayoutRequest = z.object({
  amountMinor: z.number().int().positive(),
  pin: z.string().min(4).max(6),
  payoutAccountId: z.string().optional(),
});
export const VendorPayoutResponse = ok(z.object({ payoutId: z.string(), balanceMinor: z.number().int() }));
export const VendorPayoutsResponse = ok(
  z.object({
    items: z.array(
      z.object({ id: z.string(), amountMinor: z.number().int(), currency: z.string(), status: z.string(), at: z.string() }),
    ),
  }),
);

// --- wallet ------------------------------------------------------
export const Wallet = z.object({
  currency: z.string(),
  balanceMinor: z.number().int(),
  pinRequired: z.boolean(),
});
export const WalletResponse = ok(Wallet);
export const WalletTransaction = z.object({
  id: z.string(),
  direction: z.string(),
  amountMinor: z.number().int(),
  balanceAfterMinor: z.number().int(),
  description: z.string(),
  at: z.string(),
});
export const WalletTransactionsResponse = ok(
  z.object({ items: z.array(WalletTransaction), nextCursor: z.string().nullable() }),
);
export const TopUpRequest = z.object({ amountMinor: z.number().int().min(100), gateway: z.string().max(24).optional() });
export const TopUpResponse = ok(
  z.object({
    status: z.enum(["SUCCEEDED", "FAILED"]),
    balanceMinor: z.number().int().optional(),
    intentId: z.string(),
    gatewayRef: z.string(),
  }),
);
export const WithdrawRequest = z.object({ amountMinor: z.number().int().positive(), pin: z.string().min(4).max(6) });
export const WithdrawResponse = ok(z.object({ payoutId: z.string(), balanceMinor: z.number().int() }));

// --- payment methods --------------------------------------------
export const PaymentMethod = z.object({
  id: z.string(),
  gateway: z.string(),
  brand: z.string().nullable(),
  last4: z.string().nullable(),
  expMonth: z.number().int().nullable(),
  expYear: z.number().int().nullable(),
  isDefault: z.boolean(),
});
export const PaymentMethodsResponse = ok(z.object({ items: z.array(PaymentMethod) }));
export const AddPaymentMethodRequest = z.object({
  gateway: z.string().max(24),
  token: z.string().min(4).max(200),
  brand: z.string().max(24).optional(),
  last4: z.string().length(4).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2024).max(2099).optional(),
  makeDefault: z.boolean().optional(),
});
export const PaymentMethodResponse = ok(PaymentMethod);

export const WebhookResponse = ok(z.object({ received: z.boolean(), handled: z.string() }));
