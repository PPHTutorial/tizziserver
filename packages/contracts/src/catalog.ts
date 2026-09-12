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
export const CategoryAttributeType = z.enum(["text", "number", "boolean", "select"]);
export const CategoryAttributeField = z.object({
  key: z.string(),
  label: z.string(),
  type: CategoryAttributeType,
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export const Category = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  path: z.string(),
  sortOrder: z.number().int(),
  /** Category-specific product field template — `null` if none defined. */
  attributeSchema: z.array(CategoryAttributeField).nullable(),
});

export const RootCategory = Category.extend({ count: z.number().int().nullable() });

/** The live Inverse Draw for a product, if the platform links one — lets a
 * card or PDP show the "Spot: ¤X" auction seat price alongside retail. */
export const ActiveAuctionSummary = z.object({
  slug: z.string(),
  status: z.string(),
  ticketPriceMinor: z.number().int(),
  winTargetMinor: z.number().int(),
  seatsTotal: z.number().int(),
  seatsSold: z.number().int(),
  currency: z.string(),
});

export const ProductCard = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  image: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  fromPriceMinor: z.number().int().nullable(),
  currency: z.string(),
  offerCount: z.number().int(),
  vendorCount: z.number().int(),
  activeAuction: ActiveAuctionSummary.nullable(),
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
  brandLogo: z.string().nullable(),
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
  /** The live Inverse Draw for this exact product, if the platform links one
   * (`Auction.productId`) — lets the PDP show the dual "Join Draw" / "Buy
   * Retail" CTA alongside the normal offers. */
  activeAuction: ActiveAuctionSummary.nullable(),
});

// --- responses --------------------------------------------------------
export const CategoriesResponse = ok(
  z.object({
    items: z.array(Category).optional(),
    tree: z.array(z.unknown()).optional(),
    roots: z.array(RootCategory).optional(),
  }),
);
export const ProductListResponse = ok(z.object({ items: z.array(ProductCard), nextCursor: z.string().nullable() }));
export const ScanResponse = ok(z.object({ slug: z.string().nullable() }));
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
        lat: z.number().nullable(),
        lng: z.number().nullable(),
      }),
    ),
  }),
);

export const BrandLogo = z.object({
  name: z.string(),
  logoUrl: z.string().nullable(),
});
export const BrandLogoResponse = ok(z.object({ items: z.array(BrandLogo) }));

export const FeaturedVendor = z.object({
  id: z.string(),
  displayName: z.string(),
  logo: z.string().nullable(),
  banner: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  productCount: z.number().int(),
});

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
  condition: ProductCondition.optional(),
  categoryId: z.string().optional(),
  priceMinor: z.number().int().positive().optional(),
  images: z.array(z.string()).max(8).optional(),
  quantity: z.number().int().nonnegative().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export const ProductMutationResponse = ok(z.object({ id: z.string(), status: z.string().optional(), updated: z.boolean().optional() }));
export const SetListingPausedRequest = z.object({ paused: z.boolean() });
export const MyProductDetailResponse = ok(
  z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    brand: z.string().nullable(),
    condition: ProductCondition,
    categoryId: z.string(),
    status: ProductStatus,
    offerStatus: z.string().nullable(),
    priceMinor: z.number().int().nullable(),
    currency: z.string(),
    images: z.array(z.string()),
    quantity: z.number().int(),
    attributes: z.record(z.string(), z.unknown()),
  }),
);

export const MyProductsResponse = ok(
  z.object({
    items: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        title: z.string(),
        status: ProductStatus,
        offerStatus: z.string().nullable(),
        image: z.string().nullable(),
        priceMinor: z.number().int().nullable(),
        currency: z.string(),
        quantity: z.number().int(),
        viewCount: z.number().int(),
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
export const ReviewsListResponse = ok(
  z.object({
    items: z.array(
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
    nextCursor: z.string().nullable(),
    total: z.number().int(),
    distribution: z.array(z.object({ star: z.number().int(), count: z.number().int(), pct: z.number().int() })),
  }),
);

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
export const RecentlyViewedItem = WishlistItem.extend({ viewedAt: z.string() });
export const RecentlyViewedResponse = ok(z.object({ items: z.array(RecentlyViewedItem) }));

// --- promotions (Domain 8 read side) -------------------------------
export const PromotionKind = z.enum(["FLASH_DEAL", "CAMPAIGN", "BANNER"]);

export const PromotionItemCard = z.object({
  productId: z.string(),
  slug: z.string(),
  title: z.string(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  image: z.string().nullable(),
  currency: z.string(),
  priceMinor: z.number().int().nullable(),
  dealPriceMinor: z.number().int().nullable(),
  discountBps: z.number().int().nullable(),
  activeAuction: ActiveAuctionSummary.nullable(),
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
    featuredVendors: z.array(FeaturedVendor),
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
