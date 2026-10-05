import { NextResponse, type NextRequest } from "next/server";
import { storage } from "@stall/core";
import { isAppError } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";

/**
 * Streams a KYC document to signed-in staff. KYC files live under private
 * prefixes (kyc/…, legacy vendors/kyc/…) that the media bucket never serves
 * publicly, so this is the only way to view them. `?key=` must be a KYC key.
 */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!(key.startsWith("kyc/") || key.startsWith("vendors/kyc/")) || key.includes("..")) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Not a KYC document key" } }, { status: 400 });
  }
  try {
    const obj = await storage.storageProvider().getObject(key);
    return new NextResponse(new Uint8Array(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const status = isAppError(e) ? e.status : 500;
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Document not found" } }, { status });
  }
}
