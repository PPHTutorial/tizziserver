import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
export const DELETE = withApi({ auth: true }, async ({ ctx, params }) => couriers.removeServiceArea(ctx.principal!.userId, params.id!));

