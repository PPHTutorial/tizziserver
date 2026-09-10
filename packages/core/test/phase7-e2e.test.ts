/**
 * Phase 7 device-parity end-to-end — advertising, boosting, analytics, referrals.
 *
 *   E2E=1 API_URL=http://localhost:3000 \
 *     pnpm --filter @stall/core exec vitest run test/phase7-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { issueOtp } from "../src/auth/otp.ts";
import { dropUser } from "./helpers.ts";

const RUN = process.env.E2E === "1";
const BASE = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const VENDOR_PHONE = "+233200000001";
const STAFF_PHONE = "+233200000071";

type Env<T = any> = { ok: boolean; data: T; error: { code: string; message: string } | null };
const createdUsers: string[] = [];

async function call<T = any>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; env: Env<T> }> {
  const headers: Record<string, string> = { "x-platform": "grandprice", "x-device-id": "e2e-p7", "content-type": "application/json", ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, env: (await res.json()) as Env<T> };
}

async function signIn(phone: string, track = true) {
  const { code } = await issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN" });
  const { status, env } = await call<{ user: { id: string }; accessToken: string; activeRole: string }>("/api/v1/auth/verify", {
    body: { phone, code, device: { deviceId: "e2e-p7", platform: "ANDROID" } },
  });
  expect(status, JSON.stringify(env)).toBe(200);
  if (track) createdUsers.push(env.data.user.id);
  return { userId: env.data.user.id, token: env.data.accessToken, activeRole: env.data.activeRole };
}

async function roleToken(phone: string, role: string) {
  const s = await signIn(phone, false);
  if (s.activeRole === role) return s;
  const sw = await call<{ accessToken: string }>("/api/v1/auth/switch-role", { token: s.token, body: { role } });
  expect(sw.status, JSON.stringify(sw.env)).toBe(200);
  return { ...s, token: sw.env.data.accessToken };
}

describe.skipIf(!RUN)("Phase 7 e2e — advertising + analytics + referrals over HTTP", () => {
  beforeAll(async () => {
    const boot = await fetch(`${BASE}/api/v1/config/bootstrap`, { headers: { "x-platform": "grandprice" } }).catch(() => null);
    if (!boot || !boot.ok) throw new Error(`API not reachable at ${BASE}`);
    await prisma.user.upsert({
      where: { phone: STAFF_PHONE },
      create: { phone: STAFF_PHONE, status: "ACTIVE", roles: { create: [{ role: "STAFF", status: "ACTIVE", activatedAt: new Date() }, { role: "CUSTOMER", status: "ACTIVE", activatedAt: new Date() }] }, tokenEpoch: { create: {} } },
      update: {},
    });
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.campaign.deleteMany({ where: { vendorId: id } }).catch(() => {});
      await prisma.referral.deleteMany({ where: { OR: [{ referrerId: id }, { refereeId: id }] } }).catch(() => {});
      await prisma.referralCode.deleteMany({ where: { userId: id } }).catch(() => {});
      await dropUser(id).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("vendor creates + submits a campaign, staff approves, events + analytics flow", async () => {
    const vendor = await roleToken(VENDOR_PHONE, "VENDOR");

    // fund the vendor wallet
    await call("/api/v1/wallet/topup", { token: vendor.token, body: { amountMinor: 200_000 }, headers: { "idempotency-key": `p7-top-${Date.now()}` } });

    const tiers = await call<{ items: { key: string }[] }>("/api/v1/ads/tiers", { token: vendor.token });
    expect(tiers.status, JSON.stringify(tiers.env)).toBe(200);
    expect(tiers.env.data.items.length).toBeGreaterThan(0);

    const product = await call<{ id: string }>("/api/v1/catalog/products/orbit-a54-phone");
    const productId = product.env.data.id;

    const created = await call<{ id: string; status: string }>("/api/v1/vendors/campaigns", {
      token: vendor.token,
      body: { name: "E2E campaign", boostTierKey: tiers.env.data.items[0]!.key, budgetMinor: 50_00, productIds: [productId] },
    });
    expect(created.status, JSON.stringify(created.env)).toBe(200);
    const campaignId = created.env.data.id;

    const submitted = await call<{ status: string }>(`/api/v1/vendors/campaigns/${campaignId}/submit`, {
      token: vendor.token,
      body: { payment: { method: "wallet" } },
      headers: { "idempotency-key": `p7-sub-${campaignId}` },
    });
    expect(submitted.status, JSON.stringify(submitted.env)).toBe(200);

    if (submitted.env.data.status === "PENDING_REVIEW") {
      const staff = await roleToken(STAFF_PHONE, "STAFF");
      const queue = await call<{ items: { id: string }[] }>("/api/v1/staff/campaigns", { token: staff.token });
      expect(queue.env.data.items.some((c) => c.id === campaignId)).toBe(true);
      const rev = await call(`/api/v1/staff/campaigns/${campaignId}/review`, { token: staff.token, body: { approve: true } });
      expect(rev.status, JSON.stringify(rev.env)).toBe(200);
    }

    // sponsored serving + an impression event
    const sponsored = await call<{ items: { campaignId: string; adId: string | null }[] }>("/api/v1/ads/sponsored?slot=HOME_RAIL");
    expect(sponsored.status).toBe(200);
    const mine = sponsored.env.data.items.find((s) => s.campaignId === campaignId);
    if (mine) {
      const ev = await call("/api/v1/ads/events", { body: { campaignId, adId: mine.adId, kind: "IMPRESSION", placement: "HOME_RAIL" } });
      expect(ev.status).toBe(200);
    }

    const detail = await call<{ performance: { budgetMinor: number } }>(`/api/v1/vendors/campaigns/${campaignId}`, { token: vendor.token });
    expect(detail.env.data.performance.budgetMinor).toBe(50_00);

    const analytics = await call<{ advertising: { spendMinor: number } }>("/api/v1/vendors/analytics?days=30", { token: vendor.token });
    expect(analytics.status, JSON.stringify(analytics.env)).toBe(200);
    expect(analytics.env.data.advertising).toHaveProperty("roas");

    // clean up the campaign spend
    await call(`/api/v1/vendors/campaigns/${campaignId}/cancel`, { token: vendor.token });
  });

  it("referral code round-trips", async () => {
    const referee = await signIn(`+19197${Date.now().toString().slice(-6)}`);
    const referrer = await roleToken(VENDOR_PHONE, "CUSTOMER");
    const mine = await call<{ code: string }>("/api/v1/me/referrals", { token: referrer.token });
    expect(mine.status).toBe(200);
    const applied = await call<{ status: string }>("/api/v1/me/referrals/apply", { token: referee.token, body: { code: mine.env.data.code } });
    expect([200, 409]).toContain(applied.status); // 409 if this device already linked one
  });
});
