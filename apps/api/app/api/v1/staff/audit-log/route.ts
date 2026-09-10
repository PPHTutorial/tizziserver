import { z } from "zod";
import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ actorId: z.string().optional(), action: z.string().optional(), targetId: z.string().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).optional() });
export const GET = withApi({ auth: ["STAFF", "ADMIN"], query: Query }, async ({ query }) => admin.auditLog(query));
