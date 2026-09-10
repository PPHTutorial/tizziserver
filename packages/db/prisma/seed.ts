/**
 * Database seed — schema v2 Domain 0 baseline.
 *
 *   Currencies + Regions
 *   Platforms: `grandprice` (general marketplace), `tizzi-gas` (LPG)
 *   FeatureFlag registry + per-platform values (auction/advertising OFF for tizzi-gas)
 *   Starter FeeSchedule + PricingRule + AppConfig
 *
 * Idempotent (upserts). Run: `pnpm --filter @stall/db seed`.
 */
import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { prisma } = await import("../src/index.ts");

// --- Currencies & regions -------------------------------------------------
const currencies = [
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", minorUnits: 2 },
  { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", minorUnits: 2 },
  { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2 },
];
const regions = [
  { code: "GH", name: "Ghana", currencyCode: "GHS" },
  { code: "NG", name: "Nigeria", currencyCode: "NGN" },
  { code: "US", name: "United States", currencyCode: "USD" },
];

// --- Feature-flag registry ---------------------------------------------
const flags = [
  ["auction", "Inverse-Draw / auction system (§17–§18)", "BOOL"],
  ["advertising", "Vendor boosting & advertising (§26)", "BOOL"],
  ["premium_assets", "Premium asset listings", "BOOL"],
  ["catalog.scope", "Catalog scope: 'all' | 'gas'", "JSON"],
  ["catalog.multi_vendor_cart", "Cart may span multiple vendors", "BOOL"],
  ["delivery.live_tracking", "Bolt/Uber-style live courier tracking", "BOOL"],
  ["wallet", "In-app wallet", "BOOL"],
  ["wallet.withdraw", "Wallet withdrawals / payouts", "BOOL"],
  ["chat", "Customer ↔ vendor/courier/support chat", "BOOL"],
  ["coupons", "Coupons & promotions", "BOOL"],
  ["social_login", "Google / Apple / Facebook sign-in", "BOOL"],
  ["kyc.required", "KYC required before selling / couriering", "BOOL"],
] as const;

type FlagVal = boolean | number | string | Record<string, unknown>;
const platformFeatures: Record<string, Record<string, FlagVal>> = {
  grandprice: {
    auction: true,
    advertising: true,
    premium_assets: true,
    "catalog.scope": "all",
    "catalog.multi_vendor_cart": true,
    "delivery.live_tracking": true,
    wallet: true,
    "wallet.withdraw": true,
    chat: true,
    coupons: true,
    social_login: true,
    "kyc.required": true,
  },
  "tizzi-gas": {
    auction: false,
    advertising: false,
    premium_assets: false,
    "catalog.scope": "gas",
    "catalog.multi_vendor_cart": true,
    "delivery.live_tracking": true,
    wallet: true,
    "wallet.withdraw": true,
    chat: true,
    coupons: true,
    social_login: true,
    "kyc.required": true,
  },
};

const platforms = [
  {
    slug: "grandprice",
    name: "GrandPrice",
    defaultCurrency: "GHS",
    supportedRegions: ["GH"],
    theme: { brand: "#FF6200", tone: "warm" },
  },
  {
    slug: "tizzi-gas",
    name: "Tizzi Gas",
    defaultCurrency: "GHS",
    supportedRegions: ["GH"],
    theme: { brand: "#FF6200", tone: "warm" },
  },
];

// --- Domain 3: catalog demo data ---------------------------------------

interface CatVendor {
  slug: string;
  phone: string;
  displayName: string;
  legalName: string;
}

const catalogVendors: CatVendor[] = [
  { slug: "grandprice", phone: "+233200000001", displayName: "Accra Electronics Hub", legalName: "Accra Electronics Hub Ltd" },
  { slug: "tizzi-gas", phone: "+233200000002", displayName: "SwiftGas Depot", legalName: "SwiftGas Depot Ltd" },
];

/** Categories: (slug, name, icon, parentSlug|null, platformSlugs) */
const categories: [string, string, string, string | null, string[]][] = [
  // GrandPrice — general tree
  ["electronics", "Electronics", "bolt", null, ["grandprice"]],
  ["phones", "Phones & Tablets", "mobile-screen", "electronics", ["grandprice"]],
  ["laptops", "Laptops & Computers", "laptop", "electronics", ["grandprice"]],
  ["home-kitchen", "Home & Kitchen", "blender", null, ["grandprice"]],
  ["fashion", "Fashion", "shirt", null, ["grandprice"]],
  // Tizzi Gas — LPG tree
  ["lpg-cylinders", "LPG Cylinders", "fire-flame-simple", null, ["tizzi-gas"]],
  ["cyl-6kg", "6 kg", "fire-flame-simple", "lpg-cylinders", ["tizzi-gas"]],
  ["cyl-12kg", "12.5 kg", "fire-flame-simple", "lpg-cylinders", ["tizzi-gas"]],
  ["cyl-14kg", "14.5 kg", "fire-flame-simple", "lpg-cylinders", ["tizzi-gas"]],
  ["cyl-45kg", "45 kg", "fire-flame-simple", "lpg-cylinders", ["tizzi-gas"]],
  ["gas-accessories", "Accessories", "screwdriver-wrench", null, ["tizzi-gas"]],
  ["regulators", "Regulators & Hoses", "screwdriver-wrench", "gas-accessories", ["tizzi-gas"]],
];

async function seedCatalog() {
  // Vendor users + profiles + approved KYC.
  const vendorIdBySlug: Record<string, string> = {};
  for (const v of catalogVendors) {
    const user = await prisma.user.upsert({
      where: { phone: v.phone },
      create: {
        phone: v.phone,
        status: "ACTIVE",
        firstName: v.displayName,
        roles: { create: [{ role: "CUSTOMER", status: "ACTIVE", activatedAt: new Date() }, { role: "VENDOR", status: "ACTIVE", activatedAt: new Date() }] },
        tokenEpoch: { create: {} },
      },
      update: { status: "ACTIVE" },
    });
    for (const role of ["CUSTOMER", "VENDOR"] as const) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role } },
        create: { userId: user.id, role, status: "ACTIVE", activatedAt: new Date() },
        update: { status: "ACTIVE", activatedAt: new Date() },
      });
    }
    const vendor = await prisma.vendorProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName: v.displayName,
        status: "ACTIVE",
        verifiedAt: new Date(),
        platformIds: [v.slug],
        business: { create: { legalName: v.legalName, country: "GH", city: "Accra" } },
      },
      update: { status: "ACTIVE", platformIds: [v.slug] },
    });
    vendorIdBySlug[v.slug] = vendor.id;
    await prisma.kycCase.upsert({
      where: { subjectType_subjectId: { subjectType: "VENDOR", subjectId: vendor.id } },
      create: { subjectType: "VENDOR", subjectId: vendor.id, status: "APPROVED", platformSlug: v.slug, reviewedAt: new Date() },
      update: { status: "APPROVED" },
    });
  }

  // Category tree — parents first (array order guarantees it).
  const catIdBySlug: Record<string, string> = {};
  for (const [slug, name, icon, parentSlug, platformSlugs] of categories) {
    const parentId = parentSlug ? catIdBySlug[parentSlug] : undefined;
    const parent = parentSlug ? categories.find((c) => c[0] === parentSlug) : undefined;
    const path = parent ? `/${parentSlug}/${slug}` : `/${slug}`;
    const row = await prisma.category.upsert({
      where: { slug },
      create: { slug, name, icon, parentId, path, platformSlugs, sortOrder: Object.keys(catIdBySlug).length },
      update: { name, icon, parentId, path, platformSlugs },
    });
    catIdBySlug[slug] = row.id;
  }

  // Products + offers (+ gas listing) — keyed by stable slug for idempotency.
  const products: {
    slug: string;
    platform: string;
    categorySlug: string;
    title: string;
    brand: string;
    description: string;
    priceMinor: number;
    image: string;
    gas?: { cylinderType: string; weightKg: number; capacityL: number; depositMinor: number };
    variants?: { sku: string; name: string; priceMinor: number; qty: number }[];
  }[] = [
    {
      slug: "swiftgas-12kg-exchange",
      platform: "tizzi-gas",
      categorySlug: "cyl-12kg",
      title: "12.5 kg LPG Cylinder — Exchange",
      brand: "SwiftGas",
      description: "Full 12.5 kg LPG cylinder on exchange. Bring your empty; we deliver a certified full one.",
      priceMinor: 28000,
      image: "seed/gas-12kg.jpg",
      gas: { cylinderType: "STANDARD", weightKg: 12.5, capacityL: 26.2, depositMinor: 0 },
    },
    {
      slug: "swiftgas-6kg-new",
      platform: "tizzi-gas",
      categorySlug: "cyl-6kg",
      title: "6 kg LPG Cylinder — New (with deposit)",
      brand: "SwiftGas",
      description: "Brand-new 6 kg cylinder, filled, with refundable cylinder deposit.",
      priceMinor: 45000,
      image: "seed/gas-6kg.jpg",
      gas: { cylinderType: "NEW", weightKg: 6, capacityL: 12.6, depositMinor: 20000 },
    },
    {
      slug: "swiftgas-regulator-kit",
      platform: "tizzi-gas",
      categorySlug: "regulators",
      title: "LPG Regulator + Hose Kit",
      brand: "SwiftGas",
      description: "Low-pressure regulator, 1.5 m armoured hose and two clamps.",
      priceMinor: 9500,
      image: "seed/regulator.jpg",
    },
    {
      slug: "orbit-a54-phone",
      platform: "grandprice",
      categorySlug: "phones",
      title: "Orbit A54 Smartphone",
      brand: "Orbit",
      description: "6.4-inch AMOLED, 5000 mAh, 128/256 GB. Dual SIM. One-year warranty.",
      priceMinor: 189900,
      image: "seed/phone.jpg",
      variants: [
        { sku: "ORBIT-A54-128", name: "128 GB", priceMinor: 189900, qty: 25 },
        { sku: "ORBIT-A54-256", name: "256 GB", priceMinor: 219900, qty: 12 },
      ],
    },
    {
      slug: "nimbus-14-laptop",
      platform: "grandprice",
      categorySlug: "laptops",
      title: "Nimbus 14 Laptop",
      brand: "Nimbus",
      description: "14-inch IPS, 16 GB RAM, 512 GB SSD, backlit keyboard. Ships next day in Accra.",
      priceMinor: 649900,
      image: "seed/laptop.jpg",
    },
    {
      slug: "orbit-a34-phone",
      platform: "grandprice",
      categorySlug: "phones",
      title: "Orbit A34 Smartphone",
      brand: "Orbit",
      description: "6.1-inch LCD, 5000 mAh, 64/128 GB. The budget pick in the Orbit A-series.",
      priceMinor: 129900,
      image: "seed/phone-a34.jpg",
    },
    {
      slug: "nimbus-pro-16-laptop",
      platform: "grandprice",
      categorySlug: "laptops",
      title: "Nimbus Pro 16 Laptop",
      brand: "Nimbus",
      description: "16-inch 2.5K, 32 GB RAM, 1 TB SSD, discrete graphics. For heavy workloads.",
      priceMinor: 1149900,
      image: "seed/laptop-pro.jpg",
    },
  ];

  for (const p of products) {
    const vendorId = vendorIdBySlug[p.platform]!;
    const categoryId = catIdBySlug[p.categorySlug]!;
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        vendorId,
        categoryId,
        title: p.title,
        brand: p.brand,
        description: p.description,
        condition: "NEW",
        status: "PUBLISHED",
        platformSlugs: [p.platform],
        publishedAt: new Date(),
        media: { create: { kind: "IMAGE", fileKey: p.image, sortOrder: 0 } },
      },
      update: { title: p.title, description: p.description, status: "PUBLISHED", categoryId },
    });

    // Variants + inventory.
    const variants = p.variants ?? [{ sku: `${p.slug}-default`, name: "Default", priceMinor: p.priceMinor, qty: 50 }];
    for (const v of variants) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        create: { sku: v.sku, productId: product.id, name: v.name, priceMinor: v.priceMinor },
        update: { priceMinor: v.priceMinor },
      });
      await prisma.inventory.upsert({
        where: { variantId_vendorId: { variantId: variant.id, vendorId } },
        create: { variantId: variant.id, vendorId, quantity: v.qty, lowStockThreshold: 5 },
        update: { quantity: v.qty },
      });
    }

    // Primary offer from the owning vendor.
    const offer = await prisma.vendorOffer.upsert({
      where: { productId_vendorId: { productId: product.id, vendorId } },
      create: {
        productId: product.id,
        vendorId,
        priceMinor: p.priceMinor,
        currency: "GHS",
        condition: "NEW",
        status: "ACTIVE",
        fulfilment: { method: "PLATFORM_DELIVERY" },
      },
      update: { priceMinor: p.priceMinor, status: "ACTIVE" },
    });
    await prisma.priceHistory.create({ data: { offerId: offer.id, priceMinor: p.priceMinor } }).catch(() => {});

    if (p.gas) {
      await prisma.gasCylinderListing.upsert({
        where: { offerId: offer.id },
        create: {
          offerId: offer.id,
          cylinderType: p.gas.cylinderType,
          weightKg: p.gas.weightKg,
          capacityL: p.gas.capacityL,
          requiresExchange: p.gas.cylinderType === "STANDARD",
          depositMinor: p.gas.depositMinor,
        },
        update: { depositMinor: p.gas.depositMinor },
      });
    }
  }

  // A second-vendor offer on the phone (multi-vendor demo, same platform).
  const gpVendor2User = await prisma.user.upsert({
    where: { phone: "+233200000003" },
    create: {
      phone: "+233200000003",
      status: "ACTIVE",
      firstName: "Kumasi Gadget Store",
      roles: { create: [{ role: "VENDOR", status: "ACTIVE", activatedAt: new Date() }] },
      tokenEpoch: { create: {} },
    },
    update: {},
  });
  const gpVendor2 = await prisma.vendorProfile.upsert({
    where: { userId: gpVendor2User.id },
    create: { userId: gpVendor2User.id, displayName: "Kumasi Gadget Store", status: "ACTIVE", verifiedAt: new Date(), platformIds: ["grandprice"] },
    update: {},
  });
  const phone = await prisma.product.findUnique({ where: { slug: "orbit-a54-phone" } });
  if (phone) {
    await prisma.vendorOffer.upsert({
      where: { productId_vendorId: { productId: phone.id, vendorId: gpVendor2.id } },
      create: { productId: phone.id, vendorId: gpVendor2.id, priceMinor: 184900, currency: "GHS", condition: "NEW", status: "ACTIVE" },
      update: { priceMinor: 184900 },
    });

    // A product video (MediaKind.VIDEO) so the PDP video block is demoable.
    const hasVideo = await prisma.productMedia.findFirst({ where: { productId: phone.id, kind: "VIDEO" } });
    if (!hasVideo) {
      await prisma.productMedia.create({
        data: {
          productId: phone.id,
          kind: "VIDEO",
          fileKey: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          alt: "Orbit A54 hands-on",
          sortOrder: 1,
        },
      });
    }
  }

  // Give the two catalog vendors a business location (Accra) so /search/nearby returns data.
  const accra: [string, number, number][] = [
    ["grandprice", -0.187, 5.6037],
    ["tizzi-gas", -0.205, 5.585],
  ];
  for (const [slug, lng, lat] of accra) {
    const vId = vendorIdBySlug[slug];
    if (vId) {
      await prisma.$executeRaw`
        UPDATE "businesses"
        SET "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        WHERE "vendorId" = ${vId}`;
    }
  }

  const [cats, prods, offers] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.vendorOffer.count(),
  ]);
  console.log(`  catalog — ${cats} categories, ${prods} products, ${offers} offers`);

  await seedPromotions();
}

async function seedPromotions() {
  const bySlug = async (slug: string) =>
    (await prisma.product.findUnique({ where: { slug }, select: { id: true } }))?.id;

  const promos: {
    slug: string;
    kind: "FLASH_DEAL" | "CAMPAIGN" | "BANNER";
    title: string;
    subtitle?: string;
    imageKey?: string;
    ctaRoute?: string;
    platform: string;
    priority?: number;
    endsInHours?: number;
    items?: { slug: string; discountBps?: number }[];
  }[] = [
    {
      slug: "gp-weekend-flash",
      kind: "FLASH_DEAL",
      title: "Weekend Flash Sale",
      subtitle: "Up to 10% off — ends Sunday",
      platform: "grandprice",
      priority: 10,
      endsInHours: 72,
      items: [
        { slug: "orbit-a54-phone", discountBps: 1000 },
        { slug: "nimbus-14-laptop", discountBps: 500 },
      ],
    },
    {
      slug: "gp-back-to-work",
      kind: "CAMPAIGN",
      title: "Back to Work",
      subtitle: "Kit out your home office",
      platform: "grandprice",
      priority: 5,
      items: [{ slug: "nimbus-14-laptop" }, { slug: "orbit-a54-phone" }],
    },
    {
      slug: "gp-electronics-banner",
      kind: "BANNER",
      title: "New in Electronics",
      subtitle: "Fresh arrivals every week",
      imageKey: "banners/electronics.jpg",
      ctaRoute: "/category/electronics",
      platform: "grandprice",
      priority: 1,
    },
    {
      slug: "gas-refill-deal",
      kind: "FLASH_DEAL",
      title: "Refill & Save",
      subtitle: "8% off cylinder exchanges today",
      platform: "tizzi-gas",
      priority: 10,
      endsInHours: 24,
      items: [{ slug: "swiftgas-12kg-exchange", discountBps: 800 }],
    },
    {
      slug: "gas-safety-banner",
      kind: "BANNER",
      title: "Gas safety checklist",
      subtitle: "Keep your home safe",
      imageKey: "banners/gas-safety.jpg",
      ctaRoute: "/category/gas-accessories",
      platform: "tizzi-gas",
      priority: 1,
    },
  ];

  for (const p of promos) {
    const endsAt = p.endsInHours ? new Date(Date.now() + p.endsInHours * 3_600_000) : null;
    const promo = await prisma.promotion.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        kind: p.kind,
        title: p.title,
        subtitle: p.subtitle,
        imageKey: p.imageKey,
        ctaRoute: p.ctaRoute,
        platformSlugs: [p.platform],
        priority: p.priority ?? 0,
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt,
      },
      update: { title: p.title, subtitle: p.subtitle, priority: p.priority ?? 0, endsAt },
    });

    let order = 0;
    for (const item of p.items ?? []) {
      const productId = await bySlug(item.slug);
      if (!productId) continue;
      await prisma.promotionItem.upsert({
        where: { promotionId_productId: { promotionId: promo.id, productId } },
        create: { promotionId: promo.id, productId, discountBps: item.discountBps, sortOrder: order++ },
        update: { discountBps: item.discountBps },
      });
    }
  }

  const promoCount = await prisma.promotion.count();
  console.log(`  promotions — ${promoCount} live`);
}

// --- Domain 4/6 — checkout config + starter coupons ---------------------
async function seedCommerce() {
  const feeValue = { serviceFeeBps: 200, taxBps: 0, deliveryFlatMinor: 1500, freeDeliveryThresholdMinor: 20000 };
  await prisma.appConfig.upsert({
    where: { id: "seed-checkout-fees" },
    create: { id: "seed-checkout-fees", key: "checkout.fees", scope: "GLOBAL", value: feeValue },
    update: { value: feeValue },
  });

  const coupons: {
    code: string;
    type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
    value: number;
    minSpendMinor?: number;
    perUserLimit?: number;
    maxRedemptions?: number;
    platformSlug?: string | null;
    scope?: Record<string, unknown>;
  }[] = [
    { code: "WELCOME10", type: "PERCENT", value: 1000, minSpendMinor: 5000, perUserLimit: 1, scope: { firstOrderOnly: true } },
    { code: "FREESHIP", type: "FREE_DELIVERY", value: 0, minSpendMinor: 10000, perUserLimit: 5 },
    { code: "SAVE20", type: "FIXED", value: 2000, minSpendMinor: 15000, perUserLimit: 2, platformSlug: "grandprice" },
    { code: "GASWELCOME", type: "FIXED", value: 1500, minSpendMinor: 8000, perUserLimit: 1, platformSlug: "tizzi-gas" },
  ];
  for (const c of coupons) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        type: c.type,
        value: c.value,
        minSpendMinor: c.minSpendMinor,
        perUserLimit: c.perUserLimit ?? 1,
        maxRedemptions: c.maxRedemptions,
        platformSlug: c.platformSlug ?? null,
        scope: (c.scope ?? undefined) as object | undefined,
        status: "ACTIVE",
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 365 * 86_400_000),
      },
      update: { value: c.value, minSpendMinor: c.minSpendMinor, status: "ACTIVE" },
    });
  }
  console.log(`  commerce — checkout.fees + ${coupons.length} coupons`);
}

// --- Phase 4: delivery zones + a live courier per platform --------------
async function seedDelivery() {
  const zones: [string, number, number][] = [
    ["grandprice", 5.6037, -0.187],
    ["tizzi-gas", 5.585, -0.205],
  ];
  for (const [slug, lat, lng] of zones) {
    const id = `seed-zone-${slug}`;
    await prisma.deliveryZone.upsert({
      where: { id },
      create: { id, platformSlug: slug, regionCode: "GH", name: "Greater Accra", centerLat: lat, centerLng: lng, radiusM: 30000, baseFeeMinor: 1000, perKmMinor: 200 },
      update: { centerLat: lat, centerLng: lng, radiusM: 30000 },
    });
  }

  const couriers: { slug: string; phone: string; first: string; last: string; lat: number; lng: number }[] = [
    { slug: "grandprice", phone: "+233200000010", first: "Kofi", last: "Mensah", lat: 5.606, lng: -0.19 },
    { slug: "tizzi-gas", phone: "+233200000011", first: "Ama", last: "Boateng", lat: 5.588, lng: -0.208 },
  ];
  for (const c of couriers) {
    const user = await prisma.user.upsert({
      where: { phone: c.phone },
      create: { phone: c.phone, firstName: c.first, lastName: c.last, status: "ACTIVE" },
      update: { firstName: c.first, lastName: c.last, status: "ACTIVE" },
    });
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: "COURIER" } },
      create: { userId: user.id, role: "COURIER", status: "ACTIVE", kycStatus: "APPROVED", activatedAt: new Date() },
      update: { status: "ACTIVE", kycStatus: "APPROVED" },
    });
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: "CUSTOMER" } },
      create: { userId: user.id, role: "CUSTOMER", status: "ACTIVE", activatedAt: new Date() },
      update: {},
    });
    const courier = await prisma.courierProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: "ACTIVE", onlineStatus: "ONLINE", ratingAvg: 4.8, ratingCount: 24, completedDeliveries: 42, acceptanceRate: 0.92 },
      update: { status: "ACTIVE", onlineStatus: "ONLINE" },
    });
    await prisma.kycCase.upsert({
      where: { subjectType_subjectId: { subjectType: "COURIER", subjectId: courier.id } },
      create: { subjectType: "COURIER", subjectId: courier.id, level: "FULL", status: "APPROVED", platformSlug: c.slug, reviewedAt: new Date() },
      update: { status: "APPROVED" },
    });
    let vehicle = await prisma.courierVehicle.findFirst({ where: { courierId: courier.id } });
    if (!vehicle) {
      vehicle = await prisma.courierVehicle.create({
        data: { courierId: courier.id, type: "MOTORBIKE", make: "Honda", model: "ACE 110", color: "Red", plate: `GR-${c.phone.slice(-4)}-24`, year: 2022, status: "APPROVED" },
      });
    } else {
      await prisma.courierVehicle.update({ where: { id: vehicle.id }, data: { status: "APPROVED" } });
    }
    await prisma.courierProfile.update({ where: { id: courier.id }, data: { activeVehicleId: vehicle.id } });
    await prisma.$executeRaw`
      UPDATE "courier_profiles"
      SET "lastLocation" = ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
          "lastLocationAt" = now()
      WHERE "id" = ${courier.id}`;
    const areaId = `seed-area-${c.slug}`;
    await prisma.courierServiceArea.upsert({
      where: { id: areaId },
      create: { id: areaId, courierId: courier.id, name: "Accra Central", centerLat: c.lat, centerLng: c.lng, radiusM: 20000, enabled: true },
      update: { centerLat: c.lat, centerLng: c.lng },
    });
  }
  console.log(`  delivery — 2 zones, 2 live couriers (Accra)`);
}

// --- Phase 5: one live Inverse Draw on GrandPrice ----------------------
async function seedAuctions() {
  const slug = "seed-inverse-draw-s-class";
  const existing = await prisma.auction.findUnique({ where: { slug } });
  if (existing) {
    console.log(`  auctions — 1 draw (exists)`);
    return;
  }
  await prisma.auction.create({
    data: {
      slug,
      title: "Win a Mercedes S-Class",
      description: "LIVE INVERSE DRAW — hold a seat, and if the pool fills, one buyer takes the car for GHS 250,000 (retail 1,850,000).",
      type: "SEAT_DRAW",
      status: "OPEN",
      platformSlug: "grandprice",
      regionCodes: ["GH"],
      retailValueMinor: 185_000_000,
      ticketPriceMinor: 20_000, // GHS 200 / seat
      winTargetMinor: 25_000_000, // GHS 250,000
      currency: "GHS",
      seatsTotal: 5000,
      minSeatsToDraw: 5,
      drawTrigger: "EITHER",
      nonWinnerPolicy: "REFUND",
      opensAt: new Date(Date.now() - 3_600_000),
      closesAt: new Date(Date.now() + 30 * 86_400_000),
      drawAt: new Date(Date.now() + 30 * 86_400_000),
      rules: { region: "GH only", minAge: 21 },
      assets: {
        create: { title: "Mercedes-Benz S-Class 2024", media: ["seed/s-class.jpg"], specs: { engine: "3.0L I6 turbo", year: 2024 }, retailValueMinor: 185_000_000 },
      },
      packages: {
        create: [
          { name: "Single seat", ticketCount: 1, bonusTickets: 0, priceMinor: 20_000, sortOrder: 0 },
          { name: "5 seats", ticketCount: 5, bonusTickets: 1, priceMinor: 100_000, sortOrder: 1 },
          { name: "20 seats", ticketCount: 20, bonusTickets: 5, priceMinor: 400_000, sortOrder: 2 },
        ],
      },
      qualRules: {
        create: [
          { factor: "TICKETS", weight: 1 },
          { factor: "ENGAGEMENT", weight: 0.2 },
          { factor: "SHARE", weight: 0.15 },
          { factor: "REFERRAL", weight: 0.25 },
        ],
      },
    },
  });
  console.log(`  auctions — 1 live draw (grandprice)`);
}

async function main() {
  for (const c of currencies) {
    await prisma.currency.upsert({ where: { code: c.code }, create: c, update: c });
  }
  for (const r of regions) {
    await prisma.region.upsert({ where: { code: r.code }, create: r, update: r });
  }

  for (const [key, description, valueType] of flags) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, description, valueType: valueType as never },
      update: { description, valueType: valueType as never },
    });
  }

  for (const p of platforms) {
    await prisma.platform.upsert({
      where: { slug: p.slug },
      create: p,
      update: { name: p.name, defaultCurrency: p.defaultCurrency, supportedRegions: p.supportedRegions, theme: p.theme },
    });
    for (const [flagKey, value] of Object.entries(platformFeatures[p.slug] ?? {})) {
      await prisma.platformFeature.upsert({
        where: { platformSlug_flagKey: { platformSlug: p.slug, flagKey } },
        create: { platformSlug: p.slug, flagKey, value: value as never },
        update: { value: value as never },
      });
    }
  }

  // --- Starter fees / pricing / config --------------------------------
  for (const slug of ["grandprice", "tizzi-gas"]) {
    await prisma.feeSchedule.upsert({
      where: { id: `seed-commission-${slug}` },
      create: { id: `seed-commission-${slug}`, party: "VENDOR", kind: "COMMISSION", platformSlug: slug, params: { percent: 10 } },
      update: { params: { percent: 10 } },
    });
    await prisma.feeSchedule.upsert({
      where: { id: `seed-courier-payout-${slug}` },
      create: { id: `seed-courier-payout-${slug}`, party: "COURIER", kind: "PAYOUT", platformSlug: slug, params: { percent: 80 } },
      update: { params: { percent: 80 } },
    });
    await prisma.pricingRule.upsert({
      where: { id: `seed-delivery-${slug}` },
      create: {
        id: `seed-delivery-${slug}`,
        scope: "DELIVERY",
        platformSlug: slug,
        regionCode: "GH",
        params: { baseMinor: 1000, perKmMinor: 200, perMinMinor: 30, minMinor: 1500, currency: "GHS" },
      },
      update: {},
    });
  }

  await prisma.appConfig.upsert({
    where: { id: "seed-app-min-version" },
    create: { id: "seed-app-min-version", key: "app.min_version", scope: "GLOBAL", value: { ios: "1.0.0", android: "1.0.0" } },
    update: { value: { ios: "1.0.0", android: "1.0.0" } },
  });

  await seedCatalog();
  await seedCommerce();
  await seedDelivery();
  await seedAuctions();
  await seedAdvertising();

  const [pf, cur, plat] = await Promise.all([
    prisma.platformFeature.count(),
    prisma.currency.count(),
    prisma.platform.count(),
  ]);
  console.log(`seed OK — ${plat} platforms, ${cur} currencies, ${flags.length} flags, ${pf} platform-feature rows`);
}

// --- Phase 7: advertising, boost tiers, referrals ----------------------
async function seedAdvertising() {
  const tiers: {
    key: string; name: string; badge: string; billingModel: string; priceMinor: number;
    rankBoostBps: number; sortOrder: number; placements: string[]; platformSlugs: string[];
  }[] = [
    { key: "basic", name: "Basic", badge: "Sponsored", billingModel: "CPM", priceMinor: 3000, rankBoostBps: 11000, sortOrder: 1, placements: ["SEARCH_TOP", "CATEGORY_TOP"], platformSlugs: ["grandprice", "tizzi-gas"] },
    { key: "premium", name: "Premium", badge: "Featured", billingModel: "CPM", priceMinor: 6000, rankBoostBps: 13000, sortOrder: 2, placements: ["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED"], platformSlugs: ["grandprice", "tizzi-gas"] },
    { key: "platinum", name: "Platinum", badge: "Top pick", billingModel: "FLAT_DAILY", priceMinor: 25000, rankBoostBps: 16000, sortOrder: 3, placements: ["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED", "CHECKOUT_CROSS_SELL"], platformSlugs: ["grandprice"] },
  ];
  for (const t of tiers) {
    const data = { ...t, billingModel: t.billingModel as never, placements: t.placements as never };
    await prisma.boostTier.upsert({
      where: { key: t.key },
      create: data,
      update: { ...data, isActive: true },
    });
  }

  const gpVendorUser = await prisma.user.findUnique({ where: { phone: "+233200000001" } });
  const premium = await prisma.boostTier.findUnique({ where: { key: "premium" } });
  const phone = await prisma.product.findUnique({ where: { slug: "orbit-a54-phone" } });
  if (gpVendorUser && premium && phone) {
    await prisma.campaign.upsert({
      where: { id: "seed-campaign-orbit" },
      create: {
        id: "seed-campaign-orbit",
        vendorId: gpVendorUser.id,
        platformSlug: "grandprice",
        name: "Orbit A54 — back to school",
        objective: "PRODUCT_SALES",
        boostTierId: premium.id,
        status: "ACTIVE",
        budgetMinor: 500_00,
        spentMinor: 0,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
        targeting: { keywords: ["phone", "android"] },
        items: { create: [{ productId: phone.id }] },
        ads: {
          create: [
            { slot: "HOME_RAIL", creativeKind: "PRODUCT_CARD", headline: "Orbit A54 — big screen, small price", productId: phone.id, destinationRoute: "/product/orbit-a54-phone", weight: 120 },
            { slot: "SEARCH_TOP", creativeKind: "PRODUCT_CARD", headline: "Orbit A54", productId: phone.id, weight: 100 },
          ],
        },
      },
      update: { status: "ACTIVE", boostTierId: premium.id, endsAt: new Date(Date.now() + 30 * 86_400_000) },
    });
  }

  for (const [phoneNum, code] of [
    ["+233200000001", "ACCRAHUB1"],
    ["+233200000003", "SHOPFRIEND"],
  ] as const) {
    const u = await prisma.user.findUnique({ where: { phone: phoneNum } });
    if (u) {
      await prisma.referralCode.upsert({ where: { userId: u.id }, create: { userId: u.id, code }, update: { code } });
    }
  }

  const [bt, camp] = await Promise.all([prisma.boostTier.count(), prisma.campaign.count()]);
  console.log(`seed advertising — ${bt} boost tiers, ${camp} campaigns`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
