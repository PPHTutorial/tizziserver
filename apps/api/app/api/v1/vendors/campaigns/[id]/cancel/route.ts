import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";

export const POST = withApi({ auth: "VENDOR", capability: "advertising", audit: "campaign.cancel" }, async ({ ctx, params }) =>
  ads.cancelCampaign(ctx.principal!.userId, params.id!),
);
