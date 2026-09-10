import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ payment: z.object({ method: z.enum(["wallet", "gateway"]), gateway: z.string().optional() }) });
export const POST = withApi({ auth: "VENDOR", capability: "advertising", body: Body, idempotent: true, audit: "campaign.submit" }, async ({ ctx, params, body }) =>
  ads.submitCampaign(ctx.principal!.userId, params.id!, body.payment),
);
