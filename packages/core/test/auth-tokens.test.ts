import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import {
  issueTokenPair,
  rotateTokenPair,
  revokeAllForUser,
  verifyAccessToken,
} from "../src/auth/index.ts";
import { dropUser, makeUser } from "./helpers.ts";

const trash: string[] = [];

afterAll(async () => {
  for (const id of trash) await dropUser(id);
  await prisma.$disconnect();
});

describe("refresh-token rotation", () => {
  it("rotates the family: a new refresh token each hop, access token verifies", async () => {
    const u = await makeUser();
    trash.push(u.id);

    const p1 = await issueTokenPair({ userId: u.id, platform: "grandprice" });
    const p2 = await rotateTokenPair({ refreshToken: p1.refreshToken, platform: "grandprice" });
    const p3 = await rotateTokenPair({ refreshToken: p2.refreshToken, platform: "grandprice" });

    expect(new Set([p1.refreshToken, p2.refreshToken, p3.refreshToken]).size).toBe(3);
    const claims = await verifyAccessToken(p3.accessToken);
    expect(claims.sub).toBe(u.id);
    expect(claims.sid).toBe(p3.sessionId);

    // every hop stays in one family
    const sessions = await prisma.session.findMany({ where: { userId: u.id } });
    expect(new Set(sessions.map((s) => s.familyId)).size).toBe(1);
    // only the newest session is live
    expect(sessions.filter((s) => s.revokedAt === null)).toHaveLength(1);
  });
});

describe("refresh-token reuse detection", () => {
  it("replaying a rotated token revokes the whole family", async () => {
    const u = await makeUser();
    trash.push(u.id);

    const p1 = await issueTokenPair({ userId: u.id, platform: "grandprice" });
    const p2 = await rotateTokenPair({ refreshToken: p1.refreshToken, platform: "grandprice" });

    // p1 was already rotated → replay is treated as theft
    await expect(
      rotateTokenPair({ refreshToken: p1.refreshToken, platform: "grandprice" }),
    ).rejects.toMatchObject({ code: "REFRESH_REUSE_DETECTED" });

    // the family is now dead — the previously-good p2 no longer rotates
    await expect(
      rotateTokenPair({ refreshToken: p2.refreshToken, platform: "grandprice" }),
    ).rejects.toMatchObject({ code: "REFRESH_REUSE_DETECTED" });

    const live = await prisma.session.findMany({ where: { userId: u.id, revokedAt: null } });
    expect(live).toHaveLength(0);
  });
});

describe("token-epoch bump (log out everywhere)", () => {
  it("revokeAllForUser increments the epoch and kills every session", async () => {
    const u = await makeUser();
    trash.push(u.id);

    const pair = await issueTokenPair({ userId: u.id, platform: "grandprice" });
    const minted = await verifyAccessToken(pair.accessToken);
    const before = await prisma.tokenEpoch.findUniqueOrThrow({ where: { userId: u.id } });

    await revokeAllForUser(u.id);

    const after = await prisma.tokenEpoch.findUniqueOrThrow({ where: { userId: u.id } });
    expect(after.ver).toBe(before.ver + 1);
    // the outstanding access token carries the stale epoch → getContext rejects it
    expect(minted.ver).toBe(before.ver);
    expect(minted.ver).not.toBe(after.ver);

    const live = await prisma.session.findMany({ where: { userId: u.id, revokedAt: null } });
    expect(live).toHaveLength(0);
  });
});
