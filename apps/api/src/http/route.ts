import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { prisma, type Role } from "@stall/db";
import { AppError, isAppError, sha256Hex, rateLimit, platform as corePlatform } from "@stall/core";
import type { Features } from "@stall/core";
import { getContext, type RequestContext } from "./context";
import { ok, fail } from "./envelope";

type AuthOpt = boolean | Role | Role[];

export interface RouteOpts<B, Q> {
  body?: ZodType<B>;
  query?: ZodType<Q>;
  auth?: AuthOpt;
  capability?: string;
  rateLimit?: { limit: number; windowSec: number; by?: "ip" | "principal" };
  idempotent?: boolean;
  /** AuditLog action string, or a fn deriving {action,targetType?,targetId?} from the result. */
  audit?: string | ((r: { data: unknown; ctx: RequestContext }) => AuditSpec | null);
}

interface AuditSpec {
  action: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
}

export interface HandlerArgs<B, Q> {
  req: NextRequest;
  ctx: RequestContext & { features?: Features };
  body: B;
  query: Q;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function withApi<B = undefined, Q = undefined, R = unknown>(
  opts: RouteOpts<B, Q>,
  handler: (args: HandlerArgs<B, Q>) => Promise<R> | R,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const ctx: RequestContext & { features?: Features } = await getContext(req);
      const path = req.nextUrl.pathname;

      // --- rate limit -------------------------------------------------
      if (opts.rateLimit) {
        const who = opts.rateLimit.by === "principal" ? ctx.principal?.userId ?? ctx.ip ?? "anon" : ctx.ip ?? "anon";
        const rl = await rateLimit(`${req.method}:${path}:${who}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
        if (!rl.ok) {
          return fail("RATE_LIMITED", "Too many requests", 429, { retryAfterSec: rl.resetSec });
        }
      }

      // --- auth ------------------------------------------------------
      if (opts.auth) {
        if (!ctx.principal) throw new AppError("UNAUTHENTICATED", "Authentication required");
        if (opts.auth !== true) {
          const allowed = Array.isArray(opts.auth) ? opts.auth : [opts.auth];
          if (!allowed.includes(ctx.principal.activeRole)) {
            throw new AppError("FORBIDDEN", `Requires role: ${allowed.join(" | ")}`);
          }
        }
      }

      // --- capability ---------------------------------------------
      if (opts.capability) {
        ctx.features = await corePlatform.resolveFeatures({
          platformSlug: ctx.platform,
          role: ctx.principal?.activeRole,
          userId: ctx.principal?.userId,
        });
        corePlatform.assertFeature(ctx.features, opts.capability);
      }

      // --- input --------------------------------------------------
      const rawBody =
        opts.body && MUTATING.has(req.method) ? await req.json().catch(() => ({})) : undefined;
      const body = (opts.body ? opts.body.parse(rawBody) : undefined) as B;
      const query = (opts.query
        ? opts.query.parse(Object.fromEntries(req.nextUrl.searchParams))
        : undefined) as Q;

      // --- idempotency (replay) ---------------------------------
      const idemKey = opts.idempotent && MUTATING.has(req.method) ? ctx.idempotencyKey : undefined;
      const requestHash = idemKey ? sha256Hex(`${req.method} ${path} ${JSON.stringify(rawBody ?? {})}`) : "";
      if (idemKey) {
        const prior = await prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
        if (prior) {
          if (prior.requestHash !== requestHash) {
            return fail("CONFLICT", "Idempotency-Key reused with a different request", 409);
          }
          return NextResponse.json(
            { ok: true, data: prior.responseSnapshot, error: null },
            { status: prior.statusCode ?? 200 },
          );
        }
      }

      // --- handle -----------------------------------------------
      const data = await handler({ req, ctx, body, query });
      const res = ok(data);

      if (idemKey) {
        await prisma.idempotencyKey
          .create({
            data: {
              key: idemKey,
              principalId: ctx.principal?.userId,
              route: path,
              requestHash,
              responseSnapshot: data as never,
              statusCode: 200,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          })
          .catch(() => {});
      }

      if (opts.audit) {
        const spec = typeof opts.audit === "string" ? { action: opts.audit } : opts.audit({ data, ctx });
        if (spec) {
          const actorId = spec.actorId ?? ctx.principal?.userId;
          void prisma.auditLog
            .create({
              data: {
                actorId,
                actorType: actorId ? "USER" : "SYSTEM",
                action: spec.action,
                targetType: spec.targetType,
                targetId: spec.targetId,
                ip: ctx.ip,
                ua: ctx.userAgent,
              },
            })
            .catch(() => {});
        }
      }

      return res;
    } catch (e) {
      if (isAppError(e)) return fail(e.code, e.message, e.status, e.details);
      if (e instanceof ZodError) {
        return fail("VALIDATION", "Request validation failed", 400, e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      }
      console.error("[api] unhandled:", e);
      return fail("INTERNAL", "Internal server error", 500);
    }
  };
}
