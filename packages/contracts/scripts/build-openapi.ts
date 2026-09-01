/**
 * Emit openapi.json from the route registry using Zod v4's native JSON Schema.
 * Covers: real paths, query params, bearer security, request bodies, the success
 * envelope, and the standard error envelope for 400/401/403/404/429.
 *
 * The Flutter client is hand-written (`mobile/lib/api/`) and kept faithful to
 * these same schemas; swap in an `openapi-generator` step here if it earns its
 * keep.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { routes, type RouteContract } from "../src/routes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../openapi.json");
mkdirSync(dirname(out), { recursive: true });

const toSchema = (s: z.ZodTypeAny) => z.toJSONSchema(s, { target: "openapi-3.0", io: "output" });

const ERROR_ENVELOPE = {
  type: "object",
  properties: {
    ok: { type: "boolean", enum: [false] },
    data: { type: "object", nullable: true, enum: [null] },
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
      },
      required: ["code", "message"],
    },
  },
  required: ["ok", "error"],
} as const;

const ERROR_NAMES: Record<number, string> = {
  400: "Validation failed",
  401: "Unauthenticated / token rejected",
  403: "Forbidden / feature disabled",
  404: "Not found",
  409: "Conflict (idempotency / reuse)",
  429: "Rate limited",
};

function errorResponses(codes: number[]) {
  const seen = new Set(codes);
  const responses: Record<string, unknown> = {};
  for (const code of [...seen].sort()) {
    responses[String(code)] = {
      description: ERROR_NAMES[code] ?? "Error",
      content: { "application/json": { schema: ERROR_ENVELOPE } },
    };
  }
  return responses;
}

/** Turn a ZodObject query schema into OpenAPI `parameters`. */
function queryParams(query: z.ZodTypeAny): unknown[] {
  const json = toSchema(query) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  if (!json.properties) return [];
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties).map(([name, schema]) => ({
    name,
    in: "query",
    required: required.has(name),
    schema,
  }));
}

const paths: Record<string, Record<string, unknown>> = {};

for (const [opId, r] of Object.entries(routes) as [string, RouteContract][]) {
  const errs = new Set<number>(r.errors ?? []);
  errs.add(400);
  if (r.auth) errs.add(401);

  const op: Record<string, unknown> = {
    operationId: opId,
    summary: r.summary,
    tags: r.tags,
    security: r.auth ? [{ bearerAuth: [] }] : [],
    responses: {
      "200": {
        description: "OK",
        content: { "application/json": { schema: toSchema(r.response) } },
      },
      ...errorResponses([...errs]),
    },
  };

  if (r.query) op.parameters = queryParams(r.query);
  if (r.idempotent) {
    op.parameters = [
      ...((op.parameters as unknown[]) ?? []),
      { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } },
    ];
  }
  if (r.body) {
    op.requestBody = {
      required: true,
      content: { "application/json": { schema: toSchema(r.body) } },
    };
  }

  paths[r.path] ??= {};
  paths[r.path]![r.method.toLowerCase()] = op;
}

const doc = {
  openapi: "3.0.3",
  info: {
    title: "Stall API",
    version: "0.1.0-phase1",
    description: "Phase 1 surface: identity, sessions, per-platform capability bootstrap.",
  },
  servers: [
    { url: "http://localhost:3000", description: "local dev" },
    { url: "https://api.stall.example", description: "placeholder prod" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    parameters: {
      XPlatform: {
        name: "X-Platform",
        in: "header",
        required: false,
        description: "Tenant slug (grandprice | tizzi-gas). Defaults server-side.",
        schema: { type: "string" },
      },
      XDeviceId: {
        name: "X-Device-Id",
        in: "header",
        required: false,
        schema: { type: "string" },
      },
    },
  },
  paths,
};

writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(
  `contracts: wrote ${out} (${Object.keys(paths).length} paths, ${Object.keys(routes).length} operations)`,
);
