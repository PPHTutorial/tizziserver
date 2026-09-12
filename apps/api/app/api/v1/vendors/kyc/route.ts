import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Doc = z.object({
  type: z.enum(["ID_FRONT", "ID_BACK", "SELFIE", "PROOF_ADDRESS", "BUSINESS_REG", "OTHER"]),
  fileKey: z.string().min(1).max(300),
});
const Body = z.object({ documents: z.array(Doc).min(1).max(10), selfieKey: z.string().min(1).max(300).optional() });

export const POST = withApi(
  { auth: true, body: Body, rateLimit: { limit: 5, windowSec: 60, by: "principal" }, audit: "vendor.kyc.submit" },
  async ({ ctx, body }) => catalog.submitVendorKyc(ctx.principal!.userId, body),
);
