import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

export const DELETE = withApi(
  { auth: true, audit: "payments.method.remove" },
  async ({ ctx, params }) => payments.removePaymentMethod(ctx.principal!.userId, params.id!),
);
