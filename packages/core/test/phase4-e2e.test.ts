/**
 * Phase 4 device-parity end-to-end — dispatch → track → verify → complete.
 *
 * Fires the HTTP sequence the Flutter delivery/courier screens make against a
 * running `apps/api`. Proves: an order becomes a Delivery on READY_FOR_PICKUP,
 * the seeded courier is offered + accepts, the customer can read the live track,
 * pickup/dropoff OTP verification, COMPLETED, and a courier earning posted.
 *
 *   E2E=1 API_URL=http://localhost:3000 \
 *     pnpm --filter @stall/core exec vitest run test/phase4-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { issueOtp } from "../src/auth/otp.ts";
import { dropUser } from "./helpers.ts";

const RUN = process.env.E2E === "1";
const BASE = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const COURIER_PHONE = "+233200000010"; // seeded grandprice courier
const VENDOR_PHONE = "+233200000001"; // Accra Electronics Hub

type Env<T = any> = { ok: boolean; data: T; error: { code: string; message: string } | null };
const createdUsers: string[] = [];
const createdDeliveries: string[] = [];

async function call<T = any>(
  path: string,
  opts: { method?: string; platform?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; env: Env<T> }> {
  const headers: Record<string, string> = {
    "x-platform": opts.platform ?? "grandprice",
    "x-device-id": "e2e-p4",
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

async function signIn(phone: string, track = true) {
  const { code } = await issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN" });
  const { status, env } = await call<{ user: { id: string }; accessToken: string; activeRole: string }>("/api/v1/auth/verify", {
    body: { phone, code, device: { deviceId: "e2e-p4", platform: "ANDROID" } },
  });
  expect(status, JSON.stringify(env)).toBe(200);
  if (track) createdUsers.push(env.data.user.id);
  return { userId: env.data.user.id, token: env.data.accessToken, activeRole: env.data.activeRole };
}

async function roleToken(phone: string, role: string) {
  const s = await signIn(phone, false);
  if (s.activeRole === role) return s.token;
  const sw = await call<{ accessToken: string }>("/api/v1/auth/switch-role", { token: s.token, body: { role } });
  expect(sw.status, JSON.stringify(sw.env)).toBe(200);
  return sw.env.data.accessToken;
}

describe.skipIf(!RUN)("Phase 4 e2e — delivery over HTTP", () => {
  beforeAll(async () => {
    const boot = await fetch(`${BASE}/api/v1/config/bootstrap`, { headers: { "x-platform": "grandprice" } }).catch(() => null);
    if (!boot || !boot.ok) throw new Error(`API not reachable at ${BASE}`);
    // keep the seeded courier fresh in the DB dispatch projection
    const c = await prisma.courierProfile.findFirstOrThrow({ where: { user: { phone: COURIER_PHONE } } });
    await prisma.$executeRawUnsafe(
      `UPDATE "courier_profiles" SET "lastLocation"=ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, "lastLocationAt"=now(), "onlineStatus"='ONLINE' WHERE "id"=$3`,
      -0.19,
      5.606,
      c.id,
    );
  });

  afterAll(async () => {
    for (const id of createdDeliveries) await prisma.delivery.deleteMany({ where: { id } }).catch(() => {});
    for (const id of createdUsers) {
      await prisma.order.deleteMany({ where: { customerId: id } }).catch(() => {});
      const w = await prisma.wallet.findUnique({ where: { userId: id } });
      if (w) {
        await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
        await prisma.wallet.delete({ where: { userId: id } }).catch(() => {});
      }
      await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: id } });
      await dropUser(id).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("order → ready-for-pickup → dispatch → courier runs it → COMPLETED", async () => {
    const cust = await signIn(`+19198${Date.now().toString().slice(-6)}`);
    // fund wallet
    await call("/api/v1/wallet/topup", { token: cust.token, body: { amountMinor: 500_000 }, headers: { "idempotency-key": `p4-top-${Date.now()}` } });

    // build a single-vendor delivery order
    const detail = await call<{ offers: { offerId?: string; id?: string }[] }>("/api/v1/catalog/products/orbit-a54-phone");
    const offerId = detail.env.data.offers[0]!.offerId ?? detail.env.data.offers[0]!.id!;
    await call("/api/v1/cart/items", { token: cust.token, body: { offerId, qty: 1 } });
    const addr = await call<{ id: string }>("/api/v1/me/addresses", {
      token: cust.token,
      body: { recipientName: "E2E Buyer", phone: "+233200000777", line1: "12 Liberation Rd", city: "Accra", country: "GH" },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "addresses" SET "location"=ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE "id"=$3`,
      -0.17,
      5.62,
      addr.env.data.id,
    );
    const placed = await call<{ id: string; vendorOrders: { id: string; vendorId: string }[] }>("/api/v1/checkout", {
      token: cust.token,
      body: { fulfilmentMethod: "DELIVERY", addressId: addr.env.data.id, payment: { method: "wallet" } },
      headers: { "idempotency-key": `p4-order-${Date.now()}` },
    });
    expect(placed.status, JSON.stringify(placed.env)).toBe(200);
    const vo = placed.env.data.vendorOrders[0]!;

    // vendor: accept → preparing → ready (spawns the delivery)
    const vToken = await roleToken(VENDOR_PHONE, "VENDOR");
    for (const s of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"]) {
      const r = await call<{ deliveryId?: string }>(`/api/v1/vendors/orders/${vo.id}`, { method: "PATCH", token: vToken, body: { status: s } });
      expect(r.status, JSON.stringify(r.env)).toBe(200);
      if (s === "READY_FOR_PICKUP") {
        expect(r.env.data.deliveryId).toBeTruthy();
        createdDeliveries.push(r.env.data.deliveryId!);
      }
    }

    const deliveryId = createdDeliveries[createdDeliveries.length - 1]!;

    // customer can read the track
    const track = await call(`/api/v1/deliveries/${deliveryId}/track`, { token: cust.token });
    expect(track.status, JSON.stringify(track.env)).toBe(200);

    // courier: find the offer, accept, run the state machine
    const cToken = await roleToken(COURIER_PHONE, "COURIER");
    const jobs = await call<{ items: { offerId: string; deliveryId: string }[] }>("/api/v1/courier/jobs", { token: cToken });
    expect(jobs.status, JSON.stringify(jobs.env)).toBe(200);
    const offer = jobs.env.data.items.find((j) => j.deliveryId === deliveryId);
    expect(offer, "courier offered the job").toBeTruthy();

    const acc = await call(`/api/v1/courier/offers/${offer!.offerId}/respond`, { token: cToken, body: { response: "ACCEPTED" } });
    expect(acc.status, JSON.stringify(acc.env)).toBe(200);

    // codes: vendor sees pickup, customer sees dropoff
    const vendorView = await call<{ pickupCode: string }>(`/api/v1/vendors/deliveries/${deliveryId}`, { token: vToken });
    const custView = await call<{ dropoffCode: string }>(`/api/v1/deliveries/${deliveryId}`, { token: cust.token });
    expect(vendorView.env.data.pickupCode).toMatch(/^\d{4}$/);
    expect(custView.env.data.dropoffCode).toMatch(/^\d{4}$/);

    const adv = (to: string, body: Record<string, unknown> = {}) =>
      call(`/api/v1/courier/deliveries/${deliveryId}/advance`, { token: cToken, body: { to, ...body } });

    await adv("COURIER_EN_ROUTE_PICKUP", { lat: 5.606, lng: -0.19 });
    await adv("ARRIVED_PICKUP");
    await call(`/api/v1/courier/deliveries/${deliveryId}/verify-pickup`, { token: cToken, body: { code: vendorView.env.data.pickupCode } });
    await adv("PICKED_UP");
    await adv("EN_ROUTE_DROPOFF");
    await call(`/api/v1/courier/deliveries/${deliveryId}/breadcrumb`, { token: cToken, body: { lat: 5.61, lng: -0.18 } });
    await adv("ARRIVED_DROPOFF");
    await call(`/api/v1/courier/deliveries/${deliveryId}/verify-dropoff`, { token: cToken, body: { code: custView.env.data.dropoffCode } });
    await adv("DELIVERED");
    await call(`/api/v1/courier/deliveries/${deliveryId}/pod`, { token: cToken, body: { photoKeys: ["pod/e2e.jpg"] } });
    const done = await call<{ status: string }>(`/api/v1/courier/deliveries/${deliveryId}/advance`, { token: cToken, body: { to: "COMPLETED" } });
    expect(done.status, JSON.stringify(done.env)).toBe(200);
    expect(done.env.data.status).toBe("COMPLETED");

    // courier earnings reflect the delivery
    const earn = await call<{ balanceMinor: number; deliveries: number }>("/api/v1/courier/earnings", { token: cToken });
    expect(earn.env.data.balanceMinor).toBeGreaterThan(0);

    // both parties rate
    const r1 = await call(`/api/v1/deliveries/${deliveryId}/rate`, { token: cust.token, body: { stars: 5 } });
    const r2 = await call(`/api/v1/courier/deliveries/${deliveryId}/rate`, { token: cToken, body: { stars: 5 } });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});
