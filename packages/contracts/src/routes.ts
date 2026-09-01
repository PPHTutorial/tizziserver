import { z } from "zod";
import { ok } from "./envelope.ts";
import * as a from "./auth.ts";

/**
 * The API contract registry → `openapi.json` (and the hand-written Dart client
 * in `mobile/lib/api/`, kept faithful to these shapes).
 */
export interface RouteContract {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  tags: string[];
  /** true ⇒ requires a bearer access token (adds 401 + security). */
  auth: boolean;
  /** true ⇒ honours `Idempotency-Key` (documented, not enforced here). */
  idempotent?: boolean;
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  response: z.ZodTypeAny;
  /** extra status codes this route can return, beyond the defaults. */
  errors?: number[];
}

export const HealthResponse = ok(
  z.object({
    service: z.string(),
    version: z.string(),
    env: z.string(),
    ts: z.string(),
  }),
);

export const routes = {
  health: {
    method: "GET",
    path: "/api/v1/health",
    summary: "Liveness + build info",
    tags: ["system"],
    auth: false,
    response: HealthResponse,
  },

  configBootstrap: {
    method: "GET",
    path: "/api/v1/config/bootstrap",
    summary: "Per-platform capability + nav bootstrap (anonymous or authenticated)",
    tags: ["system"],
    auth: false,
    query: a.BootstrapQuery,
    response: a.BootstrapResponse,
    errors: [404],
  },

  authOtp: {
    method: "POST",
    path: "/api/v1/auth/otp",
    summary: "Send a login / verification OTP over SMS or email",
    tags: ["auth"],
    auth: false,
    body: a.OtpRequest,
    response: a.OtpResponse,
    errors: [429],
  },
  authVerify: {
    method: "POST",
    path: "/api/v1/auth/verify",
    summary: "Verify an OTP → token pair (or an MFA challenge)",
    tags: ["auth"],
    auth: false,
    body: a.VerifyRequest,
    response: a.VerifyResponse,
    errors: [400, 429],
  },
  authRefresh: {
    method: "POST",
    path: "/api/v1/auth/refresh",
    summary: "Rotate a refresh token (reuse ⇒ family revoked)",
    tags: ["auth"],
    auth: false,
    body: a.RefreshRequest,
    response: a.RefreshResponse,
    errors: [401, 429],
  },
  authLogout: {
    method: "POST",
    path: "/api/v1/auth/logout",
    summary: "Revoke the current session, or every session",
    tags: ["auth"],
    auth: true,
    body: a.LogoutRequest,
    response: a.LogoutResponse,
  },
  authSessionsList: {
    method: "GET",
    path: "/api/v1/auth/sessions",
    summary: "List the caller's active sessions / devices",
    tags: ["auth"],
    auth: true,
    response: a.SessionsResponse,
  },
  authSessionsRevoke: {
    method: "DELETE",
    path: "/api/v1/auth/sessions",
    summary: "Revoke one of the caller's other sessions",
    tags: ["auth"],
    auth: true,
    body: a.RevokeSessionRequest,
    response: a.RevokeSessionResponse,
  },
  authSwitchRole: {
    method: "POST",
    path: "/api/v1/auth/switch-role",
    summary: "Mint a new access token for a different active role",
    tags: ["auth"],
    auth: true,
    body: a.SwitchRoleRequest,
    response: a.SwitchRoleResponse,
    errors: [403, 429],
  },
  authSocial: {
    method: "POST",
    path: "/api/v1/auth/social",
    summary: "Sign in with Google / Apple / Facebook",
    tags: ["auth"],
    auth: false,
    body: a.SocialRequest,
    response: a.SocialResponse,
    errors: [401, 429],
  },
  authTwoFactor: {
    method: "POST",
    path: "/api/v1/auth/2fa",
    summary: "TOTP 2FA lifecycle: enroll / confirm / disable / status",
    tags: ["auth"],
    auth: true,
    body: a.TwoFactorRequest,
    response: a.TwoFactorResponse,
    errors: [400, 429],
  },
  authPin: {
    method: "POST",
    path: "/api/v1/auth/pin",
    summary: "Set / replace the transaction PIN",
    tags: ["auth"],
    auth: true,
    body: a.PinRequest,
    response: a.OkSet,
  },
  authPassword: {
    method: "POST",
    path: "/api/v1/auth/password",
    summary: "Set / replace the account password",
    tags: ["auth"],
    auth: true,
    body: a.PasswordRequest,
    response: a.OkSet,
  },

  auctionsPing: {
    method: "GET",
    path: "/api/v1/auctions/ping",
    summary: "Capability-gate probe (200 where `auction` is enabled, else 403)",
    tags: ["auctions"],
    auth: true,
    response: a.AuctionPingResponse,
    errors: [403],
  },
} satisfies Record<string, RouteContract>;

export type Routes = typeof routes;

export * as auth from "./auth.ts";
