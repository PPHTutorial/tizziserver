import type { NextRequest } from "next/server";
import type { Role } from "@stall/db";
import { storage, randomToken, AppError, isAppError, rateLimit, sniffMediaType, captureError } from "@stall/core";
import { getContext, requireAuth } from "@/src/http/context";
import { ok, fail } from "@/src/http/envelope";

interface KindRule {
  prefix: string;
  video: boolean;
  /** Active roles allowed to upload this kind; omitted ⇒ any signed-in user. */
  roles?: Role[];
}

/**
 * Vendor logo/banner/KYC stay open to any signed-in user because they're
 * uploaded during "Sell on Stall" onboarding, before the VENDOR role is active.
 */
const KINDS: Record<string, KindRule> = {
  avatar: { prefix: "avatars", video: false },
  vendorLogo: { prefix: "vendors", video: false },
  vendorBanner: { prefix: "vendors", video: false },
  vendorKycDoc: { prefix: "kyc/vendors", video: false }, // private prefix — never public-read
  vendorKycSelfie: { prefix: "kyc/vendors", video: false }, // private prefix — never public-read
  product: { prefix: "products", video: false, roles: ["VENDOR"] },
  productVideo: { prefix: "products/video", video: true, roles: ["VENDOR"] },
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_BYTES_VIDEO = 80 * 1024 * 1024;
/** Multipart framing overhead allowed on top of the largest file. */
const MAX_REQUEST_BYTES = MAX_BYTES_VIDEO + 1024 * 1024;
const UPLOADS_PER_HOUR = 120;

/**
 * Generic authenticated media upload (avatar, vendor logo/banner/KYC, product
 * images + video). Not built on `withApi` — that wrapper always reads the body
 * as JSON, but this needs multipart form-data (same auth-without-withApi
 * pattern as orders/[id]/invoice/route.ts).
 *
 * The stored content type comes from the file's magic bytes, never from the
 * client's declared `file.type`.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getContext(req);
    const principal = requireAuth(ctx);

    // Refuse oversized bodies before buffering the multipart payload.
    // (Chunked bodies without a length still fall through to the per-file cap;
    // put a body-size limit on the reverse proxy for those.)
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_REQUEST_BYTES) throw new AppError("VALIDATION", "Upload too large");

    const rl = await rateLimit(`media.upload:${principal.userId}`, UPLOADS_PER_HOUR, 3600);
    if (!rl.ok) return fail("RATE_LIMITED", "Too many uploads", 429, { retryAfterSec: rl.resetSec });

    const form = await req.formData().catch(() => null);
    if (!form) throw new AppError("VALIDATION", "Expected multipart/form-data");

    const kind = form.get("kind");
    if (typeof kind !== "string" || !Object.hasOwn(KINDS, kind)) {
      throw new AppError("VALIDATION", `kind must be one of: ${Object.keys(KINDS).join(", ")}`);
    }
    const rule = KINDS[kind]!;
    if (rule.roles && !rule.roles.includes(principal.activeRole)) {
      throw new AppError("FORBIDDEN", `Uploading ${kind} requires role: ${rule.roles.join(" | ")}`);
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) throw new AppError("VALIDATION", "Missing file");
    if (file.size === 0) throw new AppError("VALIDATION", "Empty file");
    const maxBytes = rule.video ? MAX_BYTES_VIDEO : MAX_BYTES;
    if (file.size > maxBytes) {
      throw new AppError("VALIDATION", rule.video ? "Video must be 80MB or smaller" : "Image must be 5MB or smaller");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = sniffMediaType(buffer);
    if (!contentType || contentType.startsWith("video/") !== rule.video) {
      throw new AppError(
        "VALIDATION",
        rule.video ? "Only MP4, MOV or WebM videos are supported" : "Only JPEG, PNG or WebP images are supported",
      );
    }

    const key = `${rule.prefix}/${principal.userId}/${kind}-${randomToken(8)}.${EXT[contentType]}`;
    await storage.storageProvider().putObject(key, buffer, contentType);

    return ok({ key });
  } catch (e) {
    if (isAppError(e)) return fail(e.code, e.message, e.status, e.details);
    captureError(e, { route: req.nextUrl.pathname, method: req.method });
    return fail("INTERNAL", "Internal server error", 500);
  }
}
