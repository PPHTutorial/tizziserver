import { z } from "zod";
import { ok } from "./envelope.ts";
import * as a from "./auth.ts";
import * as c from "./catalog.ts";

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
} satisfies Record<string, RouteContract>;

export type Routes = typeof routes;

export * as auth from "./auth.ts";
export * as catalog from "./catalog.ts";
