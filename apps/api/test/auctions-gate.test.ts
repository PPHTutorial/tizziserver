import { afterAll, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { prisma, type Role } from "@stall/db";
import { auth as coreAuth } from "@stall/core";
import { GET } from "@/app/api/v1/auctions/ping/route";

const trash: string[] = [];

afterAll(async () => {
  for (const id of trash) {
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.auditLog.deleteMany({ where: { actorId: id } });
    await prisma.userRole.deleteMany({ where: { userId: id } });
    await prisma.tokenEpoch.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

async function makeUser(role: Role = "CUSTOMER") {
  const phone = `+1999${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 900 + 100)}`;
  const u = await prisma.user.create({
    data: {
      phone,
      status: "ACTIVE",
      roles: { create: { role, status: "ACTIVE", activatedAt: new Date() } },
      tokenEpoch: { create: {} },
    },
  });
  trash.push(u.id);
  return u;
}

/** Minimal stand-in for the bits of NextRequest that `withApi` touches. */
function fakeReq(platform: string, token?: string): NextRequest {
  const url = new URL("http://localhost/api/v1/auctions/ping");
  const headers = new Headers({ "x-platform": platform });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return { method: "GET", headers, nextUrl: url, json: async () => ({}) } as unknown as NextRequest;
}

describe("GET /api/v1/auctions/ping — capability gate", () => {
  it("200 under grandprice (auction enabled)", async () => {
    const u = await makeUser();
    const pair = await coreAuth.issueTokenPair({ userId: u.id, platform: "grandprice" });
    const res = await GET(fakeReq("grandprice", pair.accessToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.pong).toBe(true);
    expect(body.data.platform).toBe("grandprice");
  });

  it("403 FEATURE_DISABLED under tizzi-gas (auction gated off)", async () => {
    const u = await makeUser();
    const pair = await coreAuth.issueTokenPair({ userId: u.id, platform: "tizzi-gas" });
    const res = await GET(fakeReq("tizzi-gas", pair.accessToken));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FEATURE_DISABLED");
  });

  it("401 without a bearer token", async () => {
    const res = await GET(fakeReq("grandprice"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});
