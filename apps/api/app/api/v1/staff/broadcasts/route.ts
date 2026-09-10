import { z } from "zod";
import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(1000),
  templateKey: z.string().optional(),
  audience: z.object({
    roles: z.array(z.string()).optional(),
    platformSlugs: z.array(z.string()).optional(),
    hasOrdered: z.boolean().optional(),
    userIds: z.array(z.string()).optional(),
  }),
  scheduledFor: z.coerce.date().optional(),
  sendNow: z.boolean().optional(),
});
export const GET = withApi({ auth: ["STAFF", "ADMIN"] }, async () => admin.listBroadcasts());
export const POST = withApi({ auth: ["ADMIN"], body: Body, audit: "broadcast.compose" }, async ({ ctx, body }) =>
  admin.composeBroadcast({ createdById: ctx.principal!.userId, ...body }),
);
