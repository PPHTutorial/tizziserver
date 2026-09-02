import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Product-performance stub for the seller dashboard (MD §25). */
export const GET = withApi({ auth: "VENDOR" }, async ({ ctx }) =>
  catalog.vendorStats(ctx.principal!.userId),
);
