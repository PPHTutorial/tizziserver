import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: ["STAFF","ADMIN"] }, async ({ params }) => trust.getKycCase(params.id!));

