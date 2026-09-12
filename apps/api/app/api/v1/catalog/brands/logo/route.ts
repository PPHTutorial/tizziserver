import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  // Comma-separated brand names — a product grid resolves its distinct
  // brands in one round trip instead of one request per card.
  names: z.string().min(1),
});

/** Brand name(s) → logo URL, via the curated map / Brandfetch cache
 * (`catalog.resolveBrandLogos`). Public (no auth) — same as other catalog
 * read endpoints; never touches the Brandfetch API key client-side. */
export const GET = withApi({ query: Query }, async ({ query }) => ({
  items: await catalog.resolveBrandLogos(query.names.split(",")),
}));
