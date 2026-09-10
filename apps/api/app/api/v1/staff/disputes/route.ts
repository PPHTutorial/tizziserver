import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: ["STAFF","ADMIN"], query: z.object({ status: z.enum(["OPEN","EVIDENCE","UNDER_REVIEW","RESOLVED","APPEALED","CLOSED"]).optional() }) }, async ({ query }) => trust.listStaffDisputes(query));

