import { prisma, type Role } from "@stall/db";
import { env } from "@stall/config";
import { randomToken, sha256Hex } from "../crypto.ts";
import { signAccessToken } from "../jwt.ts";
import { AppError } from "../errors.ts";
import { activeRolesFor } from "./identity.ts";

const refreshExpiry = () => new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  activeRole: Role;
  roles: Role[];
  refreshExpiresAt: Date;
}

async function currentEpoch(userId: string): Promise<number> {
  const te = await prisma.tokenEpoch.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return te.ver;
}

async function mintAccess(opts: {
  userId: string;
  sessionId: string;
  activeRole: Role;
  roles: Role[];
  platform: string;
  deviceId?: string | null;
}): Promise<string> {
  return signAccessToken({
    sub: opts.userId,
    sid: opts.sessionId,
    activeRole: opts.activeRole,
    roles: opts.roles,
    platform: opts.platform,
    deviceId: opts.deviceId ?? undefined,
    ver: await currentEpoch(opts.userId),
  });
}

export interface IssueInput {
  userId: string;
  platform: string;
  deviceId?: string;
  userAgent?: string;
  ip?: string;
  activeRole?: Role;
}

/** Start a fresh session (new refresh-token family) and mint the first token pair. */
export async function issueTokenPair(input: IssueInput): Promise<TokenPair> {
  const roles = await activeRolesFor(input.userId);
  if (roles.length === 0) throw new AppError("ROLE_NOT_ACTIVE", "No active role for this user");
  const activeRole = input.activeRole && roles.includes(input.activeRole) ? input.activeRole : roles[0]!;

  const refreshToken = randomToken();
  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      deviceId: input.deviceId,
      refreshHash: sha256Hex(refreshToken),
      familyId: randomToken(18),
      activeRole,
      platformSlug: input.platform,
      userAgent: input.userAgent,
      ip: input.ip,
      expiresAt: refreshExpiry(),
    },
  });

  const accessToken = await mintAccess({
    userId: input.userId,
    sessionId: session.id,
    activeRole,
    roles,
    platform: input.platform,
    deviceId: input.deviceId,
  });

  return { accessToken, refreshToken, sessionId: session.id, activeRole, roles, refreshExpiresAt: session.expiresAt };
}

/** Rotate a refresh token. Detects reuse of an already-rotated token → revokes the family. */
export async function rotateTokenPair(input: {
  refreshToken: string;
  platform: string;
  userAgent?: string;
  ip?: string;
}): Promise<TokenPair> {
  const session = await prisma.session.findUnique({ where: { refreshHash: sha256Hex(input.refreshToken) } });
  if (!session) throw new AppError("INVALID_TOKEN", "Unknown refresh token");

  if (session.revokedAt) {
    // A revoked session's refresh token is being replayed → assume theft.
    await revokeFamily(session.familyId, "reuse-detected");
    throw new AppError("REFRESH_REUSE_DETECTED", "Refresh token reuse detected — all sessions in this family revoked");
  }
  if (session.expiresAt.getTime() < Date.now()) throw new AppError("TOKEN_EXPIRED", "Refresh token expired");

  const roles = await activeRolesFor(session.userId);
  if (roles.length === 0) throw new AppError("ROLE_NOT_ACTIVE", "No active role for this user");
  const activeRole = roles.includes(session.activeRole) ? session.activeRole : roles[0]!;

  const refreshToken = randomToken();
  const next = await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: "rotated" },
    });
    return tx.session.create({
      data: {
        userId: session.userId,
        deviceId: session.deviceId,
        refreshHash: sha256Hex(refreshToken),
        familyId: session.familyId,
        rotatedFromId: session.id,
        activeRole,
        platformSlug: input.platform,
        userAgent: input.userAgent ?? session.userAgent,
        ip: input.ip ?? session.ip,
        expiresAt: refreshExpiry(),
      },
    });
  });

  const accessToken = await mintAccess({
    userId: session.userId,
    sessionId: next.id,
    activeRole,
    roles,
    platform: input.platform,
    deviceId: session.deviceId,
  });

  return { accessToken, refreshToken, sessionId: next.id, activeRole, roles, refreshExpiresAt: next.expiresAt };
}

/** Mint a new access token for a different active role. Refresh token is unchanged. */
export async function switchRole(input: {
  userId: string;
  sessionId: string;
  toRole: Role;
  platform: string;
}): Promise<{ accessToken: string; activeRole: Role; roles: Role[] }> {
  const roles = await activeRolesFor(input.userId);
  if (!roles.includes(input.toRole)) throw new AppError("ROLE_NOT_ACTIVE", `Role ${input.toRole} is not active for this user`);

  const session = await prisma.session.findFirst({
    where: { id: input.sessionId, userId: input.userId, revokedAt: null },
  });
  if (!session) throw new AppError("SESSION_REVOKED", "Session no longer valid");

  await prisma.session.update({ where: { id: session.id }, data: { activeRole: input.toRole, lastUsedAt: new Date() } });

  const accessToken = await mintAccess({
    userId: input.userId,
    sessionId: session.id,
    activeRole: input.toRole,
    roles,
    platform: input.platform,
    deviceId: session.deviceId,
  });
  return { accessToken, activeRole: input.toRole, roles };
}

export async function revokeSession(sessionId: string, reason = "logout"): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

export async function revokeFamily(familyId: string, reason: string): Promise<void> {
  await prisma.session.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

/** Revoke every session for a user AND bump the token epoch (kills outstanding access tokens). */
export async function revokeAllForUser(userId: string, reason = "logout-all"): Promise<void> {
  await prisma.$transaction([
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    }),
    prisma.tokenEpoch.update({ where: { userId }, data: { ver: { increment: 1 } } }),
  ]);
}

export async function listSessions(userId: string, currentSessionId?: string) {
  const rows = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      deviceId: true,
      platformSlug: true,
      activeRole: true,
      userAgent: true,
      ip: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
}
