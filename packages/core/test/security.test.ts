import { describe, expect, it } from "vitest";
import { resolveClientIp, sniffMediaType } from "../src/security.ts";

describe("resolveClientIp", () => {
  it("takes the entry appended by the trusted proxy, not the spoofable left-most one", () => {
    expect(resolveClientIp("6.6.6.6, 41.1.1.1", null, 1)).toBe("41.1.1.1");
    expect(resolveClientIp("6.6.6.6, 41.1.1.1, 10.0.0.2", null, 2)).toBe("41.1.1.1");
  });
  it("clamps when fewer entries than hops", () => {
    expect(resolveClientIp("41.1.1.1", null, 3)).toBe("41.1.1.1");
  });
  it("falls back to X-Real-IP, and ignores XFF when hops = 0", () => {
    expect(resolveClientIp(null, "41.2.2.2", 1)).toBe("41.2.2.2");
    expect(resolveClientIp("6.6.6.6", "41.2.2.2", 0)).toBe("41.2.2.2");
    expect(resolveClientIp(null, null, 1)).toBeUndefined();
  });
});

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("sniffMediaType", () => {
  it("recognises supported images and videos", () => {
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMediaType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffMediaType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMediaType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0]))).toBe("video/webm");
    expect(sniffMediaType(bytes([0, 0, 0, 0x18], "ftypisom"))).toBe("video/mp4");
    expect(sniffMediaType(bytes([0, 0, 0, 0x14], "ftypqt  "))).toBe("video/quicktime");
  });
  it("rejects HTML/SVG polyglots, HEIC and short buffers", () => {
    expect(sniffMediaType(bytes("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffMediaType(bytes("<svg xmlns="))).toBeNull();
    expect(sniffMediaType(bytes([0, 0, 0, 0x18], "ftypheic"))).toBeNull();
    expect(sniffMediaType(bytes([0xff, 0xd8]))).toBeNull();
  });
});
