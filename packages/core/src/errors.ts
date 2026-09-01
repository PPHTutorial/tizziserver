export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "FEATURE_DISABLED"
  | "INVALID_OTP"
  | "OTP_EXPIRED"
  | "OTP_COOLDOWN"
  | "OTP_LOCKED"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "REFRESH_REUSE_DETECTED"
  | "SESSION_REVOKED"
  | "ROLE_NOT_ACTIVE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  FEATURE_DISABLED: 403,
  INVALID_OTP: 400,
  OTP_EXPIRED: 400,
  OTP_COOLDOWN: 429,
  OTP_LOCKED: 429,
  INVALID_TOKEN: 401,
  TOKEN_EXPIRED: 401,
  REFRESH_REUSE_DETECTED: 401,
  SESSION_REVOKED: 401,
  ROLE_NOT_ACTIVE: 403,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
