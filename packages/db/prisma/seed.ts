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
      update: {},
    });
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

  const [pf, cur, plat] = await Promise.all([
    prisma.platformFeature.count(),
    prisma.currency.count(),
    prisma.platform.count(),
  ]);
  console.log(`seed OK — ${plat} platforms, ${cur} currencies, ${flags.length} flags, ${pf} platform-feature rows`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
