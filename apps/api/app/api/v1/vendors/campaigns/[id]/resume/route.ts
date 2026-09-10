import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";

export const POST = withApi({ auth: "VENDOR", capability: "advertising", audit: "campaign.resume" }, async ({ ctx, params }) =>
  ads.resumeCampaign(ctx.principal!.userId, params.id!),
);
