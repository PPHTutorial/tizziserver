import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["STAFF","ADMIN"], audit: "dispute.assign" }, async ({ ctx, params }) => trust.assignDispute(ctx.principal!.userId, params.id!));

