import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true }, async ({ ctx }) => trust.safetyCenter(ctx.principal!.userId));

