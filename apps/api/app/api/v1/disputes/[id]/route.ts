import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx, params }) => trust.getDispute(ctx.principal!.userId, params.id!, ["STAFF","ADMIN"].includes(ctx.principal!.activeRole)));

