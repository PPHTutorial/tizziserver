import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

/** Search-as-you-type brand suggestions (`catalog.searchBrandCandidates`,
 * Brandfetch-backed). Public (no auth) — same as `catalog/brands/logo`,
 * never touches the Brandfetch API key client-side. */
export const GET = withApi({ query: Query }, async ({ query }) => ({
  items: await catalog.searchBrandCandidates(query.q, query.limit ?? 10),
}));
