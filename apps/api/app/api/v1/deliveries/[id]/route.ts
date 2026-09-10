import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx, params }) => delivery.getDeliveryForCustomer(ctx.principal!.userId, params.id!));

