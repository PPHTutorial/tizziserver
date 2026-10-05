/**
 * Small, pure security helpers shared by the API edge (no DB / network).
 */

/**
 * Resolve the client IP from proxy headers.
 *
 * X-Forwarded-For is appended to by each proxy, so only the right-most
 * `trustedHops` entries were written by infrastructure we control; anything to
 * their left is client-supplied and trivially spoofable (which would let an
 * attacker rotate IPs to dodge every per-IP rate limit). We therefore take the
 * entry `trustedHops` from the right. `trustedHops = 0` ignores XFF entirely.
 */
export function resolveClientIp(
  xff: string | null | undefined,
  realIp: string | null | undefined,
  trustedHops: number,
): string | undefined {
  if (xff && trustedHops > 0) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[Math.max(0, parts.length - trustedHops)];
  }
  const r = realIp?.trim();
  return r ? r : undefined;
}

export type SniffedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm";

const startsWith = (buf: Uint8Array, sig: number[], offset = 0) =>
  buf.length >= offset + sig.length && sig.every((b, i) => buf[offset + i] === b);

const ascii = (buf: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...buf.subarray(start, Math.min(end, buf.length)));

/**
 * Identify an upload by its magic bytes — never trust the client's declared
 * MIME type (a polyglot HTML/SVG labelled `image/png` must not be stored).
 * Returns null for anything outside the supported set.
 */
export function sniffMediaType(buf: Uint8Array): SniffedMediaType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "image/webp";
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  // ISO-BMFF: [size:4]["ftyp"][major brand:4]
  if (buf.length >= 12 && ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (brand === "qt  ") return "video/quicktime";
    // HEIC/AVIF are ISO-BMFF too but are images we don't accept here.
    if (/^(heic|heix|hevc|hevx|mif1|msf1|avif|avis)$/.test(brand)) return null;
    return "video/mp4";
  }
  return null;
}
