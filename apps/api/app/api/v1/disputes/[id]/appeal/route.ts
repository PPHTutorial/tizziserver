import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true, body: z.object({ body: z.string().min(3).max(2000) }), audit: "dispute.appeal" }, async ({ ctx, params, body }) => trust.appealDispute(ctx.principal!.userId, params.id!, body.body));

