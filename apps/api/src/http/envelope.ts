import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, isAppError } from "@stall/core";

export interface Meta {
  traceId?: string;
  page?: number;
  limit?: number;
  total?: number;
}

export function ok<T>(data: T, meta?: Meta, status = 200) {
  return NextResponse.json({ ok: true, data, error: null, meta }, { status });
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, data: null, error: { code, message, details } }, { status });
}

/** Wraps a route handler: turns AppError / ZodError / unknown into the envelope. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (isAppError(e)) return fail(e.code, e.message, e.status, e.details);
      if (e instanceof ZodError) {
        return fail(
          "VALIDATION",
          "Request validation failed",
          400,
          e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      console.error("[api] unhandled error:", e);
      return fail("INTERNAL", "Internal server error", 500);
    }
  };
}

export { AppError };
