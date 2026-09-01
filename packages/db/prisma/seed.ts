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
