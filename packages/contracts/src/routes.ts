import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * The API contract registry. Phase 1+ adds real routes (auth, catalog, …);
 * `scripts/build-openapi.ts` turns this into openapi.json and, later, a Dart client.
 */
export interface RouteContract {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  tags: string[];
  auth: boolean;
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  response: z.ZodTypeAny;
}

export const HealthResponse = ok(
  z.object({
    service: z.string(),
    version: z.string(),
    env: z.string(),
    ts: z.string(),
  }),
);

export const BootstrapResponse = ok(
  z.object({
    platform: z.string(),
    features: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
    nav: z.array(z.object({ key: z.string(), label: z.string(), icon: z.string() })),
    minAppVersion: z.string(),
  }),
);

export const routes = {
  health: {
    method: "GET",
    path: "/api/v1/health",
    summary: "Liveness + build info",
    tags: ["system"],
    auth: false,
    response: HealthResponse,
  },
  configBootstrap: {
    method: "GET",
    path: "/api/v1/config/bootstrap",
    summary: "Per-platform capability + nav bootstrap for a client on launch",
    tags: ["system"],
    auth: false,
    response: BootstrapResponse,
  },
} satisfies Record<string, RouteContract>;

export type Routes = typeof routes;
