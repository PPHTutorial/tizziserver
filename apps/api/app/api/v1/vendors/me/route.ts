import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** The caller's vendor onboarding + KYC status (+ current shop profile fields). */
export const GET = withApi({ auth: true }, async ({ ctx }) =>
  catalog.vendorKycStatus(ctx.principal!.userId),
);

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const Body = z.object({
  displayName: z.string().min(2).max(80).optional(),
  bio: z.string().max(500).optional(),
  logo: z.string().max(500).optional(),
  banner: z.string().max(500).optional(),
  themeColors: z.array(HexColor).min(3).max(7).optional(),
  services: z.array(z.string().min(1).max(40)).max(20).optional(),
});

/** "Edit shop profile" — name/bio/logo/banner only, no KYC/business side-effects. */
export const PATCH = withApi(
  { body: Body, auth: true, audit: "vendor.profile.update" },
  async ({ body, ctx }) => catalog.updateMyVendorProfile(ctx.principal!.userId, body),
);
