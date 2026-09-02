import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * Phase 2 catalog + search + vendor contract. Mirrors `@stall/core/catalog` and
 * the `/api/v1/catalog|search|vendors|me/*` routes.
 */

export const ProductCondition = z.enum(["NEW", "USED", "REFURBISHED"]);
export const ProductStatus = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "SUSPENDED"]);
export const ProductSort = z.enum(["relevance", "newest", "price_asc", "price_desc", "rating"]);

// --- shared shapes ------------------------------------------------------
export const Category = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  path: z.string(),
  sortOrder: z.number().int(),
});

export const ProductCard = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  brand: z.string().nullable(),
  image: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  fromPriceMinor: z.number().int().nullable(),
  currency: z.string(),
  offerCount: z.number().int(),
  vendorCount: z.number().int(),
});

export const OfferView = z.object({
  id: z.string(),
  priceMinor: z.number().int(),
  currency: z.string(),
  condition: ProductCondition,
  fulfilment: z.unknown(),
  vendor: z.object({
    id: z.string(),
    displayName: z.string(),
    logo: z.string().nullable(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
  }),
  gas: z
    .object({
      cylinderType: z.string(),
      weightKg: z.number(),
      capacityL: z.number(),
      requiresExchange: z.boolean(),
      depositMinor: z.number().int(),
    })
    .nullable(),
});

export const ProductDetail = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  brand: z.string().nullable(),
  condition: ProductCondition,
  attributes: z.record(z.string(), z.unknown()),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  category: z.object({ id: z.string(), slug: z.string(), name: z.string(), path: z.string() }).nullable(),
  media: z.array(z.object({ kind: z.enum(["IMAGE", "VIDEO"]), fileKey: z.string(), alt: z.string().nullable() })),
  variants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sku: z.string(),
      priceMinor: z.number().int(),
      compareAtMinor: z.number().int().nullable(),
      options: z.record(z.string(), z.unknown()),
    }),
  ),
  fromPriceMinor: z.number().int().nullable(),
  currency: z.string(),
  offers: z.array(OfferView),
  reviewCount: z.number().int(),
  questionCount: z.number().int(),
  reviews: z.array(
    z.object({
      id: z.string(),
      rating: z.number().int(),
      title: z.string().nullable(),
      body: z.string().nullable(),
      author: z.string(),
      avatar: z.string().nullable(),
      at: z.string(),
    }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      body: z.string(),
      at: z.string(),
      answers: z.array(z.object({ id: z.string(), body: z.string(), at: z.string() })),
    }),
  ),
});

// --- responses --------------------------------------------------------
export const CategoriesResponse = ok(z.object({ items: z.array(Category).optional(), tree: z.array(z.unknown()).optional() }));
export const ProductListResponse = ok(z.object({ items: z.array(ProductCard), nextCursor: z.string().nullable() }));
export const ProductDetailResponse = ok(ProductDetail);
export const SearchResponse = ok(
  z.object({ items: z.array(ProductCard), page: z.number().int(), limit: z.number().int(), total: z.number().int() }),
);
export const NearbyResponse = ok(
  z.object({
    items: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        logo: z.string().nullable(),
        ratingAvg: z.number(),
        ratingCount: z.number().int(),
        distanceM: z.number().int(),
      }),
    ),
  }),
);

export const VendorPageResponse = ok(
  z.object({
    id: z.string(),
    displayName: z.string(),
    bio: z.string().nullable(),
    logo: z.string().nullable(),
    banner: z.string().nullable(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    verifiedAt: z.string().nullable(),
    productCount: z.number().int(),
    location: z.string().nullable(),
  }),
);

export const VendorMeResponse = ok(
  z.union([
    z.object({ onboarded: z.literal(false) }),
    z.object({
      onboarded: z.literal(true),
      vendorId: z.string(),
      profileStatus: z.string(),
      kycStatus: z.string(),
      note: z.string().nullable(),
    }),
  ]),
);

// --- requests -------------------------------------------------------
export const OnboardingRequest = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
  business: z.object({
    legalName: z.string().min(2).max(120),
    regNumber: z.string().max(60).optional(),
    phone: z.string().max(24).optional(),
    email: z.string().email().optional(),
    addressLine: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    country: z.string().max(2).optional(),
  }),
});
export const OnboardingResponse = ok(
  z.object({ vendorId: z.string(), status: z.string(), kycStatus: z.string() }),
);

export const CreateProductRequest = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(10).max(4000),
  categoryId: z.string(),
  brand: z.string().max(80).optional(),
  condition: ProductCondition.optional(),
  priceMinor: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  images: z.array(z.string()).max(8).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export const UpdateProductRequest = z.object({
  title: z.string().min(3).max(140).optional(),
  description: z.string().min(10).max(4000).optional(),
  brand: z.string().max(80).optional(),
  categoryId: z.string().optional(),
  priceMinor: z.number().int().positive().optional(),
  images: z.array(z.string()).max(8).optional(),
  quantity: z.number().int().nonnegative().optional(),
});
export const ProductMutationResponse = ok(z.object({ id: z.string(), status: z.string().optional(), updated: z.boolean().optional() }));

export const MyProductsResponse = ok(
  z.object({
    items: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        title: z.string(),
        status: ProductStatus,
        image: z.string().nullable(),
        priceMinor: z.number().int().nullable(),
        currency: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
);

export const KycReviewRequest = z.object({
  vendorId: z.string(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(500).optional(),
});
export const KycReviewResponse = ok(z.object({ vendorId: z.string(), kycStatus: z.string() }));

export const ReviewRequest = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
});
export const ReviewResponse = ok(z.object({ rating: z.number().int(), ratingAvg: z.number(), ratingCount: z.number().int() }));

export const QuestionRequest = z.object({ body: z.string().min(3).max(500) });
export const IdResponse = ok(z.object({ id: z.string() }));

export const WishlistItem = z.object({
  productId: z.string(),
  slug: z.string(),
  title: z.string(),
  image: z.string().nullable(),
  fromPriceMinor: z.number().int().nullable(),
  currency: z.string(),
});
export const WishlistResponse = ok(z.object({ items: z.array(WishlistItem) }));
export const WishlistMutationRequest = z.object({ productId: z.string() });
export const WishlistToggleResponse = ok(z.object({ wished: z.boolean() }));
export const RecentlyViewedResponse = ok(z.object({ items: z.array(WishlistItem) }));

// --- promotions (Domain 8 read side) -------------------------------
export const PromotionKind = z.enum(["FLASH_DEAL", "CAMPAIGN", "BANNER"]);

export const PromotionItemCard = z.object({
  productId: z.string(),
  slug: z.string(),
  title: z.string(),
  brand: z.string().nullable(),
  image: z.string().nullable(),
  currency: z.string(),
  priceMinor: z.number().int().nullable(),
  dealPriceMinor: z.number().int().nullable(),
  discountBps: z.number().int().nullable(),
});

export const PromotionView = z.object({
  slug: z.string(),
  kind: PromotionKind,
  title: z.string(),
  subtitle: z.string().nullable(),
  imageKey: z.string().nullable(),
  ctaRoute: z.string().nullable(),
  endsAt: z.string().nullable(),
  items: z.array(PromotionItemCard),
});

export const PromotionListResponse = ok(z.object({ items: z.array(PromotionView) }));
export const PromotionDetailResponse = ok(PromotionView);

export const HomeRailsResponse = ok(
  z.object({
    flashDeals: z.array(PromotionView),
    campaigns: z.array(PromotionView),
    banners: z.array(PromotionView),
    newArrivals: z.array(ProductCard),
    topRated: z.array(ProductCard),
    recentlyViewed: z.array(WishlistItem),
  }),
);

export const SimilarResponse = ok(z.object({ items: z.array(ProductCard) }));

// --- vendor: KYC documents + stats -------------------------------
export const BusinessDocument = z.object({
  id: z.string(),
  type: z.string(),
  fileKey: z.string(),
  status: z.string(),
  note: z.string().nullable(),
  at: z.string(),
});
export const BusinessDocumentsResponse = ok(z.object({ items: z.array(BusinessDocument) }));
export const AddBusinessDocumentRequest = z.object({
  type: z.string().min(2).max(60),
  fileKey: z.string().min(3).max(300),
});
export const AddBusinessDocumentResponse = ok(z.object({ id: z.string(), status: z.string() }));

export const VendorStatsResponse = ok(
  z.object({
    products: z.record(z.string(), z.number().int()),
    activeOffers: z.number().int(),
    reviews: z.number().int(),
    ratingAvg: z.number(),
    productViews: z.number().int(),
  }),
);
