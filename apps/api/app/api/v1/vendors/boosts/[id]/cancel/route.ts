import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: "VENDOR", capability: "advertising", audit: "boost.cancel" }, async ({ ctx, params }) =>
  ads.cancelBoost(ctx.principal!.userId, params.id!),
);
