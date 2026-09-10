import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: "COURIER", audit: "courier.offline" }, async ({ ctx }) => couriers.goOffline(ctx.principal!.userId, ctx.platform));

