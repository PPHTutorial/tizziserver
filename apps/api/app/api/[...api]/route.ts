import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy RPC endpoint (`POST /api/<anything>` with `{ action }`).
 *
 * Phase 1 retired the `{action}`-dispatcher + the 6 Tizzi-Gas services (archived
 * under `apps/api/_legacy_services/`). The real API is the versioned REST surface
 * at `/api/v1/*`. `auth.*` actions are bridged in Phase 1; everything else is Gone.
 *
 * Kept alive only so old clients get a clear, machine-readable pointer.
 */
export async function POST(request: NextRequest) {
  let action = "unknown";
  try {
    const body = await request.json();
    if (body && typeof body.action === "string") action = body.action;
  } catch {
    /* ignore */
  }

  if (action === "test") {
    return NextResponse.json({ ok: true, data: "Test successful", ts: new Date().toISOString() });
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "ENDPOINT_MIGRATED",
        message:
          "The {action} RPC endpoint has been retired. Use the REST API at /api/v1/*. " +
          "See docs/01-ARCHITECTURE.md.",
        action,
      },
    },
    { status: 410 },
  );
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: { code: "USE_POST", message: "Legacy RPC accepts POST only; prefer /api/v1/*." } },
    { status: 405 },
  );
}
