import { privacy } from "@stall/core";
import { withApi } from "@/src/http/route";

/** GDPR data portability — a full JSON bundle of the caller's data. */
export const GET = withApi({ auth: true, rateLimit: { limit: 3, windowSec: 3600, by: "principal" }, audit: "account.data_export" }, async ({ ctx }) =>
  privacy.exportMyData(ctx.principal!.userId),
);
