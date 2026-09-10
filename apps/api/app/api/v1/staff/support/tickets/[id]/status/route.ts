import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["STAFF","ADMIN"], body: z.object({ status: z.enum(["OPEN","PENDING","RESOLVED","CLOSED"]) }) }, async ({ ctx, params, body }) => trust.setSupportTicketStatus(ctx.principal!.userId, params.id!, body.status));

