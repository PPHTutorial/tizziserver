import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Doc = z.object({ type: z.enum(["ID_FRONT", "ID_BACK", "SELFIE", "PROOF_ADDRESS", "DRIVER_LICENSE", "OTHER"]), fileKey: z.string().min(1).max(300) });
const Body = z.object({ documents: z.array(Doc).min(1).max(10), selfieKey: z.string().min(1).max(300).optional() });
export const POST = withApi({ auth: true, body: Body, audit: "courier.kyc.submit" }, async ({ ctx, body }) =>
  couriers.submitCourierKyc(ctx.principal!.userId, body),
);

