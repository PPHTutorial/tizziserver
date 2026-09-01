import { z } from "zod";
import { platform as corePlatform } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Per-tenant capability + nav bootstrap. Works anonymous or authenticated. */
export const GET = withApi(
  { query: z.object({ region: z.string().optional() }) },
  async ({ ctx, query }) =>
    corePlatform.buildBootstrap({
      platformSlug: ctx.platform,
      regionCode: query.region,
      principal: ctx.principal
        ? { userId: ctx.principal.userId, activeRole: ctx.principal.activeRole, roles: ctx.principal.roles }
        : undefined,
    }),
);
