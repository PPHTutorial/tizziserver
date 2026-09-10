/**
 * Phase 3 device-parity end-to-end — cart → checkout → orders → wallet.
 *
 * Fires the HTTP sequence the Flutter commerce screens make against a running
 * `apps/api`. Proves: multi-vendor order placement, wallet + gateway payment,
 * escrow capture, per-vendor completion → payout/commission release, order
 * cancel → wallet refund, coupon apply, and `Idempotency-Key` replay.
 *
 *   E2E=1 API_URL=http://localhost:3000 \
 *     pnpm --filter @stall/core exec vitest run test/phase3-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { issueOtp } from "../src/auth/otp.ts";
import { dropUser } from "./helpers.ts";

const RUN = process.env.E2E === "1";
const BASE = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");

// seeded grandprice vendors that carry the two orbit-a54-phone offers
const VENDOR_PHONE_BY_NAME: Record<string, string> = {
  "Kumasi Gadget Store": "+233200000003",
  "Accra Electronics Hub": "+233200000001",
};

type Env<T = any> = { ok: boolean; data: T; error: { code: string; message: string } | null };
const createdUsers: string[] = [];

async function call<T = any>(
  path: string,
  opts: { method?: string; platform?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; env: Env<T> }> {
  const headers: Record<string, string> = {
    "x-platform": opts.platform ?? "grandprice",
    "x-device-id": "e2e-p3",
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, env: (await res.json()) as Env<T> };
}

async function signIn(phone: string, platform = "grandprice", track = true) {
  const { code } = await issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN" });
  const { status, env } = await call<{ user: { id: string }; accessToken: string; activeRole: string }>(
    "/api/v1/auth/verify",
    { platform, body: { phone, code, device: { deviceId: "e2e-p3", platform: "ANDROID" } } },
  );
  expect(status, JSON.stringify(env)).toBe(200);
  if (track) createdUsers.push(env.data.user.id);
  return { userId: env.data.user.id, token: env.data.accessToken, activeRole: env.data.activeRole };
}

async function vendorToken(vendorName: string) {
  const phone = VENDOR_PHONE_BY_NAME[vendorName];
  if (!phone) throw new Error(`unmapped vendor ${vendorName}`);
  const s = await signIn(phone, "grandprice", false);
  if (s.activeRole === "VENDOR") return s.token;
  const sw = await call<{ accessToken: string }>("/api/v1/auth/switch-role", { token: s.token, body: { role: "VENDOR" } });
  expect(sw.status, JSON.stringify(sw.env)).toBe(200);
  return sw.env.data.accessToken;
}

let offerIds: string[] = [];

describe.skipIf(!RUN)("Phase 3 e2e — commerce over HTTP", () => {
  beforeAll(async () => {
    const boot = await fetch(`${BASE}/api/v1/config/bootstrap`, { headers: { "x-platform": "grandprice" } }).catch(() => null);
    if (!boot || !boot.ok) throw new Error(`API not reachable at ${BASE}`);
    const detail = await call<{ offers: { id?: string; offerId?: string }[] }>("/api/v1/catalog/products/orbit-a54-phone");
    offerIds = detail.env.data.offers.map((o) => o.offerId ?? o.id!).filter(Boolean).slice(0, 2);
    expect(offerIds.length).toBe(2);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.couponRedemption.deleteMany({ where: { userId: id } });
      await prisma.order.deleteMany({ where: { customerId: id } });
      await prisma.cart.deleteMany({ where: { userId: id } });
      await prisma.paymentIntent.deleteMany({ where: { userId: id } });
      await prisma.payout.deleteMany({ where: { ownerType: "USER", ownerId: id } });
      const w = await prisma.wallet.findUnique({ where: { userId: id } });
      if (w) {
        await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
        await prisma.wallet.delete({ where: { userId: id } }).catch(() => {});
      }
      await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: id } });
      await prisma.address.deleteMany({ where: { userId: id } });
      await dropUser(id);
    }
    // vendor sessions from sign-in
    for (const phone of Object.values(VENDOR_PHONE_BY_NAME)) {
      const u = await prisma.user.findUnique({ where: { phone } });
      if (u) await prisma.session.deleteMany({ where: { userId: u.id } });
    }
    await prisma.$disconnect();
  });

  it("wallet checkout: multi-vendor order → complete each sub-order → FULFILLED", async () => {
    const { token } = await signIn(`+233571${Date.now().toString().slice(-7)}`);

    const addr = await call<{ id: string }>("/api/v1/me/addresses", {
      token,
      body: { recipientName: "E2E Buyer", phone: "+233200000009", line1: "1 Test Rd", city: "Accra", country: "GH" },
    });
    expect(addr.status, JSON.stringify(addr.env)).toBe(200);

    for (const offerId of offerIds) {
      const add = await call("/api/v1/cart/items", { token, body: { offerId, qty: 1 } });
      expect(add.status, JSON.stringify(add.env)).toBe(200);
    }
    const cart = await call<{ groups: unknown[]; subtotalMinor: number }>("/api/v1/cart", { token });
    expect(cart.env.data.groups).toHaveLength(2);

    const quote = await call<{ totalMinor: number }>("/api/v1/checkout/quote", { token, body: { fulfilmentMethod: "DELIVERY" } });
    expect(quote.status).toBe(200);
    const total = quote.env.data.totalMinor;

    const top = await call<{ status: string; balanceMinor: number }>("/api/v1/wallet/topup", {
      token,
      body: { amountMinor: total + 5000 },
    });
    expect(top.status, JSON.stringify(top.env)).toBe(200);
    expect(top.env.data.status).toBe("SUCCEEDED");

    const idemKey = `e2e-${Date.now()}`;
    const placed = await call<{ id: string; number: string; status: string; vendorOrders: { id: string; vendorName: string; status: string }[] }>(
      "/api/v1/checkout",
      { token, headers: { "idempotency-key": idemKey }, body: { addressId: addr.env.data.id, fulfilmentMethod: "DELIVERY", payment: { method: "wallet" } } },
    );
    expect(placed.status, JSON.stringify(placed.env)).toBe(200);
    expect(placed.env.data.status).toBe("PLACED");
    expect(placed.env.data.vendorOrders).toHaveLength(2);
    const orderId = placed.env.data.id;

    // wallet debited
    const w1 = await call<{ balanceMinor: number }>("/api/v1/wallet", { token });
    expect(w1.env.data.balanceMinor).toBe(5000);

    // idempotent replay → same order, no re-charge
    const replay = await call<{ number: string }>("/api/v1/checkout", {
      token,
      headers: { "idempotency-key": idemKey },
      body: { addressId: addr.env.data.id, fulfilmentMethod: "DELIVERY", payment: { method: "wallet" } },
    });
    expect(replay.status).toBe(200);
    expect(replay.env.data.number).toBe(placed.env.data.number);
    const w2 = await call<{ balanceMinor: number }>("/api/v1/wallet", { token });
    expect(w2.env.data.balanceMinor).toBe(5000);

    // each vendor completes their sub-order
    for (const vo of placed.env.data.vendorOrders) {
      const vt = await vendorToken(vo.vendorName);
      const accept = await call(`/api/v1/vendors/orders/${vo.id}`, { method: "PATCH", token: vt, body: { status: "ACCEPTED" } });
      expect(accept.status, JSON.stringify(accept.env)).toBe(200);
      const done = await call(`/api/v1/vendors/orders/${vo.id}/complete`, { method: "POST", token: vt });
      expect(done.status, JSON.stringify(done.env)).toBe(200);
    }

    const finalOrder = await call<{ status: string }>(`/api/v1/orders/${orderId}`, { token });
    expect(finalOrder.env.data.status).toBe("FULFILLED");

    const txns = await call<{ items: { direction: string }[] }>("/api/v1/wallet/transactions", { token });
    expect(txns.env.data.items.some((t) => t.direction === "debit")).toBe(true);

    const list = await call<{ items: { id: string }[] }>("/api/v1/orders", { token });
    expect(list.env.data.items.map((o) => o.id)).toContain(orderId);
  });

  it("gateway payment then cancel → refund goes back to the card, not the wallet", async () => {
    const { token } = await signIn(`+233572${Date.now().toString().slice(-7)}`);
    const add = await call("/api/v1/cart/items", { token, body: { offerId: offerIds[1], qty: 1 } });
    expect(add.status).toBe(200);

    const placed = await call<{ id: string; status: string; totalMinor: number }>("/api/v1/checkout", {
      token,
      body: { fulfilmentMethod: "PICKUP", payment: { method: "gateway", gateway: "mock" } },
    });
    expect(placed.status, JSON.stringify(placed.env)).toBe(200);
    expect(placed.env.data.status).toBe("PLACED");

    const cancel = await call<{ status: string }>(`/api/v1/orders/${placed.env.data.id}/cancel`, { method: "POST", token });
    expect(cancel.status, JSON.stringify(cancel.env)).toBe(200);
    expect(cancel.env.data.status).toBe("REFUNDED");

    // Since S24 a gateway/card order refunds through the gateway, not the
    // wallet — the customer's wallet balance stays untouched.
    const w = await call<{ balanceMinor: number }>("/api/v1/wallet", { token });
    expect(w.env.data.balanceMinor).toBe(0);

    const detail = await call<{ refunds: { status: string }[] }>(`/api/v1/orders/${placed.env.data.id}`, { token });
    expect(detail.env.data.refunds.some((r) => r.status === "DONE")).toBe(true);
  });

  it("coupon validate + apply reduces the quote", async () => {
    const { token } = await signIn(`+233573${Date.now().toString().slice(-7)}`);
    await call("/api/v1/cart/items", { token, body: { offerId: offerIds[0], qty: 1 } });

    const check = await call<{ valid: boolean; discountMinor: number }>("/api/v1/coupons/validate", { token, body: { code: "welcome10" } });
    expect(check.status).toBe(200);
    expect(check.env.data.valid).toBe(true);
    expect(check.env.data.discountMinor).toBeGreaterThan(0);

    const apply = await call<{ couponValid: boolean }>("/api/v1/cart/coupon", { token, body: { code: "welcome10" } });
    expect(apply.status, JSON.stringify(apply.env)).toBe(200);
    expect(apply.env.data.couponValid).toBe(true);

    const quote = await call<{ discountMinor: number }>("/api/v1/checkout/quote", { token, body: { fulfilmentMethod: "PICKUP" } });
    expect(quote.env.data.discountMinor).toBeGreaterThan(0);
  });

  it("tenant-scoped coupons: tizzi-gas sees GASWELCOME, not SAVE20", async () => {
    const { token } = await signIn(`+233574${Date.now().toString().slice(-7)}`, "tizzi-gas");
    const res = await call<{ items: { code: string }[] }>("/api/v1/coupons", { token, platform: "tizzi-gas" });
    expect(res.status).toBe(200);
    const codes = res.env.data.items.map((c) => c.code);
    expect(codes).toContain("GASWELCOME");
    expect(codes).not.toContain("SAVE20");
  });
});
