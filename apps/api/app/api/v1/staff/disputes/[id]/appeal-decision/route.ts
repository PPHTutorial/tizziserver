import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["STAFF","ADMIN"], body: z.object({ decision: z.enum(["UPHELD","DENIED"]), notes: z.string().max(2000).optional() }), audit: "dispute.appeal.decide" }, async ({ ctx, params, body }) => trust.decideAppeal(ctx.principal!.userId, params.id!, body.decision, body.notes));

