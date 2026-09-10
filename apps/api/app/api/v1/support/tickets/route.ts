import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  category: z.string().min(2).max(60),
  subject: z.string().min(3).max(160),
  body: z.string().min(3).max(4000),
  priority: z.enum(["LOW","NORMAL","HIGH","URGENT"]).optional(),
});
export const GET = withApi({ auth: true }, async ({ ctx }) => trust.listSupportTickets(ctx.principal!.userId));
export const POST = withApi({ auth: true, body: Body, audit: "support.ticket.create" }, async ({ ctx, body }) => trust.createSupportTicket(ctx.principal!.userId, body));

