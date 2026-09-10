import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

// vi.spyOn can't redefine a frozen ESM namespace export, so replace the
// module: keep the real SDK behind everything except a spy-wrapped
// captureException (verifies real forwarding, not just "didn't throw").
vi.mock("@sentry/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/node")>();
  return { ...actual, captureException: vi.fn(actual.captureException) };
});

import * as Sentry from "@sentry/node";
import { captureError, withSpan } from "../src/observability.ts";

describe("observability", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    trace.disable();
    await provider.shutdown();
    vi.restoreAllMocks();
  });

  it("withSpan creates a real, named span with scrubbed attributes and OK status", async () => {
    const result = await withSpan(
      "test.op",
      { userId: "u1", platform: "grandprice", secretToken: "shhh" },
      async () => "done",
    );
    expect(result).toBe("done");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("test.op");
    expect(spans[0]!.attributes.userId).toBe("u1");
    expect(spans[0]!.attributes.platform).toBe("grandprice");
    // sensitive keys never reach the span
    expect(spans[0]!.attributes.secretToken).toBeUndefined();
    expect(spans[0]!.status.code).toBe(1); // SpanStatusCode.OK
  });

  it("withSpan records the exception and sets ERROR status when fn throws, then rethrows", async () => {
    await expect(
      withSpan("test.op.fails", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(spans[0]!.status.message).toBe("boom");
    expect(spans[0]!.events.some((e) => e.name === "exception")).toBe(true);
  });

  it("captureError forwards to Sentry.captureException with scrubbed context, and never throws", () => {
    const spy = vi.mocked(Sentry.captureException);
    spy.mockClear();
    const err = new Error("something broke");

    expect(() => captureError(err, { route: "/orders", password: "nope" })).not.toThrow();

    expect(spy).toHaveBeenCalledTimes(1);
    const [passedErr, hint] = spy.mock.calls[0]!;
    expect(passedErr).toBe(err);
    expect((hint as { extra?: Record<string, unknown> }).extra).toMatchObject({ route: "/orders" });
    expect((hint as { extra?: Record<string, unknown> }).extra).not.toHaveProperty("password");
  });

  it("captureError wraps a non-Error throw into a real Error", () => {
    const spy = vi.mocked(Sentry.captureException);
    spy.mockClear();
    captureError("just a string");
    const [passedErr] = spy.mock.calls[0]!;
    expect(passedErr).toBeInstanceOf(Error);
    expect((passedErr as Error).message).toBe("just a string");
  });
});
