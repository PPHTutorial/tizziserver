import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: "VENDOR" }, async ({ ctx, params }) => delivery.getDeliveryForVendor(ctx.principal!.userId, params.id!));

