/**
 * Emit openapi.json from the route registry using Zod v4's native JSON Schema.
 * Phase 1 swaps in a full generator (paths params, security schemes, examples)
 * and a `dart` client generation step.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { routes, type RouteContract } from "../src/routes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../openapi.json");
mkdirSync(dirname(out), { recursive: true });

const paths: Record<string, unknown> = {};
for (const r of Object.values(routes) as RouteContract[]) {
  const op: Record<string, unknown> = {
    summary: r.summary,
    tags: r.tags,
    security: r.auth ? [{ bearerAuth: [] }] : [],
    responses: {
      "200": {
        description: "OK",
        content: {
          "application/json": { schema: z.toJSONSchema(r.response, { target: "openapi-3.0" }) },
        },
      },
    },
  };
  if (r.body) {
    op.requestBody = {
      required: true,
      content: { "application/json": { schema: z.toJSONSchema(r.body, { target: "openapi-3.0" }) } },
    };
  }
  paths[r.path] ??= {};
  (paths[r.path] as Record<string, unknown>)[r.method.toLowerCase()] = op;
}

const doc = {
  openapi: "3.0.3",
  info: { title: "GrandPrice API", version: "0.0.0-phase0" },
  servers: [{ url: "http://localhost:3000" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
  },
  paths,
};

writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`contracts: wrote ${out} (${Object.keys(paths).length} paths)`);
