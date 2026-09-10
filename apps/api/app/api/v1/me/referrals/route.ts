import { referrals } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx }) => referrals.getMyReferral(ctx.principal!.userId));
