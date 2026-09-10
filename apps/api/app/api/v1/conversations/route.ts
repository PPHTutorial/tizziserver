import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx }) => comms.listConversations(ctx.principal!.userId));

