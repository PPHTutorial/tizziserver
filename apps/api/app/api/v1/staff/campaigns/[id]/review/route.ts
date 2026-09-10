import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ approve: z.boolean(), reason: z.string().max(400).optional() });
export const POST = withApi({ auth: ["STAFF", "ADMIN"], body: Body, audit: "campaign.review" }, async ({ ctx, body, params }) =>
  ads.reviewCampaign(ctx.principal!.userId, params.id!, body),
);
