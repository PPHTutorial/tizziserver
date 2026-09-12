import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for the web/desktop Flutter build (native mobile isn't subject to it,
 * but Chrome/Edge/desktop-webview targets are). No endpoint relies on cookies
 * — auth is a bearer token in `Authorization` — so a permissive `*` origin
 * carries no credential-leak risk.
 */
const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Platform",
  "X-Device-Id",
  "Idempotency-Key",
].join(", ");
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function withCors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  return res;
}

export function middleware(req: NextRequest): NextResponse {
  if (req.method === "OPTIONS") return withCors(new NextResponse(null, { status: 204 }));
  return withCors(NextResponse.next());
}

export const config = { matcher: "/api/:path*" };
