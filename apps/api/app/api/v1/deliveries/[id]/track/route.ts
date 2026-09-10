import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx, params }) => delivery.getDeliveryTrack(params.id!, ctx.principal!.userId));

