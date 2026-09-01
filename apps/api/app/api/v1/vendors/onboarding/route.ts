import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
  business: z.object({
    legalName: z.string().min(2).max(120),
    regNumber: z.string().max(60).optional(),
    phone: z.string().max(24).optional(),
    email: z.string().email().optional(),
    addressLine: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    country: z.string().max(2).optional(),
  }),
});

/** Register (or update) the caller as a vendor and open a KYC case. */
export const POST = withApi(
  { body: Body, auth: true, rateLimit: { limit: 5, windowSec: 60, by: "principal" }, audit: "vendor.onboarding" },
  async ({ body, ctx }) =>
    catalog.startVendorOnboarding({
      userId: ctx.principal!.userId,
      platformSlug: ctx.platform,
      displayName: body.displayName,
      bio: body.bio,
      business: body.business,
    }),
);
