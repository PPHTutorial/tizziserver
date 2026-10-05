import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import {
  activePromotions,
  homeRails,
  promotionBySlug,
  similarProducts,
} from "../src/catalog/index.ts";
import { isAppError } from "../src/index.ts";

// Seeded flash deals expire (endsAt = seed time + 24/72h), so the suite
// creates its own live, uniquely-slugged promotions and removes them after.
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const GP_FLASH = `t-gp-flash-${RUN}`;
const GAS_FLASH = `t-gas-flash-${RUN}`;
const GP_BANNER = `t-gp-banner-${RUN}`;

beforeAll(async () => {
  const product = (slug: string) => prisma.product.findFirstOrThrow({ where: { slug }, select: { id: true } });
  const phone = await product("orbit-a54-phone");
  const gasItem = await product("swiftgas-12kg-exchange");
  const live = { startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000) };
  await prisma.promotion.create({
    data: {
      slug: GP_FLASH, kind: "FLASH_DEAL", title: "Test flash", platformSlugs: ["grandprice"], priority: 10, ...live,
      items: { create: [{ productId: phone.id, discountBps: 1000 }] },
    },
  });
  await prisma.promotion.create({
    data: {
      slug: GAS_FLASH, kind: "FLASH_DEAL", title: "Test gas flash", platformSlugs: ["tizzi-gas"], priority: 10, ...live,
      items: { create: [{ productId: gasItem.id, discountBps: 800 }] },
    },
  });
  await prisma.promotion.create({
    data: { slug: GP_BANNER, kind: "BANNER", title: "Test banner", platformSlugs: ["grandprice"], ...live },
  });
});

afterAll(async () => {
  await prisma.promotion.deleteMany({ where: { slug: { in: [GP_FLASH, GAS_FLASH, GP_BANNER] } } });
  await prisma.$disconnect();
});

/** Uses its own fixtures + seeded products (orbit-a54-phone, swiftgas-12kg-exchange). */
describe("promotions read side", () => {
  it("returns tenant-scoped promotions with computed deal prices", async () => {
    const promos = await activePromotions({ platformSlug: "grandprice" });
    const flash = promos.find((p) => p.slug === GP_FLASH);
    expect(flash).toBeDefined();
    expect(flash!.kind).toBe("FLASH_DEAL");

    const phone = flash!.items.find((i) => i.slug === "orbit-a54-phone")!;
    expect(phone.discountBps).toBe(1000);
    expect(phone.priceMinor).toBeGreaterThan(0);
    // 10% off, e.g. 184900 → 166410
    expect(phone.dealPriceMinor).toBe(Math.round(phone.priceMinor! * 0.9));
  });

  it("does not leak a grandprice promotion to tizzi-gas", async () => {
    const gas = await activePromotions({ platformSlug: "tizzi-gas" });
    expect(gas.map((p) => p.slug)).not.toContain(GP_FLASH);
    expect(gas.map((p) => p.slug)).toContain(GAS_FLASH);

    await expect(promotionBySlug(GP_FLASH, "tizzi-gas")).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === "NOT_FOUND",
    );
  });

  it("filters by kind", async () => {
    const banners = await activePromotions({ platformSlug: "grandprice", kind: "BANNER" });
    expect(banners.every((p) => p.kind === "BANNER")).toBe(true);
    expect(banners.map((p) => p.slug)).toContain(GP_BANNER);
  });
});

describe("home rails", () => {
  it("bundles flash deals, banners and product rails", async () => {
    const rails = await homeRails({ platformSlug: "grandprice" });
    expect(rails.flashDeals.length).toBeGreaterThanOrEqual(1);
    expect(rails.banners.length).toBeGreaterThanOrEqual(1);
    expect(rails.newArrivals.length).toBeGreaterThan(0);
  });
});

describe("similar products", () => {
  it("returns same-category products, excluding the product itself", async () => {
    const sim = await similarProducts("orbit-a54-phone", "grandprice");
    const slugs = sim.map((p) => p.slug);
    expect(slugs).toContain("orbit-a34-phone");
    expect(slugs).not.toContain("orbit-a54-phone");
    expect(slugs).not.toContain("nimbus-14-laptop"); // different category
  });
});
