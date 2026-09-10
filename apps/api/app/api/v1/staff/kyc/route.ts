import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ status: z.enum(["PENDING","IN_REVIEW","APPROVED","REJECTED"]).optional(), subjectType: z.enum(["VENDOR","COURIER","USER"]).optional() });
export const GET = withApi({ auth: ["STAFF","ADMIN"], query: Query }, async ({ query }) => trust.listKycQueue(query));

