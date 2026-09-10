/**
 * Phase 5 device-parity end-to-end — auctions over HTTP (GrandPrice only).
 *
 * STAFF creates a draw → customers buy seats → STAFF commits + runs the draw →
 * exactly one winner → the winner claims, passes KYC, is approved, and buys at
 * winTarget. Also asserts the `auction` capability gate: every call 403s under
 * `tizzi-gas`.
 *
 *   E2E=1 API_URL=http://localhost:3000 \
 *     pnpm --filter @stall/core exec vitest run test/phase5-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { issueOtp } from "../src/auth/otp.ts";
import { dropUser } from "./helpers.ts";

const RUN = process.env.E2E === "1";
const BASE = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STAFF_PHONE = "+233200000050";

type Env<T = any> = { ok: boolean; data: T; error: { code: string; message: string } | null };
const createdUsers: string[] = [];
let auctionSlug = "";

async function call<T = any>(
  path: string,
  opts: { method?: string; platform?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; env: Env<T> }> {
  const headers: Record<string, string> = {
    "x-platform": opts.platform ?? "grandprice",
    "x-device-id": "e2e-p5",
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, env: (await res.json()) as Env<T> };
}

async function signIn(phone: string, track = true) {
  const { code } = await issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN" });
  const { status, env } = await call<{ user: { id: string }; accessToken: string; activeRole: string }>("/api/v1/auth/verify", {
    body: { phone, code, device: { deviceId: "e2e-p5", platform: "ANDROID" } },
  });
  expect(status, JSON.stringify(env)).toBe(200);
  if (track) createdUsers.push(env.data.user.id);
  return { userId: env.data.user.id, token: env.data.accessToken, activeRole: env.data.activeRole };
}

async function staffToken() {
  const u = await prisma.user.upsert({
    where: { phone: STAFF_PHONE },
    create: { phone: STAFF_PHONE, status: "ACTIVE", roles: { create: [{ role: "STAFF", status: "ACTIVE", activatedAt: new Date() }, { role: "CUSTOMER", status: "ACTIVE", activatedAt: new Date() }] }, tokenEpoch: { create: {} } },
    update: {},
  });
  await prisma.userRole.upsert({ where: { userId_role: { userId: u.id, role: "STAFF" } }, create: { userId: u.id, role: "STAFF", status: "ACTIVE", activatedAt: new Date() }, update: { status: "ACTIVE" } });
  const s = await signIn(STAFF_PHONE, false);
  if (s.activeRole === "STAFF") return s.token;
  const sw = await call<{ accessToken: string }>("/api/v1/auth/switch-role", { token: s.token, body: { role: "STAFF" } });
  expect(sw.status, JSON.stringify(sw.env)).toBe(200);
  return sw.env.data.accessToken;
}

describe.skipIf(!RUN)("Phase 5 e2e — Inverse Draws over HTTP", () => {
  beforeAll(async () => {
    const boot = await fetch(`${BASE}/api/v1/config/bootstrap`, { headers: { "x-platform": "grandprice" } }).catch(() => null);
    if (!boot || !boot.ok) throw new Error(`API not reachable at ${BASE}`);
  });

  afterAll(async () => {
    if (auctionSlug) {
      const a = await prisma.auction.findUnique({ where: { slug: auctionSlug } });
      if (a) {
        await prisma.auction.delete({ where: { id: a.id } }).catch(() => {});
        await prisma.ledgerAccount.deleteMany({ where: { ownerType: "ESCROW", ownerId: `auction:${a.id}` } }).catch(() => {});
      }
    }
    for (const id of createdUsers) {
      const w = await prisma.wallet.findUnique({ where: { userId: id } });
      if (w) {
        await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
        await prisma.wallet.delete({ where: { userId: id } }).catch(() => {});
      }
      await prisma.paymentIntent.deleteMany({ where: { userId: id } });
      await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: id } });
      await dropUser(id).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("create → buy seats → commit → run → winner claims + buys at winTarget", async () => {
    const staff = await staffToken();
    const created = await call<{ slug: string }>("/api/v1/auctions/admin", {
      token: staff,
      body: {
        title: `E2E Draw ${Date.now()}`,
        retailValueMinor: 1_000_000,
        ticketPriceMinor: 10_000,
        winTargetMinor: 150_000,
        seatsTotal: 50,
        minSeatsToDraw: 3,
        drawTrigger: "EITHER",
        nonWinnerPolicy: "REFUND",
        asset: { title: "E2E Prize" },
        packages: [{ name: "Single", ticketCount: 1, priceMinor: 10_000 }],
      },
    });
    expect(created.status, JSON.stringify(created.env)).toBe(200);
    auctionSlug = created.env.data.slug;

    await call(`/api/v1/auctions/${auctionSlug}/status`, { token: staff, body: { status: "ANNOUNCED" } });
    await call(`/api/v1/auctions/${auctionSlug}/status`, { token: staff, body: { status: "OPEN" } });

    // three shoppers each fund a wallet + buy seats
    const buyers = [];
    for (let i = 0; i < 3; i++) {
      const b = await signIn(`+19197${Date.now().toString().slice(-6)}${i}`);
      await call("/api/v1/wallet/topup", { token: b.token, body: { amountMinor: 500_000 }, headers: { "idempotency-key": `p5-top-${Date.now()}-${i}` } });
      const r = await call(`/api/v1/auctions/${auctionSlug}/tickets`, {
        token: b.token,
        body: { count: i + 2, payment: { method: "wallet" } },
        headers: { "idempotency-key": `p5-seats-${Date.now()}-${i}` },
      });
      expect(r.status, JSON.stringify(r.env)).toBe(200);
      buyers.push(b);
    }

    // capability gate: tizzi-gas can't even list
    const gasList = await call("/api/v1/auctions", { platform: "tizzi-gas" });
    expect(gasList.status).toBe(403);

    // run the draw
    const commit = await call(`/api/v1/auctions/${auctionSlug}/draw/commit`, { token: staff });
    expect(commit.status, JSON.stringify(commit.env)).toBe(200);
    const run = await call<{ status: string; winnerUserId: string }>(`/api/v1/auctions/${auctionSlug}/draw/run`, { token: staff });
    expect(run.status, JSON.stringify(run.env)).toBe(200);
    expect(run.env.data.status).toBe("COMPLETED");

    const winner = buyers.find((b) => b.userId === run.env.data.winnerUserId)!;
    expect(winner, "winner is one of the buyers").toBeTruthy();

    // winner claim → kyc → staff approve → win purchase
    const my = await call<{ isWinner: boolean }>(`/api/v1/auctions/${auctionSlug}/me/win`, { token: winner.token });
    expect(my.env.data.isWinner).toBe(true);
    const claim = await call<{ claimId: string }>(`/api/v1/auctions/${auctionSlug}/claim`, { token: winner.token });
    await call(`/api/v1/auctions/claims/${claim.env.data.claimId}/kyc`, { token: winner.token, body: { documents: [{ type: "ID_FRONT", fileKey: "k/1.jpg" }, { type: "SELFIE", fileKey: "k/2.jpg" }] } });
    const review = await call(`/api/v1/auctions/claims/${claim.env.data.claimId}/review`, { token: staff, body: { decision: "APPROVE" } });
    expect(review.status, JSON.stringify(review.env)).toBe(200);
    const buy = await call<{ status: string }>(`/api/v1/auctions/${auctionSlug}/win-purchase`, {
      token: winner.token,
      body: { payment: { method: "wallet" } },
      headers: { "idempotency-key": `p5-winbuy-${Date.now()}` },
    });
    expect(buy.status, JSON.stringify(buy.env)).toBe(200);
    expect(buy.env.data.status).toBe("PAID");

    // a non-winner was refunded to wallet
    const loser = buyers.find((b) => b.userId !== winner.userId)!;
    const feed = await call<{ items: { description: string }[] }>("/api/v1/wallet/transactions", { token: loser.token });
    expect(feed.env.data.items.some((t) => /Refund/i.test(t.description))).toBe(true);
  });
});
