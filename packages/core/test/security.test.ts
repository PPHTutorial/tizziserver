import { describe, expect, it } from "vitest";
import { resolveClientIp, sniffMediaType } from "../src/security.ts";
import { isBrandfetchAssetUrl } from "../src/catalog/brands.ts";
import { productionSecretProblems } from "@stall/config";

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

describe("isBrandfetchAssetUrl", () => {
  it("allows only https Brandfetch hosts", () => {
    expect(isBrandfetchAssetUrl("https://cdn.brandfetch.io/id/logo.png")).toBe(true);
    expect(isBrandfetchAssetUrl("https://asset.brandfetch.io/x.png")).toBe(true);
    expect(isBrandfetchAssetUrl("http://cdn.brandfetch.io/x.png")).toBe(false);
    expect(isBrandfetchAssetUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isBrandfetchAssetUrl("https://brandfetch.io.evil.com/x.png")).toBe(false);
    expect(isBrandfetchAssetUrl("https://evilbrandfetch.io/x.png")).toBe(false);
    expect(isBrandfetchAssetUrl("https://cdn.brandfetch.io:8443/x.png")).toBe(false);
    expect(isBrandfetchAssetUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("productionSecretProblems", () => {
  const base = {
    NODE_ENV: "production",
    JWT_PUBLIC_KEY: "MCowBQYDK2VwAyEAKvMYnCyKVQUTN+Iw80vWk3UagyyqYdyjFFsG0D43Q5k=",
    PAYMENTS_PROVIDER: "mock",
    MOCK_PAYMENTS_WEBHOOK_SECRET: "dev-only-mock-webhook-secret-change-me",
    REDIS_URL: "redis://redis:6379",
    ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true",
  };
  it("flags the committed dev keypair and default mock secret in production", () => {
    expect(productionSecretProblems(base)).toHaveLength(2);
    expect(productionSecretProblems({ ...base, JWT_PUBLIC_KEY: "other", PAYMENTS_PROVIDER: "paystack" })).toEqual([]);
  });
  it("refuses mock payments in production unless explicitly allowed (staging)", () => {
    const real = { ...base, JWT_PUBLIC_KEY: "other", MOCK_PAYMENTS_WEBHOOK_SECRET: "rotated" };
    expect(productionSecretProblems(real)).toEqual([]);
    const problems = productionSecretProblems({ ...real, ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "false" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^PAYMENTS_PROVIDER/);
  });
  it("requires Redis in production so rate limits can't silently switch off", () => {
    const problems = productionSecretProblems({ ...base, JWT_PUBLIC_KEY: "other", PAYMENTS_PROVIDER: "paystack", REDIS_URL: undefined });
    expect(problems).toEqual([expect.stringMatching(/^REDIS_URL/)]);
  });
  it("is silent outside production", () => {
    expect(productionSecretProblems({ ...base, NODE_ENV: "development" })).toEqual([]);
  });
});
