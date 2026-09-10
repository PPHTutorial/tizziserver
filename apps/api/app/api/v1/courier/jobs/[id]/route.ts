import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: "COURIER" }, async ({ ctx, params }) => couriers.getJobDetail(ctx.principal!.userId, params.id!));

