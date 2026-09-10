import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["STAFF","ADMIN"], body: z.object({ decision: z.enum(["APPROVE","REJECT","RESUBMIT"]), note: z.string().max(500).optional() }), audit: "kyc.review" }, async ({ ctx, params, body }) => trust.reviewKycCase(ctx.principal!.userId, params.id!, body.decision, body.note));

