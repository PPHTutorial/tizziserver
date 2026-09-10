import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  phoneVerified: z.boolean().optional(),
  agreementAccepted: z.boolean().optional(),
});
export const POST = withApi({ auth: true, body: Body, audit: "courier.onboarding" }, async ({ ctx, body }) =>
  couriers.startCourierOnboarding({
    userId: ctx.principal!.userId,
    platformSlug: ctx.platform,
    firstName: body.firstName,
    lastName: body.lastName,
    phoneVerified: body.phoneVerified,
    agreementAcceptedAt: body.agreementAccepted ? new Date() : undefined,
  }),
);

