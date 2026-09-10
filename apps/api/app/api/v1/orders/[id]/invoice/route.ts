import { NextResponse, type NextRequest } from "next/server";
import { commerce, isAppError } from "@stall/core";
import { getContext, requireAuth } from "@/src/http/context";

/**
 * Downloads the invoice PDF. Not built on `withApi` — every other route
 * returns the JSON envelope, but a binary download needs its own
 * Content-Type/Content-Disposition response, so auth is done the same way
 * `withApi` does it (`getContext` + `requireAuth`) without the JSON wrapper.
 */
export async function GET(req: NextRequest, routeCtx: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getContext(req);
    const principal = requireAuth(ctx);
    const { id } = await routeCtx.params;
    const { buffer, filename } = await commerce.getInvoicePdf(principal.userId, id);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json({ ok: false, data: null, error: { code: e.code, message: e.message } }, { status: e.status });
    }
    return NextResponse.json({ ok: false, data: null, error: { code: "INTERNAL", message: "Internal server error" } }, { status: 500 });
  }
}
