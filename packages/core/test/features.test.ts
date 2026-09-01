import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { assertFeature, hasFeature, resolveFeatures } from "../src/platform/index.ts";
import { isAppError } from "../src/errors.ts";

afterAll(() => prisma.$disconnect());

/**
 * Requires the seed to have run on the test DB (grandprice: auction=true,
 * tizzi-gas: auction=false — see packages/db/prisma/seed.ts).
 */
describe("per-platform capability resolver", () => {
  it("grandprice → auction enabled", async () => {
    const f = await resolveFeatures({ platformSlug: "grandprice" });
    expect(hasFeature(f, "auction")).toBe(true);
    expect(() => assertFeature(f, "auction")).not.toThrow();
  });

  it("tizzi-gas → auction disabled, assertFeature throws FEATURE_DISABLED", async () => {
    const f = await resolveFeatures({ platformSlug: "tizzi-gas" });
    expect(hasFeature(f, "auction")).toBe(false);
    try {
      assertFeature(f, "auction");
      throw new Error("expected assertFeature to throw");
    } catch (e) {
      expect(isAppError(e)).toBe(true);
      if (isAppError(e)) expect(e.code).toBe("FEATURE_DISABLED");
    }
  });

  it("an unknown flag is treated as off", async () => {
    const f = await resolveFeatures({ platformSlug: "grandprice" });
    expect(hasFeature(f, "does-not-exist")).toBe(false);
  });
});
