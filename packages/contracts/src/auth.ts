import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * Phase 1 auth + platform-bootstrap contract. Mirrors the Zod DTOs in
 * `apps/api/app/api/v1/**` — keep the two in sync (a drift test lands in Phase 2).
 * `scripts/build-openapi.ts` turns the `routes` registry into `openapi.json`.
 */

// --- shared enums -----------------------------------------------------------
export const Role = z.enum(["CUSTOMER", "VENDOR", "COURIER", "STAFF", "ADMIN"]);
export const SelectableRole = z.enum(["CUSTOMER", "VENDOR", "COURIER"]);
export const DevicePlatform = z.enum(["IOS", "ANDROID", "WEB"]);
export const OtpPurpose = z.enum([
  "LOGIN",
  "VERIFY_PHONE",
  "VERIFY_EMAIL",
  "RESET_PASSWORD",
  "RESET_PIN",
]);
export const SocialProvider = z.enum(["GOOGLE", "APPLE", "FACEBOOK"]);

// --- shared models --------------------------------------------------------
export const DeviceInput = z.object({
  deviceId: z.string().min(4),
  platform: DevicePlatform,
  model: z.string().optional(),
  pushToken: z.string().optional(),
  appVersion: z.string().optional(),
});

export const PublicUser = z.object({
  id: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatar: z.string().nullable(),
  status: z.string(),
  locale: z.string().nullable(),
  username: z.string().nullable(),
  emailVerifiedAt: z.string().nullable(),
  phoneVerifiedAt: z.string().nullable(),
});

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  activeRole: Role,
  roles: z.array(Role),
  refreshExpiresAt: z.string(),
});

export const SessionInfo = z.object({
  id: z.string(),
  deviceId: z.string().nullable(),
  platformSlug: z.string().nullable(),
  activeRole: Role,
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  current: z.boolean(),
});

// --- POST /auth/otp -----------------------------------------------------
export const OtpRequest = z
  .object({
    phone: z.string().min(8).optional(),
    email: z.string().email().optional(),
    purpose: OtpPurpose.default("LOGIN"),
  })
  .refine((b) => b.phone || b.email, { message: "phone or email is required" });

export const OtpResponse = ok(
  z.object({
    sent: z.literal(true),
    channel: z.enum(["SMS", "EMAIL"]),
    expiresAt: z.string(),
  }),
);

// --- POST /auth/verify ------------------------------------------------
export const VerifyRequest = z
  .object({
    phone: z.string().min(8).optional(),
    email: z.string().email().optional(),
    code: z.string().min(4).max(8),
    purpose: z.enum(["LOGIN", "VERIFY_PHONE"]).default("LOGIN"),
    device: DeviceInput.optional(),
    activeRole: SelectableRole.optional(),
    totpCode: z.string().min(6).max(10).optional(),
  })
  .refine((b) => b.phone || b.email, { message: "phone or email is required" });

/** Either an MFA challenge, or a completed login. */
export const VerifyResponse = ok(
  z.union([
    z.object({ mfaRequired: z.literal(true), methods: z.array(z.literal("totp")) }),
    z.object({ user: PublicUser }).and(TokenPair),
  ]),
);

// --- POST /auth/refresh ---------------------------------------------
export const RefreshRequest = z.object({ refreshToken: z.string().min(20) });
export const RefreshResponse = ok(TokenPair);

// --- POST /auth/logout --------------------------------------------
export const LogoutRequest = z.object({ everywhere: z.boolean().default(false) });
export const LogoutResponse = ok(z.object({ loggedOut: z.literal(true), everywhere: z.boolean() }));

// --- GET / DELETE /auth/sessions --------------------------------
export const SessionsResponse = ok(z.array(SessionInfo));
export const RevokeSessionRequest = z.object({ sessionId: z.string().min(6) });
export const RevokeSessionResponse = ok(z.object({ revoked: z.boolean() }));

// --- POST /auth/switch-role ------------------------------------
export const SwitchRoleRequest = z.object({ role: Role });
export const SwitchRoleResponse = ok(
  z.object({ accessToken: z.string(), activeRole: Role, roles: z.array(Role) }),
);

// --- POST /auth/social ----------------------------------------
export const SocialRequest = z.object({
  provider: SocialProvider,
  token: z.string().min(20),
  device: DeviceInput.optional(),
});
export const SocialResponse = ok(z.object({ user: PublicUser, created: z.boolean() }).and(TokenPair));

// --- POST /auth/2fa -----------------------------------------
export const TwoFactorRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }),
  z.object({ action: z.literal("confirm"), code: z.string().min(6).max(10) }),
  z.object({ action: z.literal("disable"), code: z.string().min(6).max(10) }),
  z.object({ action: z.literal("status") }),
]);
export const TwoFactorResponse = ok(
  z.union([
    z.object({ action: z.literal("enroll"), uri: z.string(), secret: z.string() }),
    z.object({ action: z.literal("confirm"), recoveryCodes: z.array(z.string()) }),
    z.object({ action: z.literal("disable"), disabled: z.literal(true) }),
    z.object({ action: z.literal("status"), enrolled: z.boolean(), pending: z.boolean() }),
  ]),
);

// --- POST /auth/pin  &  /auth/password -------------------
export const PinRequest = z.object({ pin: z.string().regex(/^\d{4,6}$/) });
export const PasswordRequest = z.object({ password: z.string().min(8).max(128) });
export const OkSet = ok(z.object({ set: z.literal(true) }));

// --- GET /config/bootstrap ------------------------------
export const BootstrapQuery = z.object({ region: z.string().optional() });
export const NavItem = z.object({
  key: z.string(),
  label: z.string(),
  icon: z.string(),
  route: z.string(),
});
export const BootstrapResponse = ok(
  z.object({
    platform: z.object({
      slug: z.string(),
      name: z.string(),
      defaultCurrency: z.string(),
      theme: z.unknown(),
    }),
    authenticated: z.boolean(),
    activeRole: Role.nullable(),
    roles: z.array(Role),
    features: z.record(z.string(), z.unknown()),
    nav: z.array(NavItem),
    minAppVersion: z.object({ ios: z.string(), android: z.string() }),
  }),
);

// --- PATCH /me/profile -----------------------------------
export const UpdateProfileRequest = z.object({
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  avatar: z.string().max(500).optional(),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_.]+$/).optional(),
});
export const UpdateProfileResponse = ok(PublicUser);

// --- POST /me/email, /me/email/verify, /me/phone, /me/phone/verify ---
export const RequestContactChangeResponse = ok(z.object({ sent: z.boolean(), expiresAt: z.string() }));
export const RequestEmailChangeRequest = z.object({ email: z.string().email() });
export const VerifyEmailChangeRequest = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });
export const VerifyContactChangeResponse = ok(PublicUser);
export const RequestPhoneChangeRequest = z.object({ phone: z.string().min(8) });
export const VerifyPhoneChangeRequest = z.object({ phone: z.string().min(8), code: z.string().min(4).max(8) });

// --- GET /auctions/ping (capability probe) --------------
export const AuctionPingResponse = ok(
  z.object({
    pong: z.literal(true),
    platform: z.string(),
    activeRole: Role,
    at: z.string(),
  }),
);
