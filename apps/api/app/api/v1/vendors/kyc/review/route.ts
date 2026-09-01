import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * Mock KYC reviewer — STAFF/ADMIN flip a vendor's case. In production this is a
 * STAFF console screen (§24); here it unblocks the vendor demo flow.
 */
export const POST = withApi(
  {
    body: z.object({
      vendorId: z.string().min(6),
      decision: z.enum(["APPROVED", "REJECTED"]),
      note: z.string().max(500).optional(),
    }),
    auth: ["STAFF", "ADMIN"],
    audit: "vendor.kyc.review",
  },
  async ({ body, ctx }) =>
    catalog.reviewVendorKyc(body.vendorId, body.decision, body.note, ctx.principal!.userId),
);
