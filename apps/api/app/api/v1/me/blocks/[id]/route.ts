import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
export const DELETE = withApi({ auth: true }, async ({ ctx, params }) => comms.unblockUser(ctx.principal!.userId, params.id!));

