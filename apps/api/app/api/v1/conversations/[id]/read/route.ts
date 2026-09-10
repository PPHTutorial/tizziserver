import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true }, async ({ ctx, params }) => comms.markConversationRead(ctx.principal!.userId, params.id!));

