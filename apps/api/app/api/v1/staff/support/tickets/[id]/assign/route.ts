import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["STAFF","ADMIN"] }, async ({ ctx, params }) => trust.assignSupportTicket(ctx.principal!.userId, params.id!));

