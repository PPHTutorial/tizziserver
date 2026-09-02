import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** One payload for the customer home screen: promo rails + product rails. */
export const GET = withApi({}, async ({ ctx }) =>
  catalog.homeRails({ platformSlug: ctx.platform, userId: ctx.principal?.userId }),
);
