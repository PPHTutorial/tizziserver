import { z } from "zod";
import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi({ auth: true }, async ({ ctx }) => ({
  items: await payments.listPaymentMethods(ctx.principal!.userId),
}));

const AddBody = z.object({
  gateway: z.string().max(24),
  token: z.string().min(4).max(200),
  brand: z.string().max(24).optional(),
  last4: z.string().length(4).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2024).max(2099).optional(),
  makeDefault: z.boolean().optional(),
});

export const POST = withApi(
  { auth: true, body: AddBody, audit: "payments.method.add" },
  async ({ ctx, body }) => payments.addPaymentMethod(ctx.principal!.userId, body),
);
