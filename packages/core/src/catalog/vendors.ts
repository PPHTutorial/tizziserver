import { prisma, Prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { uniqueSlug } from "./util.ts";

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
  business: {
    legalName: string;
    regNumber?: string;
    phone?: string;
    email?: string;
    addressLine?: string;
    city?: string;
    country?: string;
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
          platformIds: Array.from(new Set([...existing.platformIds, input.platformSlug])),
        },
      })
    : await prisma.vendorProfile.create({
        data: {
          userId: input.userId,
          displayName: input.displayName,
          bio: input.bio,
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
      country: input.business.country,
    },
    update: {
      legalName: input.business.legalName,
      regNumber: input.business.regNumber,
      email: input.business.email,
      addressLine: input.business.addressLine,
      city: input.business.city,
      country: input.business.country,
    },
  });

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
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) return { onboarded: false as const };
  const kyc = await prisma.kycCase.findUnique({
    where: { subjectType_subjectId: { subjectType: "VENDOR", subjectId: vendor.id } },
  });
  return {
    onboarded: true as const,
    vendorId: vendor.id,
    profileStatus: vendor.status,
    kycStatus: kyc?.status ?? "NONE",
    note: kyc?.note ?? null,
  };
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
        create: (input.images ?? []).map((fileKey, i) => ({ kind: "IMAGE" as const, fileKey, sortOrder: i })),
      },
      variants: {
        create: { sku: uniqueSlug(`${input.title}-v`), name: "Default", priceMinor: input.priceMinor },
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

  const variant = product.variants[0]!;
  await prisma.inventory.create({
    data: { variantId: variant.id, vendorId: vendor.id, quantity: 0, lowStockThreshold: 3 },
  });

  return { id: product.id, slug: product.slug, status: product.status };
}

export async function updateProductDraft(input: {
  userId: string;
  productId: string;
  title?: string;
  description?: string;
  brand?: string;
  categoryId?: string;
  priceMinor?: number;
  images?: string[];
  quantity?: number;
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
      categoryId: input.categoryId,
    },
  });

  if (input.images) {
    await prisma.productMedia.deleteMany({ where: { productId: product.id } });
    await prisma.productMedia.createMany({
      data: input.images.map((fileKey, i) => ({ productId: product.id, kind: "IMAGE" as const, fileKey, sortOrder: i })),
    });
  }
  if (input.priceMinor != null && product.offers[0]) {
    await prisma.vendorOffer.update({ where: { id: product.offers[0].id }, data: { priceMinor: input.priceMinor } });
    if (product.variants[0]) {
      await prisma.productVariant.update({ where: { id: product.variants[0].id }, data: { priceMinor: input.priceMinor } });
    }
  }
  if (input.quantity != null && product.variants[0]) {
    await prisma.inventory.upsert({
      where: { variantId_vendorId: { variantId: product.variants[0].id, vendorId: vendor.id } },
      create: { variantId: product.variants[0].id, vendorId: vendor.id, quantity: input.quantity },
      update: { quantity: input.quantity },
    });
  }
  return { id: product.id, updated: true };
}

export async function publishProduct(userId: string, productId: string) {
  const vendor = await requireActiveVendor(userId);
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId: vendor.id },
    include: { media: true, offers: true },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  if (product.media.length === 0) throw new AppError("VALIDATION", "Add at least one image before publishing");
  if (product.offers.length === 0) throw new AppError("VALIDATION", "Set a price before publishing");

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    prisma.vendorOffer.updateMany({
      where: { productId: product.id, vendorId: vendor.id },
      data: { status: "ACTIVE" },
    }),
  ]);
  return { id: product.id, status: "PUBLISHED" as const };
}

// --- business documents (KYC evidence) ----------------------------

export async function addBusinessDocument(userId: string, type: string, fileKey: string) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { userId },
    include: { business: true },
  });
  if (!vendor?.business) throw new AppError("FORBIDDEN", "Complete vendor onboarding first");
  const doc = await prisma.businessDocument.create({
    data: { businessId: vendor.business.id, type, fileKey, status: "PENDING" },
  });
  return { id: doc.id, status: doc.status };
}

export async function listBusinessDocuments(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { userId },
    include: { business: { include: { documents: { orderBy: { createdAt: "desc" } } } } },
  });
  return (vendor?.business?.documents ?? []).map((d) => ({
    id: d.id,
    type: d.type,
    fileKey: d.fileKey,
    status: d.status,
    note: d.note,
    at: d.createdAt.toISOString(),
  }));
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

export async function listMyProducts(userId: string, status?: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) return [];
  const rows = await prisma.product.findMany({
    where: { vendorId: vendor.id, ...(status ? { status } : {}), deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      media: { take: 1, orderBy: { sortOrder: "asc" }, select: { fileKey: true } },
      offers: { where: { vendorId: vendor.id }, take: 1, select: { priceMinor: true, currency: true } },
      _count: { select: { offers: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status,
    image: p.media[0]?.fileKey ?? null,
    priceMinor: p.offers[0]?.priceMinor ?? null,
    currency: p.offers[0]?.currency ?? "GHS",
    updatedAt: p.updatedAt.toISOString(),
  }));
}
