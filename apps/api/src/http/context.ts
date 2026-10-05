import type { NextRequest } from "next/server";
import { env } from "@stall/config";
import { prisma, type Role } from "@stall/db";
import { AppError, resolveClientIp, verifyAccessToken } from "@stall/core";

export interface Principal {
  userId: string;
  sessionId: string;
  activeRole: Role;
  roles: Role[];
  deviceId?: string;
}

export interface RequestContext {
  platform: string;
  deviceId?: string;
  userAgent?: string;
  ip?: string;
  idempotencyKey?: string;
  principal: Principal | null;
}

function clientIp(req: NextRequest): string | undefined {
  // Left-most XFF entries are client-controlled — see resolveClientIp.
  return resolveClientIp(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"), env.TRUST_PROXY_HOPS);
}

/** Parse headers + (optionally) authenticate the bearer access token. */
export async function getContext(req: NextRequest): Promise<RequestContext> {
  const ctx: RequestContext = {
    platform: req.headers.get("x-platform") ?? env.DEFAULT_PLATFORM,
    deviceId: req.headers.get("x-device-id") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
    ip: clientIp(req),
    idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
    principal: null,
  };

  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const claims = await verifyAccessToken(authz.slice(7));
    // token-epoch check → supports "log out everywhere"
    const te = await prisma.tokenEpoch.findUnique({ where: { userId: claims.sub } });
    if (!te || te.ver !== claims.ver) throw new AppError("INVALID_TOKEN", "Token no longer valid");
    ctx.principal = {
      userId: claims.sub,
      sessionId: claims.sid,
      activeRole: claims.activeRole,
      roles: claims.roles,
      deviceId: claims.deviceId,
    };
  }
  return ctx;
}

export function requireAuth(ctx: RequestContext): Principal {
  if (!ctx.principal) throw new AppError("UNAUTHENTICATED", "Authentication required");
  return ctx.principal;
}

export function requireRole(ctx: RequestContext, role: Role): Principal {
  const p = requireAuth(ctx);
  if (p.activeRole !== role) throw new AppError("FORBIDDEN", `Requires the ${role} role`);
  return p;
}
