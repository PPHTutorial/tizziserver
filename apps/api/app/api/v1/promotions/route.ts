import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Running promotions for the tenant (flash deals, campaigns, banners). */
export const GET = withApi(
  { query: z.object({ kind: z.enum(["FLASH_DEAL", "CAMPAIGN", "BANNER"]).optional() }) },
  async ({ ctx, query }) => ({
    items: await catalog.activePromotions({ platformSlug: ctx.platform, kind: query.kind }),
  }),
);
