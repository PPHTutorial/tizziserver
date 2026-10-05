import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  // Comma-separated brand names — a product grid resolves its distinct
  // brands in one round trip instead of one request per card. Bounded so one
  // anonymous request can't fan out into hundreds of Brandfetch calls.
  names: z
    .string()
    .min(1)
    .max(2000)
    .transform((s) => s.split(",").map((n) => n.trim()).filter(Boolean))
    .refine((a) => a.length <= 60, { message: "At most 60 brand names per request" })
    .refine((a) => a.every((n) => n.length <= 80), { message: "Brand names are at most 80 characters" }),
});

/** Brand name(s) → logo URL, via the curated map / Brandfetch cache
 * (`catalog.resolveBrandLogos`). Public (no auth) — same as other catalog
 * read endpoints; never touches the Brandfetch API key client-side. */
export const GET = withApi(
  { query: Query, rateLimit: { limit: 120, windowSec: 60, by: "ip" } },
  async ({ query }) => ({ items: await catalog.resolveBrandLogos(query.names) }),
);
