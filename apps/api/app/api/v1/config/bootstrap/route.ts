import type { NextRequest } from "next/server";
import { platform as corePlatform } from "@stall/core";
import { handle, ok } from "@/src/http/envelope";
import { getContext } from "@/src/http/context";

/** Per-tenant capability + nav bootstrap. Works anonymous or authenticated. */
export const GET = handle(async (req: NextRequest) => {
  const ctx = await getContext(req);
  const regionCode = req.nextUrl.searchParams.get("region") ?? undefined;

  const payload = await corePlatform.buildBootstrap({
    platformSlug: ctx.platform,
    regionCode,
    principal: ctx.principal
      ? { userId: ctx.principal.userId, activeRole: ctx.principal.activeRole, roles: ctx.principal.roles }
      : undefined,
  });

  return ok(payload);
});
