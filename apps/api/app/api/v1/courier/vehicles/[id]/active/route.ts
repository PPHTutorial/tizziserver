import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true }, async ({ ctx, params }) => couriers.setActiveVehicle(ctx.principal!.userId, params.id!));

