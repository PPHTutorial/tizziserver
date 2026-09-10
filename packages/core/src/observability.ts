/**
 * Observability bootstrap (Phase 8).
 *
 * Real tracing + error capture, not a hand-rolled shim: `@sentry/node` owns
 * OpenTelemetry's global tracer-provider registration (Sentry v8+ is built on
 * OTel internally), and we plug a generic OTLP exporter into it via
 * `openTelemetrySpanProcessors` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set —
 * this avoids two independent SDKs racing to register the global provider
 * (only one registration wins; the OTel API warns and drops the loser).
 * `Sentry.init()` with an empty `dsn` safely no-ops for Sentry's own ingest,
 * so error capture is inert until `SENTRY_DSN` is set, independently of the
 * OTLP endpoint.
 *
 * `withSpan` always creates a real span via the stable `@opentelemetry/api`
 * — with nothing registered that's a harmless no-op tracer, so call sites
 * don't need to know whether tracing is actually wired up.
 */
import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import * as Sentry from "@sentry/node";
import { env } from "@stall/config";

let service = "stall";
let started = false;

export interface ObsContext {
  route?: string;
  method?: string;
  userId?: string;
  platform?: string;
  [k: string]: unknown;
}

/** A BatchSpanProcessor exporting to a generic OTLP/HTTP collector. */
export function otlpSpanProcessor(endpoint: string): SpanProcessor {
  return new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }));
}

export function initObservability(serviceName: string) {
  if (started) return;
  started = true;
  service = env.OTEL_SERVICE_NAME ?? serviceName;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    serverName: service,
    tracesSampleRate: env.OTEL_TRACES_SAMPLER_ARG,
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? { openTelemetrySpanProcessors: [otlpSpanProcessor(env.OTEL_EXPORTER_OTLP_ENDPOINT)] }
      : {}),
  });

  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.log(`[otel] tracing enabled for "${service}" → ${env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  }
  if (env.SENTRY_DSN) {
    console.log(`[sentry] error reporting enabled for "${service}" (${env.SENTRY_ENVIRONMENT ?? env.NODE_ENV})`);
  }

  process.on("unhandledRejection", (reason) => captureError(reason, { kind: "unhandledRejection" }));
  process.on("uncaughtException", (err) => captureError(err, { kind: "uncaughtException" }));
}

/** Wrap an async unit of work in a real span (a no-op tracer if nothing is registered). */
export async function withSpan<T>(name: string, ctx: ObsContext, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer(service);
  return tracer.startActiveSpan(name, async (span: Span) => {
    try {
      for (const [k, v] of Object.entries(scrub(ctx))) {
        span.setAttribute(k, typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean));
      }
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw e;
    } finally {
      span.end();
    }
  });
}

export function captureError(err: unknown, ctx: ObsContext = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  const scrubbed = scrub(ctx);

  // Safe to call even with no DSN configured (or before initObservability
  // has run) — the SDK just no-ops rather than throwing.
  Sentry.captureException(e, { extra: scrubbed, tags: { service } });

  if (env.NODE_ENV !== "test") {
    console.error("[capture]", JSON.stringify({ service, level: "error", message: e.message, ...scrubbed, at: new Date().toISOString() }));
  }
}

/** Drop obviously-sensitive keys before anything leaves the process. */
function scrub(ctx: ObsContext): ObsContext {
  const out: ObsContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (/token|secret|password|pin|authorization|cookie/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}
