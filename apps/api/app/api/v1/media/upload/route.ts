import type { NextRequest } from "next/server";
import { storage, randomToken, AppError, isAppError } from "@stall/core";
import { getContext, requireAuth } from "@/src/http/context";
import { ok, fail } from "@/src/http/envelope";

const KIND_PREFIX: Record<string, string> = {
  avatar: "avatars",
  vendorLogo: "vendors",
  vendorBanner: "vendors",
  vendorKycDoc: "vendors/kyc",
  vendorKycSelfie: "vendors/kyc",
};

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Generic authenticated image upload backing the avatar / vendor logo+banner
 * editors. Not built on `withApi` — that wrapper always reads the body as
 * JSON, but this needs multipart form-data (same auth-without-withApi
 * pattern as orders/[id]/invoice/route.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getContext(req);
    const principal = requireAuth(ctx);

    const form = await req.formData().catch(() => null);
    if (!form) throw new AppError("VALIDATION", "Expected multipart/form-data");

    const kind = form.get("kind");
    if (typeof kind !== "string" || !(kind in KIND_PREFIX)) {
      throw new AppError("VALIDATION", `kind must be one of: ${Object.keys(KIND_PREFIX).join(", ")}`);
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) throw new AppError("VALIDATION", "Missing file");
    if (file.size === 0) throw new AppError("VALIDATION", "Empty file");
    if (file.size > MAX_BYTES) throw new AppError("VALIDATION", "Image must be 5MB or smaller");

    const ext = CONTENT_TYPE_EXT[file.type];
    if (!ext) throw new AppError("VALIDATION", "Only JPEG, PNG, or WebP images are supported");

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `${KIND_PREFIX[kind]}/${principal.userId}/${kind}-${randomToken(8)}.${ext}`;
    await storage.storageProvider().putObject(key, buffer, file.type);

    return ok({ key });
  } catch (e) {
    if (isAppError(e)) return fail(e.code, e.message, e.status, e.details);
    return fail("INTERNAL", "Internal server error", 500);
  }
}
