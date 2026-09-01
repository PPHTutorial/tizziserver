import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** The caller's vendor onboarding + KYC status. */
export const GET = withApi({ auth: true }, async ({ ctx }) =>
  catalog.vendorKycStatus(ctx.principal!.userId),
);
