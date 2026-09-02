import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import {
  activePromotions,
  homeRails,
  promotionBySlug,
  similarProducts,
} from "../src/catalog/index.ts";
import { isAppError } from "../src/index.ts";

afterAll(() => prisma.$disconnect());

/** Requires the seed (5 promotions, gp/gas scoped). */
describe("promotions read side", () => {
  it("returns tenant-scoped promotions with computed deal prices", async () => {
    const promos = await activePromotions({ platformSlug: "grandprice" });
    const flash = promos.find((p) => p.slug === "gp-weekend-flash");
    expect(flash).toBeDefined();
    expect(flash!.kind).toBe("FLASH_DEAL");

    const phone = flash!.items.find((i) => i.slug === "orbit-a54-phone")!;
    expect(phone.discountBps).toBe(1000);
    // 184900 * (1 - 0.10) = 166410
    expect(phone.dealPriceMinor).toBe(166410);
    expect(phone.priceMinor).toBe(184900);
  });

  it("does not leak a grandprice promotion to tizzi-gas", async () => {
    const gas = await activePromotions({ platformSlug: "tizzi-gas" });
    expect(gas.map((p) => p.slug)).not.toContain("gp-weekend-flash");
    expect(gas.map((p) => p.slug)).toContain("gas-refill-deal");

    await expect(promotionBySlug("gp-weekend-flash", "tizzi-gas")).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === "NOT_FOUND",
    );
  });

  it("filters by kind", async () => {
    const banners = await activePromotions({ platformSlug: "grandprice", kind: "BANNER" });
    expect(banners.every((p) => p.kind === "BANNER")).toBe(true);
    expect(banners.map((p) => p.slug)).toContain("gp-electronics-banner");
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
