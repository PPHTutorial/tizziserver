import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["ADMIN"], body: z.object({ outcome: z.string().min(3).max(500), notes: z.string().max(2000).optional(), refundMinor: z.number().int().nonnegative().optional() }), audit: "dispute.resolve" }, async ({ ctx, params, body }) => trust.resolveDispute(ctx.principal!.userId, params.id!, body));

