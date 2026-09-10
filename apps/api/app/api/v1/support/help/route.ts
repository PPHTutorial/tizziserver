import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: false }, async () => trust.helpCenter());

