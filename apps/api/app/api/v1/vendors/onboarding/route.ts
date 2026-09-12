import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const Body = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
  logo: z.string().max(500).optional(),
  banner: z.string().max(500).optional(),
  themeColors: z.array(HexColor).min(3).max(7).optional(),
  services: z.array(z.string().min(1).max(40)).max(20).optional(),
  business: z.object({
    legalName: z.string().min(2).max(120),
    regNumber: z.string().max(60).optional(),
    phone: z.string().max(24).optional(),
    email: z.string().email().optional(),
    addressLine: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    region: z.string().max(80).optional(),
    country: z.string().max(2).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
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
      logo: body.logo,
      banner: body.banner,
      themeColors: body.themeColors,
      services: body.services,
      business: body.business,
    }),
);
