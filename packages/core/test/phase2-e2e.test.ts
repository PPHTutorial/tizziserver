/**
 * Phase 2 device-parity end-to-end.
 *
 * Fires the exact HTTP sequence the Flutter screens make against a *running*
 * `apps/api` (default http://localhost:3000), across both tenants. It is the
 * scripted stand-in for an on-device tap-through: proves routing, the `withApi`
 * middleware chain, the response envelope, tenant scoping, and the
 * vendor onboard → KYC → publish → visible-in-catalog loop end to end.
 *
 * Opt-in (needs the API server up, not just the DB):
 *   E2E=1 API_URL=http://localhost:3000 \
 *     pnpm --filter @stall/core exec vitest run test/phase2-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { auth as coreAuth } from "@stall/core";
import { issueOtp } from "../src/auth/otp.ts";
import { dropUser } from "./helpers.ts";

const RUN = process.env.E2E === "1";
const BASE = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Envelope<T = unknown> = { ok: boolean; data: T; error: { code: string; message: string } | null };

const trashUsers: string[] = [];
const trashVendors: string[] = [];

interface CallOpts {
  method?: string;
  platform?: string;
  token?: string;
  body?: unknown;
  deviceId?: string;
}

async function call<T = any>(path: string, opts: CallOpts = {}): Promise<{ status: number; env: Envelope<T> }> {
  const headers: Record<string, string> = {
    "x-platform": opts.platform ?? "grandprice",
    "x-device-id": opts.deviceId ?? "e2e-device",
    "content-type": "application/json",
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const env = (await res.json()) as Envelope<T>;
  return { status: res.status, env };
}

/** Register/sign in a fresh phone via the real OTP + verify HTTP path. */
async function signIn(phone: string, platform = "grandprice") {
  const { code } = await issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN" });
  const { status, env } = await call<{ user: { id: string }; accessToken: string; refreshToken: string }>(
    "/api/v1/auth/verify",
    {
      platform,
      body: {
        phone,
        code,
        device: { deviceId: "e2e-device", platform: "ANDROID", model: "e2e", appVersion: "1.0.0" },
      },
    },
  );
  expect(status, JSON.stringify(env)).toBe(200);
  expect(env.ok).toBe(true);
  trashUsers.push(env.data.user.id);
  return { userId: env.data.user.id, token: env.data.accessToken, refresh: env.data.refreshToken };
}

describe.skipIf(!RUN)("Phase 2 e2e — customer + vendor journeys over HTTP", () => {
  beforeAll(async () => {
    const r = await fetch(`${BASE}/api/v1/config/bootstrap`, { headers: { "x-platform": "grandprice" } }).catch(
      () => null,
    );
    if (!r || !r.ok) throw new Error(`API not reachable at ${BASE} — start it with \`pnpm --filter @stall/api dev\``);
  });

  afterAll(async () => {
    for (const id of trashVendors) {
      await prisma.kycCase.deleteMany({ where: { subjectId: id } });
      await prisma.vendorOffer.deleteMany({ where: { vendorId: id } });
      await prisma.product.deleteMany({ where: { vendorId: id } });
      await prisma.vendorProfile.deleteMany({ where: { id } });
    }
    for (const id of trashUsers) await dropUser(id);
    await prisma.$disconnect();
  });

  it("customer: sign in → bootstrap → home rails → browse → search → detail → wishlist", async () => {
    const phone = `+233555${Date.now().toString().slice(-7)}`;
    const { userId, token } = await signIn(phone);

    // bootstrap (authed): a customer nav + active role
    const boot = await call<{ activeRole: string; nav: unknown[]; features: Record<string, unknown> }>(
      "/api/v1/config/bootstrap",
      { token },
    );
    expect(boot.status).toBe(200);
    expect(boot.env.data.activeRole).toBe("CUSTOMER");
    expect(Array.isArray(boot.env.data.nav)).toBe(true);
    expect(boot.env.data.features.auction).toBe(true); // grandprice

    // home rails — the single call the home screen makes
    const home = await call<Record<string, unknown>>("/api/v1/catalog/home", { token });
    expect(home.status).toBe(200);
    expect(home.env.ok).toBe(true);

    // category explorer
    const cats = await call<{ items: { slug: string }[] }>("/api/v1/catalog/categories", { token });
    expect(cats.status).toBe(200);
    expect(cats.env.data.items.length).toBeGreaterThan(0);

    // category grid
    const phones = await call<{ items: { slug: string }[] }>("/api/v1/catalog/products?category=phones", { token });
    expect(phones.status).toBe(200);
    expect(phones.env.data.items.map((p) => p.slug)).toContain("orbit-a54-phone");

    // search + typo tolerance
    const search = await call<{ items: { slug: string }[] }>("/api/v1/search?q=laptop", { token });
    expect(search.status).toBe(200);
    expect(search.env.data.items.map((p) => p.slug)).toContain("nimbus-14-laptop");
    const typo = await call<{ items: { slug: string }[] }>("/api/v1/search?q=nimbis", { token });
    expect(typo.env.data.items.map((p) => p.slug)).toContain("nimbus-14-laptop");

    // product detail — multi-vendor offers
    const detail = await call<{ id: string; offers: unknown[] }>("/api/v1/catalog/products/orbit-a54-phone", { token });
    expect(detail.status).toBe(200);
    expect(detail.env.data.offers.length).toBeGreaterThanOrEqual(2);
    const productId = detail.env.data.id;

    // "you might also like"
    const similar = await call<{ items: unknown[] }>("/api/v1/catalog/products/orbit-a54-phone/similar", { token });
    expect(similar.status).toBe(200);

    // wishlist add → list → remove
    const add = await call("/api/v1/me/wishlist", { token, body: { productId } });
    expect(add.status).toBe(200);
    const list = await call<{ items: { productId?: string; id?: string }[] }>("/api/v1/me/wishlist", { token });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.env.data.items)).toContain(productId);
    const del = await call("/api/v1/me/wishlist", { method: "DELETE", token, body: { productId } });
    expect(del.status).toBe(200);

    void userId;
  });

  it("vendor: onboard → STAFF approves KYC → create draft → publish → shows in catalog + stats", async () => {
    const phone = `+233544${Date.now().toString().slice(-7)}`;
    const { userId, token: custToken } = await signIn(phone);

    // "Sell on Stall" → onboarding (grants the VENDOR role, opens a KYC case)
    const onboard = await call<{ vendorId: string; kycStatus: string }>("/api/v1/vendors/onboarding", {
      token: custToken,
      body: {
        displayName: "E2E Bench Store",
        business: { legalName: "E2E Bench Store Ltd", country: "GH", city: "Accra" },
      },
    });
    expect(onboard.status, JSON.stringify(onboard.env)).toBe(200);
    expect(onboard.env.data.kycStatus).toBe("PENDING");
    const vendorId = onboard.env.data.vendorId;
    trashVendors.push(vendorId);

    // a STAFF reviewer (created out-of-band, mirrors the §24 console)
    const staff = await prisma.user.create({
      data: {
        phone: `+233500${Date.now().toString().slice(-7)}`,
        status: "ACTIVE",
        roles: { create: { role: "STAFF", status: "ACTIVE", activatedAt: new Date() } },
        tokenEpoch: { create: {} },
      },
    });
    trashUsers.push(staff.id);
    const staffPair = await coreAuth.issueTokenPair({ userId: staff.id, platform: "grandprice", activeRole: "STAFF" });

    const review = await call("/api/v1/vendors/kyc/review", {
      token: staffPair.accessToken,
      body: { vendorId, decision: "APPROVED" },
    });
    expect(review.status, JSON.stringify(review.env)).toBe(200);

    // KYC cleared → the client re-mints its token for the now-ACTIVE VENDOR role
    // (seller hub: "KYC pending" → dashboard)
    const sw = await call<{ accessToken: string }>("/api/v1/auth/switch-role", {
      token: custToken,
      body: { role: "VENDOR" },
    });
    expect(sw.status, JSON.stringify(sw.env)).toBe(200);
    const vendToken = sw.env.data.accessToken;

    // add product wizard → draft
    const category = await prisma.category.findFirstOrThrow({ where: { slug: "phones" } });
    const draft = await call<{ id: string; status: string }>("/api/v1/vendors/products", {
      token: vendToken,
      body: {
        title: "E2E Bench Phone",
        description: "A phone created by the Phase 2 e2e harness.",
        categoryId: category.id,
        priceMinor: 120000,
      },
    });
    expect(draft.status, JSON.stringify(draft.env)).toBe(200);
    expect(draft.env.data.status).toBe("DRAFT");
    const draftId = draft.env.data.id;

    // wizard step 2: media + stock
    const patch = await call(`/api/v1/vendors/products/${draftId}`, {
      method: "PATCH",
      token: vendToken,
      body: { images: ["e2e/bench-phone.jpg"], quantity: 7 },
    });
    expect(patch.status).toBe(200);

    // publish
    const pub = await call<{ status: string }>(`/api/v1/vendors/products/${draftId}/publish`, {
      method: "POST",
      token: vendToken,
    });
    expect(pub.status, JSON.stringify(pub.env)).toBe(200);
    expect(pub.env.data.status).toBe("PUBLISHED");

    // now visible in the public tenant listing
    const listing = await call<{ items: { id: string }[] }>("/api/v1/catalog/products?category=phones", {
      token: custToken,
    });
    expect(listing.env.data.items.map((p) => p.id)).toContain(draftId);

    // seller dashboard stats
    const stats = await call("/api/v1/vendors/stats", { token: vendToken });
    expect(stats.status).toBe(200);
    expect(stats.env.ok).toBe(true);

    void userId;
  });

  it("tenant isolation: tizzi-gas is gas-scoped and auction is 403", async () => {
    const gasList = await call<{ items: { slug: string }[] }>("/api/v1/catalog/products", { platform: "tizzi-gas" });
    expect(gasList.status).toBe(200);
    const slugs = gasList.env.data.items.map((p) => p.slug);
    expect(slugs).toContain("swiftgas-12kg-exchange");
    expect(slugs).not.toContain("orbit-a54-phone");
    expect(slugs).not.toContain("nimbus-14-laptop");

    // cross-tenant product read → 404
    const cross = await call("/api/v1/catalog/products/orbit-a54-phone", { platform: "tizzi-gas" });
    expect(cross.status).toBe(404);

    // gas bootstrap: auction gated off
    const boot = await call<{ features: Record<string, unknown> }>("/api/v1/config/bootstrap", { platform: "tizzi-gas" });
    expect(boot.env.data.features.auction).toBe(false);
    expect(boot.env.data.features["catalog.scope"]).toBe("gas");

    // the Phase 1 exit gate still holds
    const ping = await call("/api/v1/auctions/ping", { platform: "tizzi-gas" });
    expect([401, 403]).toContain(ping.status); // unauth here → 401; with a token → 403 FEATURE_DISABLED
  });
});
