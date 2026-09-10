import { z } from "zod";
import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx }) => comms.listBlocks(ctx.principal!.userId));
export const POST = withApi({ auth: true, body: z.object({ targetUserId: z.string() }), audit: "user.block" }, async ({ ctx, body }) => comms.blockUser(ctx.principal!.userId, body.targetUserId));

