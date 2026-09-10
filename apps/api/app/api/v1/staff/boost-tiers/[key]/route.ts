import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
export const DELETE = withApi({ auth: ["ADMIN"], audit: "boost_tier.deactivate" }, async ({ params }) => ads.deactivateBoostTier(params.key!));
