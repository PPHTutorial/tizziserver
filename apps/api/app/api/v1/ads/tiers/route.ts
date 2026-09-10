import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
/** Active boost / ad tiers for this platform (backend-editable). */
export const GET = withApi({ auth: true, capability: "advertising" }, async ({ ctx }) => ads.listBoostTiers(ctx.platform));
