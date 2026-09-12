import { prisma, Prisma, type KycDocKind } from "@stall/db";
import { AppError } from "../errors.ts";
import { uniqueSlug } from "./util.ts";

export interface FeaturedVendor {
  id: string;
  displayName: string;
  logo: string | null;
  banner: string | null;
  ratingAvg: number;
  ratingCount: number;
  productCount: number;
}

/** Top-rated active vendors with at least one live listing — backs the
 * home feed's "Featured vendors" rail. */
export async function listFeaturedVendors(input: { platformSlug: string; limit?: number }): Promise<FeaturedVendor[]> {
  const take = Math.min(Math.max(input.limit ?? 10, 1), 30);
  const rows = await prisma.vendorProfile.findMany({
    where: {
      status: "ACTIVE",
      platformIds: { has: input.platformSlug },
      products: { some: { status: "PUBLISHED", deletedAt: null } },
    },
    orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
    take,
    include: { _count: { select: { products: true } } },
  });
  return rows.map((v) => ({
    id: v.id,
    displayName: v.displayName,
    logo: v.logo,
    banner: v.banner,
    ratingAvg: v.ratingAvg,
    ratingCount: v.ratingCount,
    productCount: v._count.products,
  }));
}

// --- public vendor page ------------------------------------------------

export async function getVendorPage(vendorId: string, platformSlug: string) {
  const vendor = await prisma.vendorProfile.findFirst({
    where: { id: vendorId, status: "ACTIVE", platformIds: { has: platformSlug } },
    include: {
      business: { select: { legalName: true, city: true, country: true } },
      _count: { select: { products: true } },
    },
  });
  if (!vendor) throw new AppError("NOT_FOUND", "Vendor not found");
  return {
    id: vendor.id,
    displayName: vendor.displayName,
    bio: vendor.bio,
    logo: vendor.logo,
    banner: vendor.banner,
    ratingAvg: vendor.ratingAvg,
    ratingCount: vendor.ratingCount,
    verifiedAt: vendor.verifiedAt?.toISOString() ?? null,
    productCount: vendor._count.products,
    location: [vendor.business?.city, vendor.business?.country].filter(Boolean).join(", ") || null,
  };
}

// --- onboarding + KYC ------------------------------------------------

export interface OnboardingInput {
  userId: string;
  platformSlug: string;
  displayName: string;
  bio?: string;
  logo?: string;
  banner?: string;
  themeColors?: string[];
  services?: string[];
  business: {
    legalName: string;
    regNumber?: string;
    phone?: string;
    email?: string;
    addressLine?: string;
    city?: string;
    region?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
}

/** Create (or update) the caller's VendorProfile + Business and open a KYC case. */
export async function startVendorOnboarding(input: OnboardingInput) {
  const existing = await prisma.vendorProfile.findUnique({ where: { userId: input.userId } });

  const vendor = existing
    ? await prisma.vendorProfile.update({
        where: { id: existing.id },
        data: {
          displayName: input.displayName,
          bio: input.bio,
          ...(input.logo !== undefined ? { logo: input.logo } : {}),
          ...(input.banner !== undefined ? { banner: input.banner } : {}),
          ...(input.themeColors !== undefined ? { themeColors: input.themeColors } : {}),
          ...(input.services !== undefined ? { services: input.services } : {}),
          platformIds: Array.from(new Set([...existing.platformIds, input.platformSlug])),
        },
      })
    : await prisma.vendorProfile.create({
        data: {
          userId: input.userId,
          displayName: input.displayName,
          bio: input.bio,
          logo: input.logo,
          banner: input.banner,
          themeColors: input.themeColors ?? [],
          services: input.services ?? [],
          status: "PENDING",
          platformIds: [input.platformSlug],
        },
      });

  await prisma.business.upsert({
    where: { vendorId: vendor.id },
    create: {
      vendorId: vendor.id,
      legalName: input.business.legalName,
      regNumber: input.business.regNumber,
      phones: input.business.phone ? [input.business.phone] : [],
      email: input.business.email,
      addressLine: input.business.addressLine,
      city: input.business.city,
      region: input.business.region,
      country: input.business.country,
    },
    update: {
      legalName: input.business.legalName,
      regNumber: input.business.regNumber,
      email: input.business.email,
      addressLine: input.business.addressLine,
      city: input.business.city,
      region: input.business.region,
      country: input.business.country,
    },
  });

  // `Business.location` is an `Unsupported("geography(Point,4326)")` column —
  // the Prisma Client can't write it, so it goes through raw SQL (same
  // pattern as `delivery/presence.ts`'s courier live-location writes).
  if (input.business.lat != null && input.business.lng != null) {
    await prisma.$executeRawUnsafe(
      `UPDATE "businesses" SET "location" = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE "vendorId" = $3`,
      input.business.lng,
      input.business.lat,
      vendor.id,
    );
  }

  // Ensure the user actually holds the VENDOR role (PENDING until KYC clears).
  await prisma.userRole.upsert({
    where: { userId_role: { userId: input.userId, role: "VENDOR" } },
    create: { userId: input.userId, role: "VENDOR", status: "PENDING", kycStatus: "PENDING" },
    update: { kycStatus: "PENDING" },
  });

  const kyc = await prisma.kycCase.upsert({
    where: { subjectType_subjectId: { subjectType: "VENDOR", subjectId: vendor.id } },
    create: {
      subjectType: "VENDOR",
      subjectId: vendor.id,
      status: "PENDING",
      platformSlug: input.platformSlug,
      fields: { legalName: input.business.legalName, regNumber: input.business.regNumber },
    },
    update: { status: "PENDING" },
  });

  return { vendorId: vendor.id, status: vendor.status, kycStatus: kyc.status };
}

export async function vendorKycStatus(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId }, include: { business: true } });
  if (!vendor) return { onboarded: false as const };
  const kyc = await prisma.kycCase.findUnique({
    where: { subjectType_subjectId: { subjectType: "VENDOR", subjectId: vendor.id } },
  });
  const geo = vendor.business
    ? await prisma.$queryRawUnsafe<{ lat: number | null; lng: number | null }[]>(
        `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM "businesses" WHERE "vendorId" = $1 AND location IS NOT NULL`,
        vendor.id,
      )
    : [];
  return {
    onboarded: true as const,
    vendorId: vendor.id,
    profileStatus: vendor.status,
    kycStatus: kyc?.status ?? "NONE",
    note: kyc?.note ?? null,
    displayName: vendor.displayName,
    bio: vendor.bio,
    logo: vendor.logo,
    banner: vendor.banner,
    themeColors: vendor.themeColors,
    services: vendor.services,
    business: vendor.business
      ? {
          addressLine: vendor.business.addressLine,
          city: vendor.business.city,
          region: vendor.business.region,
          country: vendor.business.country,
          lat: geo[0]?.lat ?? null,
          lng: geo[0]?.lng ?? null,
        }
      : null,
  };
}

/**
 * Edit the caller's own shop profile (name/bio/logo/banner/theme/services) —
 * distinct from `startVendorOnboarding`, which also touches Business + re-
 * opens a KYC case. Available regardless of KYC status: a vendor should be
 * able to tidy up their shop profile while a review is pending, not just
 * once ACTIVE.
 */
export async function updateMyVendorProfile(
  userId: string,
  input: { displayName?: string; bio?: string; logo?: string; banner?: string; themeColors?: string[]; services?: string[] },
) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw new AppError("FORBIDDEN", "Complete vendor onboarding first");
  const updated = await prisma.vendorProfile.update({
    where: { id: vendor.id },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.bio !== undefined ? { bio: input.bio.trim() || null } : {}),
      ...(input.logo !== undefined ? { logo: input.logo.trim() || null } : {}),
      ...(input.banner !== undefined ? { banner: input.banner.trim() || null } : {}),
      ...(input.themeColors !== undefined ? { themeColors: input.themeColors } : {}),
      ...(input.services !== undefined ? { services: input.services } : {}),
    },
    select: { id: true, displayName: true, bio: true, logo: true, banner: true, themeColors: true, services: true },
  });
  return updated;
}

/**
 * Mock reviewer (dev / STAFF): approve or reject a vendor's KYC case and sync
 * the profile + role. In production this is a STAFF console action.
 */
export async function reviewVendorKyc(vendorId: string, decision: "APPROVED" | "REJECTED", note?: string, reviewerId?: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new AppError("NOT_FOUND", "Vendor not found");

  await prisma.$transaction([
    prisma.kycCase.update({
      where: { subjectType_subjectId: { subjectType: "VENDOR", subjectId: vendorId } },
      data: { status: decision, note, reviewedById: reviewerId, reviewedAt: new Date() },
    }),
    prisma.vendorProfile.update({
      where: { id: vendorId },
      data: {
        status: decision === "APPROVED" ? "ACTIVE" : "SUSPENDED",
        verifiedAt: decision === "APPROVED" ? new Date() : null,
      },
    }),
    prisma.userRole.updateMany({
      where: { userId: vendor.userId, role: "VENDOR" },
      data: {
        kycStatus: decision,
        status: decision === "APPROVED" ? "ACTIVE" : "SUSPENDED",
        activatedAt: decision === "APPROVED" ? new Date() : null,
      },
    }),
  ]);
  return { vendorId, kycStatus: decision };
}

// --- product authoring ---------------------------------------------

async function requireActiveVendor(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw new AppError("FORBIDDEN", "Complete vendor onboarding first");
  if (vendor.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Vendor account is pending review");
  return vendor;
}

export interface ProductVariantInput {
  sku?: string;
  name: string;
  options?: Record<string, unknown>;
  priceMinor: number;
}

export interface ProductDraftInput {
  userId: string;
  platformSlug: string;
  title: string;
  description: string;
  categoryId: string;
  brand?: string;
  condition?: "NEW" | "USED" | "REFURBISHED";
  priceMinor: number;
  currency?: string;
  images?: string[];
  video?: string;
  variants?: ProductVariantInput[];
  attributes?: Record<string, unknown>;
}

export async function createProductDraft(input: ProductDraftInput) {
  const vendor = await requireActiveVendor(input.userId);
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new AppError("VALIDATION", "Unknown category");

  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: input.categoryId,
      title: input.title,
      slug: uniqueSlug(input.title),
      description: input.description,
      brand: input.brand,
      condition: input.condition ?? "NEW",
      attributes: (input.attributes ?? {}) as Prisma.InputJsonValue,
      status: "DRAFT",
      platformSlugs: [input.platformSlug],
      media: {
        create: [
          ...(input.images ?? []).map((fileKey, i) => ({ kind: "IMAGE" as const, fileKey, sortOrder: i })),
          ...(input.video ? [{ kind: "VIDEO" as const, fileKey: input.video, sortOrder: 0 }] : []),
        ],
      },
      variants: {
        create:
          input.variants && input.variants.length > 0
            ? input.variants.map((v, i) => ({
                sku: v.sku ?? uniqueSlug(`${input.title}-v${i}`),
                name: v.name,
                options: v.options as Prisma.InputJsonValue | undefined,
                priceMinor: v.priceMinor,
              }))
            : [{ sku: uniqueSlug(`${input.title}-v`), name: "Default", priceMinor: input.priceMinor }],
      },
      offers: {
        create: {
          vendorId: vendor.id,
          priceMinor: input.priceMinor,
          currency: input.currency ?? "GHS",
          condition: input.condition ?? "NEW",
          status: "PAUSED",
        },
      },
    },
    include: { variants: true, offers: true },
  });

  await prisma.inventory.createMany({
    data: product.variants.map((v) => ({ variantId: v.id, vendorId: vendor.id, quantity: 0, lowStockThreshold: 3 })),
  });

  return { id: product.id, slug: product.slug, status: product.status };
}

export async function updateProductDraft(input: {
  userId: string;
  productId: string;
  title?: string;
  description?: string;
  brand?: string;
  condition?: "NEW" | "USED" | "REFURBISHED";
  categoryId?: string;
  priceMinor?: number;
  images?: string[];
  video?: string;
  variants?: ProductVariantInput[];
  quantity?: number;
  attributes?: Record<string, unknown>;
}) {
  const vendor = await requireActiveVendor(input.userId);
  const product = await prisma.product.findFirst({
    where: { id: input.productId, vendorId: vendor.id },
    include: { variants: { take: 1 }, offers: { where: { vendorId: vendor.id }, take: 1 } },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");

  await prisma.product.update({
    where: { id: product.id },
    data: {
      title: input.title,
      description: input.description,
      brand: input.brand,
      condition: input.condition,
      categoryId: input.categoryId,
      ...(input.attributes !== undefined ? { attributes: input.attributes as Prisma.InputJsonValue } : {}),
    },
  });
  if (input.condition && product.offers[0]) {
    await prisma.vendorOffer.update({ where: { id: product.offers[0].id }, data: { condition: input.condition } });
  }

  // Images and video are independent media kinds — replacing one must never
  // wipe the other (this used to `deleteMany` the whole `ProductMedia` set
  // whenever `images` was sent, silently dropping any video).
  if (input.images) {
    await prisma.productMedia.deleteMany({ where: { productId: product.id, kind: "IMAGE" } });
    await prisma.productMedia.createMany({
      data: input.images.map((fileKey, i) => ({ productId: product.id, kind: "IMAGE" as const, fileKey, sortOrder: i })),
    });
  }
  if (input.video !== undefined) {
    await prisma.productMedia.deleteMany({ where: { productId: product.id, kind: "VIDEO" } });
    if (input.video) {
      await prisma.productMedia.create({ data: { productId: product.id, kind: "VIDEO", fileKey: input.video, sortOrder: 0 } });
    }
  }
  if (input.priceMinor != null && product.offers[0]) {
    await prisma.vendorOffer.update({ where: { id: product.offers[0].id }, data: { priceMinor: input.priceMinor } });
    // Only sync the lone legacy "Default" variant — once `variants` replaces
    // the set below, each one carries its own explicit price instead.
    if (!input.variants && product.variants[0]) {
      await prisma.productVariant.update({ where: { id: product.variants[0].id }, data: { priceMinor: input.priceMinor } });
    }
  }
  if (input.variants && input.variants.length > 0) {
    // Replace the full variant set. `Inventory.variant` is `onDelete: Cascade`
    // so dropping a variant takes its inventory row with it — no orphans.
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    const created = await prisma.$transaction(
      input.variants.map((v, i) =>
        prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku ?? uniqueSlug(`${input.title ?? product.title}-v${i}`),
            name: v.name,
            options: v.options as Prisma.InputJsonValue | undefined,
            priceMinor: v.priceMinor,
          },
        }),
      ),
    );
    await prisma.inventory.createMany({
      data: created.map((v) => ({ variantId: v.id, vendorId: vendor.id, quantity: 0, lowStockThreshold: 3 })),
    });
  } else if (input.quantity != null && product.variants[0]) {
    await prisma.inventory.upsert({
      where: { variantId_vendorId: { variantId: product.variants[0].id, vendorId: vendor.id } },
      create: { variantId: product.variants[0].id, vendorId: vendor.id, quantity: input.quantity },
      update: { quantity: input.quantity },
    });
  }
  return { id: product.id, updated: true };
}

/** Submit a draft for admin moderation (Figma's "Publish" action) — no longer
 * goes straight live. Moves the product to `PENDING_REVIEW`; it only becomes
 * `PUBLISHED` (and its offers `ACTIVE`) once an admin approves it via
 * `reviewProduct`. */
export async function publishProduct(userId: string, productId: string) {
  const vendor = await requireActiveVendor(userId);
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId: vendor.id },
    include: { media: true, offers: true },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  if (product.media.length === 0) throw new AppError("VALIDATION", "Add at least one image before publishing");
  if (product.offers.length === 0) throw new AppError("VALIDATION", "Set a price before publishing");

  await prisma.product.update({
    where: { id: product.id },
    data: { status: "PENDING_REVIEW" },
  });
  return { id: product.id, status: "PENDING_REVIEW" as const };
}

/** Pause/resume a live listing (Figma's edit-listing "Pause Listing" action)
 * — toggles the vendor's own offer, not the shared `Product` row, so it
 * doesn't affect other vendors selling the same catalog product. */
export async function setListingPaused(userId: string, productId: string, paused: boolean) {
  const vendor = await requireActiveVendor(userId);
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId: vendor.id },
    include: { offers: { where: { vendorId: vendor.id }, take: 1 } },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  const offer = product.offers[0];
  if (!offer) throw new AppError("CONFLICT", "This listing has no offer yet");
  if (offer.status === "OUT_OF_STOCK" && paused) throw new AppError("CONFLICT", "Already unavailable");
  await prisma.vendorOffer.update({
    where: { id: offer.id },
    data: { status: paused ? "PAUSED" : "ACTIVE" },
  });
  return { id: product.id, status: paused ? "PAUSED" : "ACTIVE" };
}

/** Soft-delete a listing (Figma's "Delete Listing"). Archives the product and
 * pauses the vendor's offer rather than a hard delete, so existing order
 * history referencing this product stays intact. */
export async function archiveProduct(userId: string, productId: string) {
  const vendor = await requireActiveVendor(userId);
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId: vendor.id },
    include: { offers: { where: { vendorId: vendor.id }, take: 1 } },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { status: "ARCHIVED" } }),
    ...(product.offers[0]
      ? [prisma.vendorOffer.update({ where: { id: product.offers[0].id }, data: { status: "PAUSED" } })]
      : []),
  ]);
  return { id: product.id, status: "ARCHIVED" as const };
}

// --- admin: product review ------------------------------------------

/** Moderation queue backing `/admin/product-review` — oldest submission
 * first, so nothing lingers unreviewed at the back of the line. */
export async function listProductsPendingReview(opts: { cursor?: string; limit?: number } = {}) {
  const take = Math.min(Math.max(opts.limit ?? 50, 1), 50);
  const rows = await prisma.product.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { updatedAt: "asc" },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    include: {
      vendor: { select: { id: true, displayName: true } },
      media: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileKey: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    vendorId: p.vendorId,
    vendorName: p.vendor.displayName,
    image: p.media[0]?.fileKey ?? null,
    submittedAt: p.updatedAt.toISOString(),
  }));
}

/** Full detail for one pending product — backs the review detail screen. */
export async function getProductForReview(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      vendor: { select: { id: true, displayName: true } },
      category: { select: { id: true, name: true } },
      media: { orderBy: { sortOrder: "asc" } },
      offers: true,
    },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    condition: product.condition,
    status: product.status,
    category: product.category.name,
    vendorId: product.vendor.id,
    vendorName: product.vendor.displayName,
    priceMinor: product.offers[0]?.priceMinor ?? null,
    currency: product.offers[0]?.currency ?? "GHS",
    media: product.media.map((m) => ({ id: m.id, kind: m.kind, fileKey: m.fileKey })),
    submittedAt: product.updatedAt.toISOString(),
  };
}

/**
 * Admin decision on a submitted product (mirrors `trust.reviewKycCase`'s
 * approve/reject shape). APPROVE does what `publishProduct` used to do
 * on its own — go live + activate offers — REJECT sends it back to DRAFT
 * so the vendor can fix it up and resubmit.
 */
export async function reviewProduct(adminUserId: string, productId: string, decision: "APPROVE" | "REJECT", note?: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.status !== "PENDING_REVIEW") {
    throw new AppError("NOT_FOUND", "No pending product with that id");
  }

  if (decision === "APPROVE") {
    await prisma.$transaction([
      prisma.product.update({
        where: { id: product.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), reviewedAt: new Date(), reviewedById: adminUserId, reviewNote: note ?? null },
      }),
      prisma.vendorOffer.updateMany({
        where: { productId: product.id, vendorId: product.vendorId },
        data: { status: "ACTIVE" },
      }),
      prisma.auditLog.create({
        data: { actorId: adminUserId, actorType: "USER", action: "admin.product.review", targetType: "Product", targetId: product.id, after: { decision, note } },
      }),
    ]);
    return { id: product.id, status: "PUBLISHED" as const };
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { status: "DRAFT", reviewedAt: new Date(), reviewedById: adminUserId, reviewNote: note ?? null },
    }),
    prisma.auditLog.create({
      data: { actorId: adminUserId, actorType: "USER", action: "admin.product.review", targetType: "Product", targetId: product.id, after: { decision, note } },
    }),
  ]);
  return { id: product.id, status: "DRAFT" as const };
}

// --- vendor KYC (documents + selfie) -------------------------------

export interface VendorKycDocInput {
  type: KycDocKind;
  fileKey: string;
}

/**
 * Batch-submit vendor verification evidence — mirrors
 * `couriers/profile.ts`'s `submitCourierKyc` almost exactly, onto the same
 * `KycCase`/`KycDocument`/`LivenessCheck` models the admin KYC queue already
 * reads generically. A selfie auto-passes a mock liveness check, same as
 * courier — this product deliberately isn't doing real liveness detection.
 */
export async function submitVendorKyc(userId: string, input: { documents: VendorKycDocInput[]; selfieKey?: string }) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw new AppError("FORBIDDEN", "Complete vendor onboarding first");

  const kyc = await prisma.kycCase.upsert({
    where: { subjectType_subjectId: { subjectType: "VENDOR", subjectId: vendor.id } },
    create: { subjectType: "VENDOR", subjectId: vendor.id, status: "IN_REVIEW" },
    update: { status: "IN_REVIEW" },
  });

  await prisma.$transaction([
    ...input.documents.map((d) =>
      prisma.kycDocument.create({ data: { kycCaseId: kyc.id, type: d.type, fileKey: d.fileKey } }),
    ),
    ...(input.selfieKey
      ? [
          prisma.kycDocument.create({ data: { kycCaseId: kyc.id, type: "SELFIE" as KycDocKind, fileKey: input.selfieKey } }),
          prisma.livenessCheck.create({
            data: { kycCaseId: kyc.id, provider: "mock", score: 0.97, passed: true, ref: { auto: true } as Prisma.InputJsonValue },
          }),
        ]
      : []),
    prisma.userRole.update({ where: { userId_role: { userId, role: "VENDOR" } }, data: { kycStatus: "IN_REVIEW" } }),
  ]);

  return { kycCaseId: kyc.id, status: "IN_REVIEW" as const };
}

// --- vendor analytics stub (MD §25 "product performance") -----------

export async function vendorStats(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw new AppError("FORBIDDEN", "Not a vendor");

  const [byStatus, offerCount, reviewAgg, viewCount] = await Promise.all([
    prisma.product.groupBy({
      by: ["status"],
      where: { vendorId: vendor.id, deletedAt: null },
      _count: true,
    }),
    prisma.vendorOffer.count({ where: { vendorId: vendor.id, status: "ACTIVE" } }),
    prisma.productReview.aggregate({
      where: { product: { vendorId: vendor.id } },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.recentlyViewed.count({ where: { product: { vendorId: vendor.id } } }),
  ]);

  const counts: Record<string, number> = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0, SUSPENDED: 0 };
  for (const row of byStatus) counts[row.status] = row._count;

  return {
    products: counts,
    activeOffers: offerCount,
    reviews: reviewAgg._count,
    ratingAvg: Number((reviewAgg._avg.rating ?? 0).toFixed(2)),
    productViews: viewCount,
  };
}

/** Full editable detail for one of the vendor's own products — the "Edit
 * Listing" screen needs this to pre-populate the form; previously it opened
 * blank and, since `updateProductDraft` always writes whatever title/
 * description the form holds, saving without retyping everything would
 * silently blank out the product. */
export async function getMyProduct(userId: string, productId: string) {
  const vendor = await requireActiveVendor(userId);
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId: vendor.id },
    include: {
      media: { orderBy: { sortOrder: "asc" }, select: { kind: true, fileKey: true } },
      offers: { where: { vendorId: vendor.id }, take: 1 },
      variants: true,
    },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  const inventory = product.variants.length
    ? await prisma.inventory.findMany({
        where: { variantId: { in: product.variants.map((v) => v.id) }, vendorId: vendor.id },
      })
    : [];
  const qtyByVariant = new Map(inventory.map((i) => [i.variantId, i.quantity]));
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    brand: product.brand,
    condition: product.condition,
    categoryId: product.categoryId,
    status: product.status,
    offerStatus: product.offers[0]?.status ?? null,
    priceMinor: product.offers[0]?.priceMinor ?? null,
    currency: product.offers[0]?.currency ?? "GHS",
    images: product.media.filter((m) => m.kind === "IMAGE").map((m) => m.fileKey),
    video: product.media.find((m) => m.kind === "VIDEO")?.fileKey ?? null,
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      options: (v.options ?? {}) as Record<string, unknown>,
      priceMinor: v.priceMinor,
      quantity: qtyByVariant.get(v.id) ?? 0,
    })),
    // Kept for older single-variant clients/back-compat with the "Stock qty" field.
    quantity: product.variants[0] ? qtyByVariant.get(product.variants[0].id) ?? 0 : 0,
    attributes: product.attributes ?? {},
    reviewNote: product.reviewNote,
  };
}

export async function listMyProducts(userId: string, status?: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) return [];
  const rows = await prisma.product.findMany({
    where: { vendorId: vendor.id, ...(status ? { status } : {}), deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      media: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileKey: true } },
      offers: { where: { vendorId: vendor.id }, take: 1, select: { priceMinor: true, currency: true, status: true } },
      variants: { take: 1, select: { id: true } },
      _count: { select: { offers: true, views: true } },
    },
  });
  const quantities = new Map<string, number>();
  const variantIds = rows.map((p) => p.variants[0]?.id).filter((id): id is string => !!id);
  if (variantIds.length) {
    const inv = await prisma.inventory.findMany({ where: { variantId: { in: variantIds }, vendorId: vendor.id } });
    for (const row of inv) quantities.set(row.variantId, row.quantity);
  }
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status,
    offerStatus: p.offers[0]?.status ?? null,
    image: p.media[0]?.fileKey ?? null,
    priceMinor: p.offers[0]?.priceMinor ?? null,
    currency: p.offers[0]?.currency ?? "GHS",
    quantity: p.variants[0] ? quantities.get(p.variants[0].id) ?? 0 : 0,
    viewCount: p._count.views,
    updatedAt: p.updatedAt.toISOString(),
  }));
}
