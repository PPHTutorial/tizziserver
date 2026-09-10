import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { analytics } from "@stall/core";
import { dropUser, makeUser } from "./helpers.ts";

const trash: string[] = [];

afterAll(async () => {
  for (const id of trash) await dropUser(id).catch(() => {});
  await prisma.$disconnect();
});

describe("analytics", () => {
  it("platform analytics returns KPIs + queues + a daily GMV series", async () => {
    const a = await analytics.platformAnalytics("grandprice", { days: 14 });
    expect(a.range.days).toBe(14);
    expect(a.gmvSeries).toHaveLength(14);
    expect(a.kpis).toHaveProperty("gmvMinor");
    expect(a.kpis).toHaveProperty("aovMinor");
    expect(a.queues).toHaveProperty("kyc");
    expect(a.queues).toHaveProperty("campaignReview");
  });

  it("resolveRange clamps to [1, 365]", () => {
    expect(analytics.resolveRange(0).days).toBe(1);
    expect(analytics.resolveRange(9999).days).toBe(365);
    expect(analytics.resolveRange(undefined).days).toBe(30);
  });

  it("vendor analytics rejects a non-vendor", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    await expect(analytics.vendorAnalytics(u.id)).rejects.toThrow(/Not a vendor/);
  });

  it("courier analytics rejects a non-courier", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    await expect(analytics.courierAnalytics(u.id)).rejects.toThrow(/Not a courier/);
  });

  it("vendor analytics shapes for a seeded vendor", async () => {
    const vp = await prisma.vendorProfile.findFirst({ where: { status: "ACTIVE" }, select: { userId: true } });
    if (!vp) return;
    const a = await analytics.vendorAnalytics(vp.userId, { days: 60 });
    expect(a.sales).toHaveProperty("grossMinor");
    expect(a.advertising).toHaveProperty("roas");
    expect(Array.isArray(a.topProducts)).toBe(true);
  });
});
