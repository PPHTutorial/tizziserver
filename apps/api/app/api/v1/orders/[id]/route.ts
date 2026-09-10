import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi({ auth: true }, async ({ ctx, params }) =>
  commerce.getOrder(ctx.principal!.userId, params.id!),
);
