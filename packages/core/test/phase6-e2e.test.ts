/**
 * Phase 6 device-parity end-to-end — chat, notifications, disputes, support.
 *
 *   E2E=1 API_URL=http://localhost:3000 \
 *     pnpm --filter @stall/core exec vitest run test/phase6-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { issueOtp } from "../src/auth/otp.ts";
import { dropUser } from "./helpers.ts";

const RUN = process.env.E2E === "1";
const BASE = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const VENDOR_PHONE = "+233200000001";
const STAFF_PHONE = "+233200000051";

type Env<T = any> = { ok: boolean; data: T; error: { code: string; message: string } | null };
const createdUsers: string[] = [];

async function call<T = any>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; env: Env<T> }> {
  const headers: Record<string, string> = { "x-platform": "grandprice", "x-device-id": "e2e-p6", "content-type": "application/json", ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, env: (await res.json()) as Env<T> };
}

async function signIn(phone: string, track = true) {
  const { code } = await issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN" });
  const { status, env } = await call<{ user: { id: string }; accessToken: string; activeRole: string }>("/api/v1/auth/verify", {
    body: { phone, code, device: { deviceId: "e2e-p6", platform: "ANDROID" } },
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

describe.skipIf(!RUN)("Phase 6 e2e — comms + trust over HTTP", () => {
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
      await prisma.order.deleteMany({ where: { customerId: id } }).catch(() => {});
      await prisma.dispute.deleteMany({ where: { openedById: id } }).catch(() => {});
      await prisma.conversationParticipant.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => {});
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

  it("order chat + notifications + a dispute resolved by staff", async () => {
    const cust = await signIn(`+19196${Date.now().toString().slice(-6)}`);
    await call("/api/v1/wallet/topup", { token: cust.token, body: { amountMinor: 400_000 }, headers: { "idempotency-key": `p6-top-${Date.now()}` } });

    const detail = await call<{ offers: { offerId?: string; id?: string }[] }>("/api/v1/catalog/products/orbit-a54-phone");
    const offerId = detail.env.data.offers[0]!.offerId ?? detail.env.data.offers[0]!.id!;
    await call("/api/v1/cart/items", { token: cust.token, body: { offerId, qty: 1 } });
    const placed = await call<{ id: string }>("/api/v1/checkout", {
      token: cust.token,
      body: { fulfilmentMethod: "PICKUP", payment: { method: "wallet" } },
      headers: { "idempotency-key": `p6-order-${Date.now()}` },
    });
    expect(placed.status, JSON.stringify(placed.env)).toBe(200);
    const orderId = placed.env.data.id;

    // chat with the seller
    const convo = await call<{ conversationId: string }>("/api/v1/conversations/for-order", { token: cust.token, body: { orderId } });
    expect(convo.status).toBe(200);
    await call(`/api/v1/conversations/${convo.env.data.conversationId}/messages`, { token: cust.token, body: { body: "Hi, when can I collect?" } });

    const vendor = await roleToken(VENDOR_PHONE, "VENDOR");
    const vConvos = await call<{ items: { id: string; unread: number }[] }>("/api/v1/conversations", { token: vendor.token });
    const thread = vConvos.env.data.items.find((x) => x.id === convo.env.data.conversationId)!;
    expect(thread.unread).toBeGreaterThanOrEqual(1);
    await call(`/api/v1/conversations/${thread.id}/messages`, { token: vendor.token, body: { body: "Any time before 6pm." } });

    // the vendor's reply produced a CHAT notification for the customer
    const notes = await call<{ items: { category: string }[] }>("/api/v1/notifications", { token: cust.token });
    expect(notes.env.data.items.some((n) => n.category === "CHAT")).toBe(true);

    // open a dispute, staff resolves with a small refund
    const dispute = await call<{ id: string; status: string }>("/api/v1/disputes", {
      token: cust.token,
      body: { kind: "ORDER", refId: orderId, category: "quality", body: "Item was faulty." },
    });
    expect(dispute.status, JSON.stringify(dispute.env)).toBe(200);

    const staff = await roleToken(STAFF_PHONE, "STAFF");
    const queue = await call<{ items: { id: string }[] }>("/api/v1/staff/disputes", { token: staff.token });
    expect(queue.env.data.items.some((d) => d.id === dispute.env.data.id)).toBe(true);
    const resolved = await call<{ status: string }>(`/api/v1/staff/disputes/${dispute.env.data.id}/resolve`, {
      token: staff.token,
      body: { outcome: "Refunded GHS 20 as goodwill", refundMinor: 2000 },
    });
    expect(resolved.status, JSON.stringify(resolved.env)).toBe(200);
    expect(resolved.env.data.status).toBe("RESOLVED");

    const mine = await call<{ items: { id: string; status: string; refundMinor: number | null }[] }>("/api/v1/disputes", { token: cust.token });
    const row = mine.env.data.items.find((d) => d.id === dispute.env.data.id)!;
    expect(row.status).toBe("RESOLVED");
    expect(row.refundMinor).toBe(2000);

    // support ticket opens a chat thread
    const ticket = await call<{ conversationId: string }>("/api/v1/support/tickets", {
      token: cust.token,
      body: { category: "Orders", subject: "Refund question", body: "When does the refund land?" },
    });
    expect(ticket.status, JSON.stringify(ticket.env)).toBe(200);
    const tMsgs = await call<{ items: { body: string | null }[] }>(`/api/v1/conversations/${ticket.env.data.conversationId}/messages`, { token: cust.token });
    expect(tMsgs.env.data.items.some((m) => (m.body ?? "").includes("Refund question"))).toBe(true);
  });
});
