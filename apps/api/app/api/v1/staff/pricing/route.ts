import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: ["STAFF", "ADMIN"] }, async () => admin.listPricing());
