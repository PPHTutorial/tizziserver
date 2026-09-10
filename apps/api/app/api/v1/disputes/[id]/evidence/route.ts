import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ kind: z.enum(["TEXT","IMAGE","DOC"]).optional(), fileKey: z.string().max(300).optional(), body: z.string().max(2000).optional() });
export const POST = withApi({ auth: true, body: Body }, async ({ ctx, params, body }) => trust.addDisputeEvidence(ctx.principal!.userId, params.id!, body));

