import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx }) => couriers.courierDashboard(ctx.principal!.userId));

