import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ courierId: z.string(), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(500).optional() });
export const POST = withApi({ auth: ["STAFF", "ADMIN"], body: Body, audit: "courier.kyc.review" }, async ({ ctx, body }) =>
  couriers.reviewCourierKyc(ctx.principal!.userId, body),
);

