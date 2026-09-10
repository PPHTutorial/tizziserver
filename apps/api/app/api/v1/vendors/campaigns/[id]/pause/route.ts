import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";

export const POST = withApi({ auth: "VENDOR", capability: "advertising", audit: "campaign.pause" }, async ({ ctx, params }) =>
  ads.pauseCampaign(ctx.principal!.userId, params.id!),
);
