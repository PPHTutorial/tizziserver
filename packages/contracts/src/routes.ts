import { z } from "zod";
import { ok } from "./envelope.ts";
import * as a from "./auth.ts";
import * as c from "./catalog.ts";
import * as m from "./commerce.ts";
import * as d from "./delivery.ts";
import * as x from "./auction.ts";
import * as k from "./comms.ts";
import * as ad from "./ads.ts";

/**
 * The API contract registry → `openapi.json` (and the hand-written Dart client
 * in `mobile/lib/api/`, kept faithful to these shapes).
 */
export interface RouteContract {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  tags: string[];
  /** true ⇒ requires a bearer access token (adds 401 + security). */
  auth: boolean;
  /** true ⇒ honours `Idempotency-Key` (documented, not enforced here). */
  idempotent?: boolean;
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  response: z.ZodTypeAny;
  /** extra status codes this route can return, beyond the defaults. */
  errors?: number[];
}

export const HealthResponse = ok(
  z.object({
    service: z.string(),
    version: z.string(),
    env: z.string(),
    ts: z.string(),
  }),
);

export const routes = {
  health: {
    method: "GET",
    path: "/api/v1/health",
    summary: "Liveness + build info",
    tags: ["system"],
    auth: false,
    response: HealthResponse,
  },

  configBootstrap: {
    method: "GET",
    path: "/api/v1/config/bootstrap",
    summary: "Per-platform capability + nav bootstrap (anonymous or authenticated)",
    tags: ["system"],
    auth: false,
    query: a.BootstrapQuery,
    response: a.BootstrapResponse,
    errors: [404],
  },

  authOtp: {
    method: "POST",
    path: "/api/v1/auth/otp",
    summary: "Send a login / verification OTP over SMS or email",
    tags: ["auth"],
    auth: false,
    body: a.OtpRequest,
    response: a.OtpResponse,
    errors: [429],
  },
  authVerify: {
    method: "POST",
    path: "/api/v1/auth/verify",
    summary: "Verify an OTP → token pair (or an MFA challenge)",
    tags: ["auth"],
    auth: false,
    body: a.VerifyRequest,
    response: a.VerifyResponse,
    errors: [400, 429],
  },
  authRefresh: {
    method: "POST",
    path: "/api/v1/auth/refresh",
    summary: "Rotate a refresh token (reuse ⇒ family revoked)",
    tags: ["auth"],
    auth: false,
    body: a.RefreshRequest,
    response: a.RefreshResponse,
    errors: [401, 429],
  },
  authLogout: {
    method: "POST",
    path: "/api/v1/auth/logout",
    summary: "Revoke the current session, or every session",
    tags: ["auth"],
    auth: true,
    body: a.LogoutRequest,
    response: a.LogoutResponse,
  },
  authSessionsList: {
    method: "GET",
    path: "/api/v1/auth/sessions",
    summary: "List the caller's active sessions / devices",
    tags: ["auth"],
    auth: true,
    response: a.SessionsResponse,
  },
  authSessionsRevoke: {
    method: "DELETE",
    path: "/api/v1/auth/sessions",
    summary: "Revoke one of the caller's other sessions",
    tags: ["auth"],
    auth: true,
    body: a.RevokeSessionRequest,
    response: a.RevokeSessionResponse,
  },
  authSwitchRole: {
    method: "POST",
    path: "/api/v1/auth/switch-role",
    summary: "Mint a new access token for a different active role",
    tags: ["auth"],
    auth: true,
    body: a.SwitchRoleRequest,
    response: a.SwitchRoleResponse,
    errors: [403, 429],
  },
  authSocial: {
    method: "POST",
    path: "/api/v1/auth/social",
    summary: "Sign in with Google / Apple / Facebook",
    tags: ["auth"],
    auth: false,
    body: a.SocialRequest,
    response: a.SocialResponse,
    errors: [401, 429],
  },
  authTwoFactor: {
    method: "POST",
    path: "/api/v1/auth/2fa",
    summary: "TOTP 2FA lifecycle: enroll / confirm / disable / status",
    tags: ["auth"],
    auth: true,
    body: a.TwoFactorRequest,
    response: a.TwoFactorResponse,
    errors: [400, 429],
  },
  authPin: {
    method: "POST",
    path: "/api/v1/auth/pin",
    summary: "Set / replace the transaction PIN",
    tags: ["auth"],
    auth: true,
    body: a.PinRequest,
    response: a.OkSet,
  },
  authPassword: {
    method: "POST",
    path: "/api/v1/auth/password",
    summary: "Set / replace the account password",
    tags: ["auth"],
    auth: true,
    body: a.PasswordRequest,
    response: a.OkSet,
  },

  auctionsPing: {
    method: "GET",
    path: "/api/v1/auctions/ping",
    summary: "Capability-gate probe (200 where `auction` is enabled, else 403)",
    tags: ["auctions"],
    auth: true,
    response: a.AuctionPingResponse,
    errors: [403],
  },

  // --- Phase 2: catalog --------------------------------------------
  catalogCategories: {
    method: "GET",
    path: "/api/v1/catalog/categories",
    summary: "Tenant category list (flat, or `?tree=1` nested)",
    tags: ["catalog"],
    auth: false,
    query: z.object({ tree: z.enum(["0", "1"]).optional() }),
    response: c.CategoriesResponse,
  },
  catalogProducts: {
    method: "GET",
    path: "/api/v1/catalog/products",
    summary: "Browse published products for the tenant (cursor paged)",
    tags: ["catalog"],
    auth: false,
    query: z.object({
      category: z.string().optional(),
      vendorId: z.string().optional(),
      sort: c.ProductSort.optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().positive().max(60).optional(),
    }),
    response: c.ProductListResponse,
  },
  catalogProductDetail: {
    method: "GET",
    path: "/api/v1/catalog/products/{slug}",
    summary: "Full product detail: media, variants, offers, reviews, Q&A",
    tags: ["catalog"],
    auth: false,
    response: c.ProductDetailResponse,
    errors: [404],
  },
  catalogReview: {
    method: "POST",
    path: "/api/v1/catalog/products/{slug}/reviews",
    summary: "Create / replace the caller's product review",
    tags: ["catalog"],
    auth: true,
    body: c.ReviewRequest,
    response: c.ReviewResponse,
    errors: [404, 429],
  },
  catalogQuestion: {
    method: "POST",
    path: "/api/v1/catalog/products/{slug}/questions",
    summary: "Ask a question about a product",
    tags: ["catalog"],
    auth: true,
    body: c.QuestionRequest,
    response: c.IdResponse,
    errors: [404, 429],
  },
  search: {
    method: "GET",
    path: "/api/v1/search",
    summary: "Full-text + trigram product search (tenant-scoped, page paged)",
    tags: ["catalog"],
    auth: false,
    query: z.object({
      q: z.string().min(1).max(120),
      category: z.string().optional(),
      minPrice: z.coerce.number().int().nonnegative().optional(),
      maxPrice: z.coerce.number().int().positive().optional(),
      sort: z.enum(["relevance", "price_asc", "price_desc", "newest"]).optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(60).optional(),
    }),
    response: c.SearchResponse,
  },
  searchNearby: {
    method: "GET",
    path: "/api/v1/search/nearby",
    summary: "Vendors within a radius of a point (PostGIS)",
    tags: ["catalog"],
    auth: false,
    query: z.object({
      lat: z.coerce.number(),
      lng: z.coerce.number(),
      radius: z.coerce.number().int().positive().max(50000).optional(),
      limit: z.coerce.number().int().positive().max(50).optional(),
    }),
    response: c.NearbyResponse,
  },

  // --- Phase 2: vendors -------------------------------------------
  vendorPage: {
    method: "GET",
    path: "/api/v1/vendors/{id}",
    summary: "Public vendor storefront header",
    tags: ["vendors"],
    auth: false,
    response: c.VendorPageResponse,
    errors: [404],
  },
  vendorProducts: {
    method: "GET",
    path: "/api/v1/vendors/{id}/products",
    summary: "A vendor's published catalogue",
    tags: ["vendors"],
    auth: false,
    query: z.object({
      sort: c.ProductSort.optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().positive().max(60).optional(),
    }),
    response: c.ProductListResponse,
  },
  vendorMe: {
    method: "GET",
    path: "/api/v1/vendors/me",
    summary: "The caller's vendor onboarding + KYC status",
    tags: ["vendors"],
    auth: true,
    response: c.VendorMeResponse,
  },
  vendorOnboarding: {
    method: "POST",
    path: "/api/v1/vendors/onboarding",
    summary: "Register / update the caller as a vendor; opens a KYC case",
    tags: ["vendors"],
    auth: true,
    body: c.OnboardingRequest,
    response: c.OnboardingResponse,
    errors: [429],
  },
  vendorKycReview: {
    method: "POST",
    path: "/api/v1/vendors/kyc/review",
    summary: "STAFF/ADMIN: approve or reject a vendor KYC case",
    tags: ["vendors"],
    auth: true,
    body: c.KycReviewRequest,
    response: c.KycReviewResponse,
    errors: [403, 404],
  },
  vendorMyProducts: {
    method: "GET",
    path: "/api/v1/vendors/products",
    summary: "The vendor's own products (all statuses)",
    tags: ["vendors"],
    auth: true,
    query: z.object({ status: c.ProductStatus.optional() }),
    response: c.MyProductsResponse,
  },
  vendorCreateProduct: {
    method: "POST",
    path: "/api/v1/vendors/products",
    summary: "Create a DRAFT product (offer PAUSED until publish)",
    tags: ["vendors"],
    auth: true,
    body: c.CreateProductRequest,
    response: c.ProductMutationResponse,
    errors: [403, 429],
  },
  vendorUpdateProduct: {
    method: "PATCH",
    path: "/api/v1/vendors/products/{id}",
    summary: "Edit one of the vendor's products",
    tags: ["vendors"],
    auth: true,
    body: c.UpdateProductRequest,
    response: c.ProductMutationResponse,
    errors: [403, 404],
  },
  vendorPublishProduct: {
    method: "POST",
    path: "/api/v1/vendors/products/{id}/publish",
    summary: "Publish a draft (needs image + price)",
    tags: ["vendors"],
    auth: true,
    response: c.ProductMutationResponse,
    errors: [400, 403, 404],
  },

  // --- Phase 2: shopper engagement ------------------------------
  wishlistList: {
    method: "GET",
    path: "/api/v1/me/wishlist",
    summary: "The caller's wishlist",
    tags: ["me"],
    auth: true,
    response: c.WishlistResponse,
  },
  wishlistAdd: {
    method: "POST",
    path: "/api/v1/me/wishlist",
    summary: "Add a product to the wishlist",
    tags: ["me"],
    auth: true,
    body: c.WishlistMutationRequest,
    response: c.WishlistToggleResponse,
  },
  wishlistRemove: {
    method: "DELETE",
    path: "/api/v1/me/wishlist",
    summary: "Remove a product from the wishlist",
    tags: ["me"],
    auth: true,
    body: c.WishlistMutationRequest,
    response: c.WishlistToggleResponse,
  },
  recentlyViewedList: {
    method: "GET",
    path: "/api/v1/me/recently-viewed",
    summary: "The caller's recently-viewed products",
    tags: ["me"],
    auth: true,
    query: z.object({ limit: z.coerce.number().int().positive().max(40).optional() }),
    response: c.RecentlyViewedResponse,
  },
  recentlyViewedRecord: {
    method: "POST",
    path: "/api/v1/me/recently-viewed",
    summary: "Record a product view",
    tags: ["me"],
    auth: true,
    body: c.WishlistMutationRequest,
    response: ok(z.object({ recorded: z.boolean() })),
  },

  // --- Phase 2 depth: promotions + home + vendor extras ---------
  catalogHome: {
    method: "GET",
    path: "/api/v1/catalog/home",
    summary: "Customer home screen — promo rails + product rails in one call",
    tags: ["catalog"],
    auth: false,
    response: c.HomeRailsResponse,
  },
  promotions: {
    method: "GET",
    path: "/api/v1/promotions",
    summary: "Running promotions for the tenant",
    tags: ["catalog"],
    auth: false,
    query: z.object({ kind: c.PromotionKind.optional() }),
    response: c.PromotionListResponse,
  },
  promotionDetail: {
    method: "GET",
    path: "/api/v1/promotions/{slug}",
    summary: "One promotion with its published items",
    tags: ["catalog"],
    auth: false,
    response: c.PromotionDetailResponse,
    errors: [404],
  },
  catalogSimilar: {
    method: "GET",
    path: "/api/v1/catalog/products/{slug}/similar",
    summary: "Same-category published products",
    tags: ["catalog"],
    auth: false,
    query: z.object({ limit: z.coerce.number().int().positive().max(20).optional() }),
    response: c.SimilarResponse,
  },
  vendorDocumentsList: {
    method: "GET",
    path: "/api/v1/vendors/business/documents",
    summary: "KYC evidence documents on the caller's business",
    tags: ["vendors"],
    auth: true,
    response: c.BusinessDocumentsResponse,
  },
  vendorDocumentAdd: {
    method: "POST",
    path: "/api/v1/vendors/business/documents",
    summary: "Attach a KYC document",
    tags: ["vendors"],
    auth: true,
    body: c.AddBusinessDocumentRequest,
    response: c.AddBusinessDocumentResponse,
    errors: [403, 429],
  },
  vendorStats: {
    method: "GET",
    path: "/api/v1/vendors/stats",
    summary: "Seller dashboard product-performance stub",
    tags: ["vendors"],
    auth: true,
    response: c.VendorStatsResponse,
    errors: [403],
  },

  // --- Phase 3: addresses ---------------------------------------
  addressesList: { method: "GET", path: "/api/v1/me/addresses", summary: "The caller's address book", tags: ["commerce"], auth: true, response: m.AddressesResponse },
  addressCreate: { method: "POST", path: "/api/v1/me/addresses", summary: "Add an address", tags: ["commerce"], auth: true, body: m.AddressInput, response: m.AddressResponse },
  addressUpdate: { method: "PATCH", path: "/api/v1/me/addresses/{id}", summary: "Edit an address (or set default)", tags: ["commerce"], auth: true, body: m.AddressInput.partial(), response: m.AddressResponse, errors: [404] },
  addressDelete: { method: "DELETE", path: "/api/v1/me/addresses/{id}", summary: "Remove an address", tags: ["commerce"], auth: true, response: m.DeletedResponse, errors: [404] },

  // --- Phase 3: cart -----------------------------------------------
  cartGet: { method: "GET", path: "/api/v1/cart", summary: "Active cart (multi-vendor grouped)", tags: ["commerce"], auth: true, response: m.CartResponse },
  cartClear: { method: "DELETE", path: "/api/v1/cart", summary: "Empty the cart", tags: ["commerce"], auth: true, query: z.object({ keepSaved: z.enum(["0", "1"]).optional() }), response: m.CartResponse },
  cartAddItem: { method: "POST", path: "/api/v1/cart/items", summary: "Add an offer/variant to the cart", tags: ["commerce"], auth: true, body: m.AddItemRequest, response: m.CartResponse, errors: [404, 409, 429] },
  cartUpdateItem: { method: "PATCH", path: "/api/v1/cart/items/{id}", summary: "Change quantity or save-for-later", tags: ["commerce"], auth: true, body: m.UpdateItemRequest, response: m.CartResponse, errors: [404] },
  cartRemoveItem: { method: "DELETE", path: "/api/v1/cart/items/{id}", summary: "Remove a cart item", tags: ["commerce"], auth: true, response: m.CartResponse, errors: [404] },
  cartApplyCoupon: { method: "POST", path: "/api/v1/cart/coupon", summary: "Attach a coupon to the cart", tags: ["commerce"], auth: true, body: m.CouponCodeRequest, response: m.CartResponse, errors: [400, 403] },
  cartRemoveCoupon: { method: "DELETE", path: "/api/v1/cart/coupon", summary: "Detach the cart coupon", tags: ["commerce"], auth: true, response: m.CartResponse },

  // --- Phase 3: coupons -----------------------------------------
  couponsList: { method: "GET", path: "/api/v1/coupons", summary: "Coupons available on this tenant", tags: ["commerce"], auth: true, response: m.CouponsResponse, errors: [403] },
  couponsValidate: { method: "POST", path: "/api/v1/coupons/validate", summary: "Dry-run a coupon against the cart", tags: ["commerce"], auth: true, body: m.CouponCodeRequest, response: m.CouponEvaluationResponse, errors: [403] },

  // --- Phase 3: checkout + orders -----------------------------
  checkoutQuote: { method: "POST", path: "/api/v1/checkout/quote", summary: "Price the cart (fees, coupon, per-vendor)", tags: ["commerce"], auth: true, body: m.QuoteRequest, response: m.CheckoutQuoteResponse, errors: [400] },
  checkoutPlace: { method: "POST", path: "/api/v1/checkout", summary: "Place a (multi-vendor) order and pay", tags: ["commerce"], auth: true, idempotent: true, body: m.PlaceOrderRequest, response: m.OrderDetailResponse, errors: [400, 402, 409, 429] },
  ordersList: { method: "GET", path: "/api/v1/orders", summary: "The caller's orders", tags: ["commerce"], auth: true, query: z.object({ status: m.OrderStatus.optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(50).optional() }), response: m.OrdersResponse },
  orderGet: { method: "GET", path: "/api/v1/orders/{id}", summary: "Order detail", tags: ["commerce"], auth: true, response: m.OrderDetailResponse, errors: [404] },
  orderCancel: { method: "POST", path: "/api/v1/orders/{id}/cancel", summary: "Cancel a placed order (refund to the original card, else wallet)", tags: ["commerce"], auth: true, response: m.OrderDetailResponse, errors: [404, 409] },
  orderReturn: { method: "POST", path: "/api/v1/orders/{id}/return", summary: "Request a return on specific items of a completed sub-order", tags: ["commerce"], auth: true, body: m.ReturnRequest, response: m.ReturnResponse, errors: [400, 404, 409] },

  // --- Phase 3: vendor sub-orders -----------------------------
  vendorOrdersList: { method: "GET", path: "/api/v1/vendors/orders", summary: "The vendor's incoming sub-orders", tags: ["commerce"], auth: true, query: z.object({ status: m.VendorOrderStatus.optional() }), response: m.VendorOrdersResponse, errors: [403] },
  vendorOrderGet: { method: "GET", path: "/api/v1/vendors/orders/{id}", summary: "One incoming sub-order in full (items, payout split, fulfilment, timeline)", tags: ["commerce"], auth: true, response: m.VendorOrderDetailResponse, errors: [403, 404] },
  vendorOrderStatus: { method: "PATCH", path: "/api/v1/vendors/orders/{id}", summary: "Advance a sub-order's prep state", tags: ["commerce"], auth: true, body: m.VendorOrderStatusRequest, response: m.VendorOrderMutationResponse, errors: [403, 404, 409] },
  vendorOrderComplete: { method: "POST", path: "/api/v1/vendors/orders/{id}/complete", summary: "Complete a sub-order → release escrow", tags: ["commerce"], auth: true, response: m.VendorOrderMutationResponse, errors: [403, 404, 409] },
  vendorReturnsList: { method: "GET", path: "/api/v1/vendors/returns", summary: "The vendor's return queue", tags: ["commerce"], auth: true, query: z.object({ status: m.ReturnStatus.optional() }), response: m.VendorReturnsResponse, errors: [403] },
  vendorReturnReview: { method: "POST", path: "/api/v1/vendors/returns/{id}/review", summary: "Approve (refund) or reject a return", tags: ["commerce"], auth: true, body: m.ReturnReviewRequest, response: m.ReturnReviewResponse, errors: [403, 404, 409] },
  vendorPayoutsList: { method: "GET", path: "/api/v1/vendors/payouts", summary: "The vendor's payout history", tags: ["commerce"], auth: true, response: m.VendorPayoutsResponse, errors: [403] },
  vendorPayoutRequest: { method: "POST", path: "/api/v1/vendors/payouts", summary: "PIN-gated: cash out the accrued payout balance", tags: ["commerce"], auth: true, body: m.VendorPayoutRequest, response: m.VendorPayoutResponse, errors: [400, 402, 403] },

  // --- Phase 3: wallet + payments ----------------------------
  walletGet: { method: "GET", path: "/api/v1/wallet", summary: "Wallet balance", tags: ["wallet"], auth: true, response: m.WalletResponse, errors: [403] },
  walletTransactions: { method: "GET", path: "/api/v1/wallet/transactions", summary: "Wallet transaction feed", tags: ["wallet"], auth: true, query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(60).optional() }), response: m.WalletTransactionsResponse, errors: [403] },
  walletTopUp: { method: "POST", path: "/api/v1/wallet/topup", summary: "Fund the wallet via a payment gateway", tags: ["wallet"], auth: true, idempotent: true, body: m.TopUpRequest, response: m.TopUpResponse, errors: [400, 402, 403, 429] },
  walletWithdraw: { method: "POST", path: "/api/v1/wallet/withdraw", summary: "PIN-gated withdrawal request", tags: ["wallet"], auth: true, body: m.WithdrawRequest, response: m.WithdrawResponse, errors: [400, 402, 403, 429] },
  paymentMethodsList: { method: "GET", path: "/api/v1/me/payment-methods", summary: "Saved payment methods", tags: ["wallet"], auth: true, response: m.PaymentMethodsResponse },
  paymentMethodAdd: { method: "POST", path: "/api/v1/me/payment-methods", summary: "Save a tokenized payment method", tags: ["wallet"], auth: true, body: m.AddPaymentMethodRequest, response: m.PaymentMethodResponse },
  paymentMethodRemove: { method: "DELETE", path: "/api/v1/me/payment-methods/{id}", summary: "Remove a saved payment method", tags: ["wallet"], auth: true, response: m.DeletedResponse, errors: [404] },
  paymentsWebhook: { method: "POST", path: "/api/v1/payments/webhook", summary: "Gateway payment webhook (signature-authenticated)", tags: ["wallet"], auth: false, query: z.object({ gateway: z.string().max(24).optional() }), response: m.WebhookResponse },

  // --- Phase 4: customer delivery + tracking --------------------
  deliveriesList: { method: "GET", path: "/api/v1/deliveries", summary: "The caller's deliveries", tags: ["delivery"], auth: true, query: z.object({ active: z.enum(["0", "1"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(50).optional() }), response: d.DeliveriesResponse, errors: [403] },
  deliveryCreate: { method: "POST", path: "/api/v1/deliveries", summary: "Create an ad-hoc delivery (wallet-funded)", tags: ["delivery"], auth: true, idempotent: true, body: d.CreateDeliveryRequest, response: d.DeliveryResponse, errors: [400, 402, 403, 409, 429] },
  deliveryEstimate: { method: "POST", path: "/api/v1/deliveries/estimate", summary: "Distance + fee estimate for a route", tags: ["delivery"], auth: true, body: d.EstimateRequest, response: d.EstimateResponse },
  deliveryGet: { method: "GET", path: "/api/v1/deliveries/{id}", summary: "Delivery detail (customer view)", tags: ["delivery"], auth: true, response: d.DeliveryResponse, errors: [404] },
  deliveryTrack: { method: "GET", path: "/api/v1/deliveries/{id}/track", summary: "Live track: courier point, trail, ETA", tags: ["delivery"], auth: true, response: d.DeliveryTrackResponse, errors: [404] },
  deliveryCancel: { method: "POST", path: "/api/v1/deliveries/{id}/cancel", summary: "Cancel before pickup", tags: ["delivery"], auth: true, body: d.CancelRequest, response: d.DeliveryResponse, errors: [404, 409] },
  deliveryRate: { method: "POST", path: "/api/v1/deliveries/{id}/rate", summary: "Rate the courier", tags: ["delivery"], auth: true, body: d.RateRequest, response: d.OkTrue, errors: [403, 404, 409] },
  deliveryDispute: { method: "POST", path: "/api/v1/deliveries/{id}/dispute", summary: "Open a delivery dispute", tags: ["delivery"], auth: true, body: d.DisputeRequest, response: d.IdStatusResponse, errors: [403, 404] },
  deliveryReschedule: { method: "POST", path: "/api/v1/deliveries/{id}/reschedule", summary: "Reschedule a delivery", tags: ["delivery"], auth: true, body: d.RescheduleRequest, response: d.DeliveryResponse, errors: [404] },
  mapsRoute: { method: "GET", path: "/api/v1/maps/route", summary: "Server-proxied route (distance/duration/polyline)", tags: ["delivery"], auth: true, query: z.object({ oLat: z.coerce.number(), oLng: z.coerce.number(), dLat: z.coerce.number(), dLng: z.coerce.number() }), response: d.RouteEstimateResponse },

  // --- Phase 4: courier onboarding + fleet ----------------------
  courierMe: { method: "GET", path: "/api/v1/courier/me", summary: "Courier onboarding + KYC + fleet status", tags: ["courier"], auth: true, response: d.CourierMeResponse },
  courierOnboarding: { method: "POST", path: "/api/v1/courier/onboarding", summary: "Register as a courier; open a KYC case", tags: ["courier"], auth: true, body: d.CourierOnboardingRequest, response: d.MutationResponse, errors: [429] },
  courierKycSubmit: { method: "POST", path: "/api/v1/courier/kyc", summary: "Submit courier KYC documents + selfie", tags: ["courier"], auth: true, body: d.CourierKycRequest, response: d.MutationResponse, errors: [403] },
  courierKycReview: { method: "POST", path: "/api/v1/courier/kyc/review", summary: "STAFF/ADMIN: decide a courier KYC case", tags: ["courier"], auth: true, body: d.CourierKycReviewRequest, response: d.MutationResponse, errors: [403, 404] },
  courierVehicleAdd: { method: "POST", path: "/api/v1/courier/vehicles", summary: "Add a vehicle (PENDING review)", tags: ["courier"], auth: true, body: d.VehicleInput, response: d.MutationResponse, errors: [403] },
  courierVehicleUpdate: { method: "PATCH", path: "/api/v1/courier/vehicles/{id}", summary: "Edit a vehicle (re-opens review)", tags: ["courier"], auth: true, body: d.VehicleInput.partial(), response: d.MutationResponse, errors: [403, 404] },
  courierVehicleRemove: { method: "DELETE", path: "/api/v1/courier/vehicles/{id}", summary: "Remove a vehicle", tags: ["courier"], auth: true, response: d.DeletedResponse, errors: [403, 404] },
  courierVehicleActivate: { method: "POST", path: "/api/v1/courier/vehicles/{id}/active", summary: "Set the active vehicle (must be approved)", tags: ["courier"], auth: true, response: d.MutationResponse, errors: [403, 404, 409] },
  courierVehicleDocAdd: { method: "POST", path: "/api/v1/courier/vehicles/{id}/documents", summary: "Attach a vehicle document", tags: ["courier"], auth: true, body: d.VehicleDocumentRequest, response: d.MutationResponse, errors: [403, 404] },
  courierVehicleReview: { method: "POST", path: "/api/v1/courier/vehicles/review", summary: "STAFF/ADMIN: decide a vehicle", tags: ["courier"], auth: true, body: d.VehicleReviewRequest, response: d.MutationResponse, errors: [403, 404] },
  courierServiceAreaUpsert: { method: "POST", path: "/api/v1/courier/service-areas", summary: "Create / update a service area", tags: ["courier"], auth: true, body: d.ServiceAreaRequest, response: d.IdResponse, errors: [403, 404] },
  courierServiceAreaRemove: { method: "DELETE", path: "/api/v1/courier/service-areas/{id}", summary: "Delete a service area", tags: ["courier"], auth: true, response: d.DeletedResponse, errors: [403, 404] },
  courierAvailability: { method: "PATCH", path: "/api/v1/courier/availability", summary: "Replace the weekly availability grid", tags: ["courier"], auth: true, body: d.AvailabilityRequest, response: d.MutationResponse, errors: [403] },

  // --- Phase 4: courier working state + jobs -------------------
  courierOnline: { method: "POST", path: "/api/v1/courier/online", summary: "Go online (starts a shift; joins dispatch)", tags: ["courier"], auth: true, body: d.OnlineRequest, response: d.OnlineResponse, errors: [403] },
  courierOffline: { method: "POST", path: "/api/v1/courier/offline", summary: "Go offline", tags: ["courier"], auth: true, response: d.OnlineResponse, errors: [403] },
  courierHeartbeat: { method: "POST", path: "/api/v1/courier/heartbeat", summary: "Position heartbeat while online", tags: ["courier"], auth: true, body: d.HeartbeatRequest, response: d.MutationResponse, errors: [403, 429] },
  courierDashboard: { method: "GET", path: "/api/v1/courier/dashboard", summary: "Courier home dashboard", tags: ["courier"], auth: true, response: d.CourierDashboardResponse },
  courierPerformance: { method: "GET", path: "/api/v1/courier/performance", summary: "Performance metrics + rating breakdown", tags: ["courier"], auth: true, response: d.CourierPerformanceResponse },
  courierJobs: { method: "GET", path: "/api/v1/courier/jobs", summary: "Available jobs (offers, PII-masked)", tags: ["courier"], auth: true, query: z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), response: d.JobsResponse, errors: [403] },
  courierJobDetail: { method: "GET", path: "/api/v1/courier/jobs/{id}", summary: "One job (pre-acceptance detail)", tags: ["courier"], auth: true, response: d.JobDetailResponse, errors: [403, 404] },
  courierOfferRespond: { method: "POST", path: "/api/v1/courier/offers/{id}/respond", summary: "Accept / decline a dispatch offer", tags: ["courier"], auth: true, body: d.OfferRespondRequest, response: d.DeliveryIdStatusResponse, errors: [403, 404, 409] },

  // --- Phase 4: courier active delivery -----------------------
  courierDeliveries: { method: "GET", path: "/api/v1/courier/deliveries", summary: "The courier's deliveries", tags: ["courier"], auth: true, query: z.object({ active: z.enum(["0", "1"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(50).optional() }), response: d.DeliveriesResponse, errors: [403] },
  courierDeliveryGet: { method: "GET", path: "/api/v1/courier/deliveries/{id}", summary: "Delivery detail (courier view)", tags: ["courier"], auth: true, response: d.DeliveryResponse, errors: [403, 404] },
  courierDeliveryAdvance: { method: "POST", path: "/api/v1/courier/deliveries/{id}/advance", summary: "Advance the delivery state machine", tags: ["courier"], auth: true, body: d.AdvanceRequest, response: d.DeliveryResponse, errors: [403, 404, 409] },
  courierVerifyPickup: { method: "POST", path: "/api/v1/courier/deliveries/{id}/verify-pickup", summary: "Verify pickup (OTP/QR/photo/count)", tags: ["courier"], auth: true, body: d.VerifyPickupRequest, response: d.DeliveryResponse, errors: [400, 403, 404, 409] },
  courierVerifyDropoff: { method: "POST", path: "/api/v1/courier/deliveries/{id}/verify-dropoff", summary: "Verify drop-off (OTP/QR/signature/photo)", tags: ["courier"], auth: true, body: d.VerifyDropoffRequest, response: d.DeliveryResponse, errors: [400, 403, 404, 409] },
  courierPod: { method: "POST", path: "/api/v1/courier/deliveries/{id}/pod", summary: "Submit proof-of-delivery photos", tags: ["courier"], auth: true, body: d.PodRequest, response: d.DeliveryResponse, errors: [403, 404] },
  courierFail: { method: "POST", path: "/api/v1/courier/deliveries/{id}/fail", summary: "Mark recipient unavailable", tags: ["courier"], auth: true, body: d.FailRequest, response: d.DeliveryResponse, errors: [403, 404, 409] },
  courierDeliveryCancel: { method: "POST", path: "/api/v1/courier/deliveries/{id}/cancel", summary: "Drop the assignment (re-dispatches)", tags: ["courier"], auth: true, body: d.CourierCancelRequest, response: d.DeliveryIdStatusResponse, errors: [403, 404, 409] },
  courierBreadcrumb: { method: "POST", path: "/api/v1/courier/deliveries/{id}/breadcrumb", summary: "Post a location breadcrumb (REST fallback)", tags: ["courier"], auth: true, body: d.BreadcrumbRequest, response: d.BreadcrumbResponse, errors: [403, 404, 429] },
  courierDeliveryRate: { method: "POST", path: "/api/v1/courier/deliveries/{id}/rate", summary: "Rate the customer", tags: ["courier"], auth: true, body: d.RateRequest, response: d.OkTrue, errors: [403, 404, 409] },

  // --- Phase 4: courier earnings + payouts -------------------
  courierEarnings: { method: "GET", path: "/api/v1/courier/earnings", summary: "Earnings summary (today/week/month/balance)", tags: ["courier"], auth: true, response: d.EarningsSummaryResponse, errors: [403] },
  courierEarningsTxns: { method: "GET", path: "/api/v1/courier/earnings/transactions", summary: "Earnings ledger feed", tags: ["courier"], auth: true, query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(100).optional() }), response: d.EarningsTxnsResponse, errors: [403] },
  courierPayouts: { method: "GET", path: "/api/v1/courier/payouts", summary: "Payout history", tags: ["courier"], auth: true, response: d.PayoutsResponse, errors: [403] },
  courierPayoutRequest: { method: "POST", path: "/api/v1/courier/payouts", summary: "PIN-gated payout request", tags: ["courier"], auth: true, body: d.PayoutRequest, response: d.PayoutResponse, errors: [400, 402, 403] },

  // --- Phase 4: vendor pickup handoff -----------------------
  vendorDeliveryGet: { method: "GET", path: "/api/v1/vendors/deliveries/{id}", summary: "Delivery for a vendor's ready sub-order (pickup code)", tags: ["vendors"], auth: true, response: d.DeliveryResponse, errors: [403, 404] },

  // --- Phase 5: Inverse Draws / auctions (capability: auction) ---
  auctionsList: { method: "GET", path: "/api/v1/auctions", summary: "Live Inverse Draws (GrandPrice only)", tags: ["auctions"], auth: false, query: z.object({ status: x.AuctionStatus.optional() }), response: x.AuctionsResponse, errors: [403] },
  auctionGet: { method: "GET", path: "/api/v1/auctions/{slug}", summary: "One draw — asset, packages, my seats + score, draw proof", tags: ["auctions"], auth: false, response: x.AuctionDetailResponse, errors: [403, 404] },
  auctionLeaderboard: { method: "GET", path: "/api/v1/auctions/{slug}/leaderboard", summary: "Qualification ranking", tags: ["auctions"], auth: false, query: z.object({ limit: z.coerce.number().int().positive().max(100).optional() }), response: x.LeaderboardResponse, errors: [403, 404] },
  auctionQualification: { method: "GET", path: "/api/v1/auctions/{slug}/qualification", summary: "My qualification breakdown + rank", tags: ["auctions"], auth: true, response: x.QualificationResponse, errors: [403, 404] },
  auctionQualify: { method: "POST", path: "/api/v1/auctions/{slug}/qualify", summary: "Record an engagement / share / referral signal", tags: ["auctions"], auth: true, body: x.QualifyRequest, response: x.QualifyResponse, errors: [403, 404] },
  auctionBuyTickets: { method: "POST", path: "/api/v1/auctions/{slug}/tickets", summary: "Buy seats (package or count) via wallet / gateway", tags: ["auctions"], auth: true, idempotent: true, body: x.BuyTicketsRequest, response: x.BuyTicketsResponse, errors: [400, 402, 403, 409, 429] },
  myTicketWallets: { method: "GET", path: "/api/v1/me/tickets", summary: "My ticket wallets across draws", tags: ["auctions"], auth: true, response: x.TicketWalletsResponse, errors: [403] },
  myTicketsForAuction: { method: "GET", path: "/api/v1/me/tickets/{slug}", summary: "My seats in one draw", tags: ["auctions"], auth: true, response: x.MyTicketsResponse, errors: [403, 404] },
  auctionMyWin: { method: "GET", path: "/api/v1/auctions/{slug}/me/win", summary: "Am I the winner / a backup?", tags: ["auctions"], auth: true, response: x.MyWinResponse, errors: [403, 404] },
  auctionClaimStart: { method: "POST", path: "/api/v1/auctions/{slug}/claim", summary: "Open a prize claim (winner)", tags: ["auctions"], auth: true, response: x.ClaimResponse, errors: [403, 404, 409] },
  auctionClaimKyc: { method: "POST", path: "/api/v1/auctions/claims/{id}/kyc", summary: "Submit prize-claim KYC documents", tags: ["auctions"], auth: true, body: x.ClaimKycRequest, response: x.ClaimResponse, errors: [403, 404] },
  auctionWinPurchase: { method: "POST", path: "/api/v1/auctions/{slug}/win-purchase", summary: "Winner buys the item at winTarget", tags: ["auctions"], auth: true, idempotent: true, body: x.WinPurchaseRequest, response: x.WinPurchaseResponse, errors: [402, 403, 404, 409] },
  auctionDispute: { method: "POST", path: "/api/v1/auctions/{slug}/dispute", summary: "Open an auction dispute", tags: ["auctions"], auth: true, body: x.DisputeRequest, response: x.IdStatusResponse, errors: [403, 404] },
  auctionCreate: { method: "POST", path: "/api/v1/auctions/admin", summary: "STAFF/ADMIN: create a draw", tags: ["auctions"], auth: true, body: x.CreateAuctionRequest, response: x.CreateAuctionResponse, errors: [400, 403] },
  auctionSetStatus: { method: "POST", path: "/api/v1/auctions/{slug}/status", summary: "STAFF/ADMIN: advance the auction lifecycle", tags: ["auctions"], auth: true, body: x.StatusRequest, response: x.StatusResponse, errors: [403, 404, 409] },
  auctionDrawCommit: { method: "POST", path: "/api/v1/auctions/{slug}/draw/commit", summary: "STAFF/ADMIN: publish the seed commitment", tags: ["auctions"], auth: true, response: x.DrawCommitResponse, errors: [403, 404, 409] },
  auctionDrawRun: { method: "POST", path: "/api/v1/auctions/{slug}/draw/run", summary: "STAFF/ADMIN: reveal + run the weighted draw", tags: ["auctions"], auth: true, response: x.DrawRunResponse, errors: [403, 404, 409] },
  auctionClaimReview: { method: "POST", path: "/api/v1/auctions/claims/{id}/review", summary: "STAFF/ADMIN: approve / reject a claim (reject promotes a backup)", tags: ["auctions"], auth: true, body: x.ClaimReviewRequest, response: x.ClaimReviewResponse, errors: [403, 404] },
  auctionPrizeFulfil: { method: "POST", path: "/api/v1/auctions/claims/{id}/fulfil", summary: "STAFF/ADMIN: fulfil a prize (DELIVERY reuses Phase 4)", tags: ["auctions"], auth: true, body: x.FulfilRequest, response: x.FulfilResponse, errors: [400, 403, 404, 409] },

  // --- Phase 6: chat ---------------------------------------------
  conversationsList: { method: "GET", path: "/api/v1/conversations", summary: "The caller's conversations (unread counts)", tags: ["chat"], auth: true, response: k.ConversationsResponse },
  conversationForOrder: { method: "POST", path: "/api/v1/conversations/for-order", summary: "Open/reuse the customer↔vendor thread for an order", tags: ["chat"], auth: true, body: z.object({ orderId: z.string() }), response: k.ConversationRefResponse, errors: [404, 409] },
  conversationForDelivery: { method: "POST", path: "/api/v1/conversations/for-delivery", summary: "Open/reuse the customer↔courier thread for a delivery", tags: ["chat"], auth: true, body: z.object({ deliveryId: z.string() }), response: k.ConversationRefResponse, errors: [404, 409] },
  messagesList: { method: "GET", path: "/api/v1/conversations/{id}/messages", summary: "Messages (paged, marks delivered)", tags: ["chat"], auth: true, query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(60).optional() }), response: k.MessagesResponse, errors: [403] },
  messageSend: { method: "POST", path: "/api/v1/conversations/{id}/messages", summary: "Send a message / attachment / shared entity", tags: ["chat"], auth: true, body: k.SendMessageRequest, response: k.MessageSentResponse, errors: [400, 403, 429] },
  conversationRead: { method: "POST", path: "/api/v1/conversations/{id}/read", summary: "Mark a conversation read", tags: ["chat"], auth: true, response: k.OkReadResponse, errors: [403] },
  conversationMute: { method: "POST", path: "/api/v1/conversations/{id}/mute", summary: "Mute / unmute a conversation", tags: ["chat"], auth: true, body: z.object({ muted: z.boolean() }), response: k.OkMutedResponse, errors: [403] },
  blocksList: { method: "GET", path: "/api/v1/me/blocks", summary: "Blocked users", tags: ["chat"], auth: true, response: k.BlocksResponse },
  blockAdd: { method: "POST", path: "/api/v1/me/blocks", summary: "Block a user", tags: ["chat"], auth: true, body: k.BlockRequest, response: k.BlockToggleResponse },
  blockRemove: { method: "DELETE", path: "/api/v1/me/blocks/{id}", summary: "Unblock a user", tags: ["chat"], auth: true, response: k.BlockToggleResponse },

  // --- Phase 6: notifications ---------------------------------
  notificationsList: { method: "GET", path: "/api/v1/notifications", summary: "In-app notification feed", tags: ["notifications"], auth: true, query: z.object({ unread: z.enum(["0", "1"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(60).optional() }), response: k.NotificationsResponse },
  notificationRead: { method: "POST", path: "/api/v1/notifications/{id}/read", summary: "Mark one read", tags: ["notifications"], auth: true, response: k.OkReadResponse, errors: [404] },
  notificationsReadAll: { method: "POST", path: "/api/v1/notifications/read-all", summary: "Mark all read", tags: ["notifications"], auth: true, response: k.OkCountResponse },
  notificationPrefsGet: { method: "GET", path: "/api/v1/notifications/preferences", summary: "Per-category preferences", tags: ["notifications"], auth: true, response: k.PreferencesResponse },
  notificationPrefsSet: { method: "PATCH", path: "/api/v1/notifications/preferences", summary: "Update one category's channels", tags: ["notifications"], auth: true, body: k.SetPreferenceRequest, response: k.PreferencesResponse },

  // --- Phase 6: reports + security ---------------------------
  reportSubmit: { method: "POST", path: "/api/v1/reports", summary: "Report a user / product / vendor / courier / order / delivery", tags: ["trust"], auth: true, body: k.ReportRequest, response: k.IdStatusResponse },
  myReports: { method: "GET", path: "/api/v1/me/reports", summary: "Reports I've filed", tags: ["trust"], auth: true, response: k.MyReportsResponse },
  securityCentre: { method: "GET", path: "/api/v1/me/security", summary: "Security centre summary", tags: ["trust"], auth: true, response: k.SecurityCentreResponse },

  // --- Phase 6: disputes -----------------------------------
  disputesList: { method: "GET", path: "/api/v1/disputes", summary: "My disputes", tags: ["trust"], auth: true, response: k.DisputesResponse },
  disputeOpen: { method: "POST", path: "/api/v1/disputes", summary: "Open a dispute", tags: ["trust"], auth: true, body: k.OpenDisputeRequest, response: k.OpenDisputeResponse, errors: [403, 404, 409] },
  disputeGet: { method: "GET", path: "/api/v1/disputes/{id}", summary: "Dispute detail (evidence + messages + appeal)", tags: ["trust"], auth: true, response: k.DisputeResponse, errors: [403, 404] },
  disputeEvidence: { method: "POST", path: "/api/v1/disputes/{id}/evidence", summary: "Add evidence", tags: ["trust"], auth: true, body: k.EvidenceRequest, response: k.OkAddedResponse, errors: [403, 404, 409] },
  disputeMessage: { method: "POST", path: "/api/v1/disputes/{id}/messages", summary: "Message on a dispute", tags: ["trust"], auth: true, body: k.DisputeMessageRequest, response: k.OkSentResponse, errors: [403, 404] },
  disputeAppeal: { method: "POST", path: "/api/v1/disputes/{id}/appeal", summary: "Appeal a resolved dispute", tags: ["trust"], auth: true, body: k.AppealRequest, response: k.OkStatusResponse, errors: [403, 404, 409] },

  // --- Phase 6: support ----------------------------------
  supportHelp: { method: "GET", path: "/api/v1/support/help", summary: "Help centre / FAQ", tags: ["support"], auth: false, response: k.HelpResponse },
  supportTicketsList: { method: "GET", path: "/api/v1/support/tickets", summary: "My support tickets", tags: ["support"], auth: true, response: k.SupportTicketsResponse },
  supportTicketCreate: { method: "POST", path: "/api/v1/support/tickets", summary: "Open a support ticket (+ a support chat)", tags: ["support"], auth: true, body: k.CreateTicketRequest, response: k.CreateTicketResponse },
  supportTicketGet: { method: "GET", path: "/api/v1/support/tickets/{id}", summary: "Support ticket detail", tags: ["support"], auth: true, response: k.SupportTicketResponse, errors: [404] },

  // --- Phase 6: STAFF / ADMIN console ------------------
  staffKycQueue: { method: "GET", path: "/api/v1/staff/kyc", summary: "STAFF: KYC review queue", tags: ["staff"], auth: true, query: z.object({ status: z.string().optional(), subjectType: z.string().optional() }), response: k.KycQueueResponse, errors: [403] },
  staffKycGet: { method: "GET", path: "/api/v1/staff/kyc/{id}", summary: "STAFF: one KYC case (+ subject summary)", tags: ["staff"], auth: true, response: k.KycCaseResponse, errors: [403, 404] },
  staffKycReview: { method: "POST", path: "/api/v1/staff/kyc/{id}/review", summary: "STAFF: approve / reject / request resubmit — syncs the subject", tags: ["staff"], auth: true, body: k.KycReviewRequest, response: k.StaffMutationResponse, errors: [403, 404] },
  staffDisputes: { method: "GET", path: "/api/v1/staff/disputes", summary: "STAFF: dispute desk", tags: ["staff"], auth: true, query: z.object({ status: z.string().optional() }), response: k.DisputesResponse, errors: [403] },
  staffDisputeAssign: { method: "POST", path: "/api/v1/staff/disputes/{id}/assign", summary: "STAFF: take a dispute", tags: ["staff"], auth: true, response: k.StaffMutationResponse, errors: [403, 404] },
  staffDisputeResolve: { method: "POST", path: "/api/v1/staff/disputes/{id}/resolve", summary: "STAFF: resolve (optional wallet refund)", tags: ["staff"], auth: true, body: k.ResolveDisputeRequest, response: k.StaffMutationResponse, errors: [403, 404, 409] },
  staffDisputeMessage: { method: "POST", path: "/api/v1/staff/disputes/{id}/message", summary: "STAFF: message on a dispute (optionally staff-only)", tags: ["staff"], auth: true, body: z.object({ body: z.string().min(1).max(2000), staffOnly: z.boolean().optional() }), response: k.OkSentResponse, errors: [403, 404] },
  staffAppealDecision: { method: "POST", path: "/api/v1/staff/disputes/{id}/appeal-decision", summary: "STAFF: uphold / deny an appeal", tags: ["staff"], auth: true, body: k.AppealDecisionRequest, response: k.StaffMutationResponse, errors: [403, 404] },
  staffReports: { method: "GET", path: "/api/v1/staff/reports", summary: "STAFF: report triage", tags: ["staff"], auth: true, query: z.object({ status: z.string().optional() }), response: k.ReportsResponse, errors: [403] },
  staffReportAction: { method: "POST", path: "/api/v1/staff/reports/{id}/action", summary: "STAFF: action a report (+ optional safety action)", tags: ["staff"], auth: true, body: k.ActionReportRequest, response: k.StaffMutationResponse, errors: [403, 404] },
  staffSafetyAction: { method: "POST", path: "/api/v1/staff/safety-action", summary: "STAFF: warn / restrict / suspend / ban / clear", tags: ["staff"], auth: true, body: k.SafetyActionRequest, response: k.StaffMutationResponse, errors: [403] },
  staffSupportTickets: { method: "GET", path: "/api/v1/staff/support/tickets", summary: "STAFF: support queue", tags: ["staff"], auth: true, query: z.object({ status: z.string().optional() }), response: k.StaffTicketsResponse, errors: [403] },
  staffSupportAssign: { method: "POST", path: "/api/v1/staff/support/tickets/{id}/assign", summary: "STAFF: take a ticket (joins its chat)", tags: ["staff"], auth: true, response: k.StaffMutationResponse, errors: [403, 404] },
  staffSupportStatus: { method: "POST", path: "/api/v1/staff/support/tickets/{id}/status", summary: "STAFF: set a ticket's status", tags: ["staff"], auth: true, body: z.object({ status: z.string() }), response: k.OkStatusResponse, errors: [403, 404] },

  // --- Phase 7: advertising / boosting ---------------------
  adsTiers: { method: "GET", path: "/api/v1/ads/tiers", summary: "Active boost / ad tiers (backend-editable)", tags: ["ads"], auth: true, response: ad.BoostTiersResponse, errors: [403] },
  adsSponsored: { method: "GET", path: "/api/v1/ads/sponsored", summary: "Sponsored creatives for a placement slot", tags: ["ads"], auth: false, query: z.object({ slot: ad.AdPlacementSlot, categoryId: z.string().optional(), limit: z.coerce.number().int().min(1).max(10).optional() }), response: ad.SponsoredResponse },
  adsEvent: { method: "POST", path: "/api/v1/ads/events", summary: "Log an ad impression / click", tags: ["ads"], auth: false, body: ad.AdEventRequest, response: ad.AdEventResponse },

  campaignsList: { method: "GET", path: "/api/v1/vendors/campaigns", summary: "My ad campaigns", tags: ["ads"], auth: true, query: z.object({ status: z.string().optional() }), response: ad.CampaignsResponse, errors: [403] },
  campaignCreate: { method: "POST", path: "/api/v1/vendors/campaigns", summary: "Create a campaign (DRAFT)", tags: ["ads"], auth: true, body: ad.CreateCampaignRequest, response: ok(ad.Campaign), errors: [403, 400] },
  campaignGet: { method: "GET", path: "/api/v1/vendors/campaigns/{id}", summary: "Campaign detail + performance", tags: ["ads"], auth: true, response: ad.CampaignDetailResponse, errors: [403, 404] },
  campaignUpdate: { method: "PATCH", path: "/api/v1/vendors/campaigns/{id}", summary: "Edit a draft campaign", tags: ["ads"], auth: true, body: ad.UpdateCampaignRequest, response: ok(ad.Campaign), errors: [403, 404, 409] },
  campaignSetProducts: { method: "POST", path: "/api/v1/vendors/campaigns/{id}/products", summary: "Set the promoted products", tags: ["ads"], auth: true, body: ad.SetProductsRequest, response: ok(z.object({ count: z.number().int() })), errors: [403, 404, 409] },
  campaignAddCreative: { method: "POST", path: "/api/v1/vendors/campaigns/{id}/creatives", summary: "Add a creative", tags: ["ads"], auth: true, body: ad.CreativeRequest, response: ok(z.object({ id: z.string(), slot: ad.AdPlacementSlot, creativeKind: z.string() })), errors: [403, 404] },
  campaignEditCreative: { method: "PATCH", path: "/api/v1/vendors/campaigns/{id}/creatives/{adId}", summary: "Edit a creative", tags: ["ads"], auth: true, body: ad.CreativeRequest.partial().extend({ isActive: z.boolean().optional() }), response: ok(z.object({ id: z.string(), isActive: z.boolean() })), errors: [403, 404] },
  campaignDeleteCreative: { method: "DELETE", path: "/api/v1/vendors/campaigns/{id}/creatives/{adId}", summary: "Delete a creative", tags: ["ads"], auth: true, response: ok(z.object({ id: z.string(), removed: z.boolean() })), errors: [403, 404] },
  campaignSubmit: { method: "POST", path: "/api/v1/vendors/campaigns/{id}/submit", summary: "Submit for review / activate — charges the budget", tags: ["ads"], auth: true, idempotent: true, body: ad.SubmitCampaignRequest, response: ok(ad.Campaign), errors: [402, 403, 404, 409] },
  campaignPause: { method: "POST", path: "/api/v1/vendors/campaigns/{id}/pause", summary: "Pause an active campaign", tags: ["ads"], auth: true, response: ok(ad.Campaign), errors: [403, 404, 409] },
  campaignResume: { method: "POST", path: "/api/v1/vendors/campaigns/{id}/resume", summary: "Resume a paused campaign", tags: ["ads"], auth: true, response: ok(ad.Campaign), errors: [403, 404, 409] },
  campaignCancel: { method: "POST", path: "/api/v1/vendors/campaigns/{id}/cancel", summary: "Cancel + settle a campaign (refund unspent)", tags: ["ads"], auth: true, response: ok(ad.Campaign), errors: [403, 404, 409] },

  boostsList: { method: "GET", path: "/api/v1/vendors/boosts", summary: "My product boosts", tags: ["ads"], auth: true, response: ad.BoostsResponse, errors: [403] },
  boostCreate: { method: "POST", path: "/api/v1/vendors/boosts", summary: "Boost a product for N days", tags: ["ads"], auth: true, idempotent: true, body: ad.CreateBoostRequest, response: ok(z.object({ id: z.string(), status: z.string(), endsAt: z.string(), priceMinor: z.number().int() })), errors: [402, 403] },
  boostCancel: { method: "POST", path: "/api/v1/vendors/boosts/{id}/cancel", summary: "Cancel a boost (pro-rata refund)", tags: ["ads"], auth: true, response: ok(z.object({ id: z.string(), status: z.string(), refundMinor: z.number().int() })), errors: [403, 404, 409] },

  // --- Phase 7: analytics -------------------------------
  vendorAnalytics: { method: "GET", path: "/api/v1/vendors/analytics", summary: "Vendor analytics — sales, products, customers, payouts, ad ROI", tags: ["analytics"], auth: true, query: z.object({ days: z.coerce.number().int().min(1).max(365).optional() }), response: ad.VendorAnalyticsResponse, errors: [403] },
  courierAnalytics: { method: "GET", path: "/api/v1/courier/analytics", summary: "Courier analytics — completion, acceptance, on-time, earnings", tags: ["analytics"], auth: true, query: z.object({ days: z.coerce.number().int().min(1).max(365).optional() }), response: ad.CourierAnalyticsResponse, errors: [403] },

  // --- Phase 7: referrals ------------------------------
  referralMe: { method: "GET", path: "/api/v1/me/referrals", summary: "My referral code + progress", tags: ["referrals"], auth: true, response: ad.ReferralSummary },
  referralApply: { method: "POST", path: "/api/v1/me/referrals/apply", summary: "Apply a referral code (new accounts only)", tags: ["referrals"], auth: true, body: ad.ApplyReferralRequest, response: ad.ApplyReferralResponse, errors: [404, 409] },

  // --- Phase 7: STAFF advertising + config console ------
  staffCampaigns: { method: "GET", path: "/api/v1/staff/campaigns", summary: "STAFF: campaign review queue", tags: ["staff"], auth: true, response: ad.ReviewQueueResponse, errors: [403] },
  staffCampaignReview: { method: "POST", path: "/api/v1/staff/campaigns/{id}/review", summary: "STAFF: approve / reject a campaign", tags: ["staff"], auth: true, body: ad.CampaignReviewRequest, response: ad.StaffMutationResponse, errors: [403, 404, 409] },
  staffBoostTiersList: { method: "GET", path: "/api/v1/staff/boost-tiers", summary: "STAFF: all boost tiers (incl. inactive)", tags: ["staff"], auth: true, response: ok(z.object({ items: z.array(z.record(z.string(), z.unknown())) })), errors: [403] },
  staffBoostTierUpsert: { method: "POST", path: "/api/v1/staff/boost-tiers", summary: "STAFF: create / update a boost tier", tags: ["staff"], auth: true, body: z.record(z.string(), z.unknown()), response: ad.StaffMutationResponse, errors: [403, 400] },
  staffBoostTierDeactivate: { method: "DELETE", path: "/api/v1/staff/boost-tiers/{key}", summary: "STAFF: deactivate a boost tier", tags: ["staff"], auth: true, response: ad.StaffMutationResponse, errors: [403, 404] },
  staffDashboard: { method: "GET", path: "/api/v1/staff/dashboard", summary: "STAFF: ops dashboard KPIs + queues", tags: ["staff"], auth: true, response: ad.StaffMutationResponse, errors: [403] },
  staffAnalytics: { method: "GET", path: "/api/v1/staff/analytics", summary: "STAFF: platform analytics", tags: ["staff"], auth: true, query: z.object({ days: z.coerce.number().int().optional(), platformSlug: z.string().optional() }), response: ad.StaffMutationResponse, errors: [403] },
  staffAnalyticsTrend: { method: "GET", path: "/api/v1/staff/analytics/trend", summary: "STAFF: a KPI trend from daily snapshots", tags: ["staff"], auth: true, query: z.object({ metric: z.string(), days: z.coerce.number().int().optional(), platformSlug: z.string().optional() }), response: ad.StaffMutationResponse, errors: [403] },
  staffFeatureFlags: { method: "GET", path: "/api/v1/staff/feature-flags", summary: "STAFF: feature-flag matrix", tags: ["staff"], auth: true, response: ad.StaffMutationResponse, errors: [403] },
  staffFeatureFlagSet: { method: "POST", path: "/api/v1/staff/feature-flags", summary: "STAFF: set a per-platform flag value", tags: ["staff"], auth: true, body: z.object({ platformSlug: z.string(), flagKey: z.string(), value: z.unknown() }), response: ad.StaffMutationResponse, errors: [403, 404] },
  staffPricing: { method: "GET", path: "/api/v1/staff/pricing", summary: "STAFF: pricing rules + fee schedules", tags: ["staff"], auth: true, response: ad.StaffMutationResponse, errors: [403] },
  staffPricingRuleUpsert: { method: "POST", path: "/api/v1/staff/pricing/rules", summary: "STAFF: create / update a pricing rule", tags: ["staff"], auth: true, body: z.record(z.string(), z.unknown()), response: ad.StaffMutationResponse, errors: [403] },
  staffFeeUpsert: { method: "POST", path: "/api/v1/staff/pricing/fees", summary: "STAFF: create / update a fee schedule", tags: ["staff"], auth: true, body: z.record(z.string(), z.unknown()), response: ad.StaffMutationResponse, errors: [403] },
  staffBroadcasts: { method: "GET", path: "/api/v1/staff/broadcasts", summary: "STAFF: broadcast history", tags: ["staff"], auth: true, response: ad.StaffMutationResponse, errors: [403] },
  staffBroadcastCompose: { method: "POST", path: "/api/v1/staff/broadcasts", summary: "STAFF: compose a broadcast", tags: ["staff"], auth: true, body: z.record(z.string(), z.unknown()), response: ad.StaffMutationResponse, errors: [403] },
  staffBroadcastSend: { method: "POST", path: "/api/v1/staff/broadcasts/{id}/send", summary: "STAFF: send a broadcast now", tags: ["staff"], auth: true, response: ad.StaffMutationResponse, errors: [403, 404] },
  staffAuditLog: { method: "GET", path: "/api/v1/staff/audit-log", summary: "STAFF: audit log (paged)", tags: ["staff"], auth: true, query: z.object({ actorId: z.string().optional(), action: z.string().optional(), targetId: z.string().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().optional() }), response: ad.StaffMutationResponse, errors: [403] },
  staffUsers: { method: "GET", path: "/api/v1/staff/users", summary: "STAFF: user directory search", tags: ["staff"], auth: true, query: z.object({ q: z.string().optional(), limit: z.coerce.number().int().optional() }), response: ad.StaffMutationResponse, errors: [403] },
  staffUserDetail: { method: "GET", path: "/api/v1/staff/users/{id}", summary: "STAFF: user detail + stats", tags: ["staff"], auth: true, response: ad.StaffMutationResponse, errors: [403, 404] },

  // --- Phase 8: privacy (GDPR / CCPA) --------------------
  dataExport: { method: "GET", path: "/api/v1/me/data-export", summary: "Portable JSON bundle of the caller's data", tags: ["privacy"], auth: true, response: ad.StaffMutationResponse, errors: [404, 429] },
  accountDeletionStatus: { method: "GET", path: "/api/v1/me/account/deletion", summary: "Account-deletion request status", tags: ["privacy"], auth: true, response: ad.StaffMutationResponse },
  accountDeletionRequest: { method: "POST", path: "/api/v1/me/account/deletion", summary: "Request account deletion (enters a grace period)", tags: ["privacy"], auth: true, body: z.object({ reason: z.string().max(500).optional() }), response: ad.StaffMutationResponse, errors: [409, 429] },
  accountDeletionCancel: { method: "DELETE", path: "/api/v1/me/account/deletion", summary: "Cancel a pending account deletion", tags: ["privacy"], auth: true, response: ad.StaffMutationResponse, errors: [409] },
} satisfies Record<string, RouteContract>;

export type Routes = typeof routes;

export * as auth from "./auth.ts";
export * as catalog from "./catalog.ts";
export * as commerce from "./commerce.ts";
export * as delivery from "./delivery.ts";
export * as auction from "./auction.ts";
export * as comms from "./comms.ts";
export * as ads from "./ads.ts";
