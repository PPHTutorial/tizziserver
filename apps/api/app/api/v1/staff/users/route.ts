import { z } from "zod";
import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ q: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).optional() });
export const GET = withApi({ auth: ["STAFF", "ADMIN"], query: Query }, async ({ query }) => admin.findUsers(query.q ?? "", query.limit ?? 20));
