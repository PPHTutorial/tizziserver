import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";

export const POST = withApi(
  { auth: true, body: z.object({ password: z.string().min(8).max(128) }), audit: "auth.password.set" },
  async ({ body, ctx }) => {
    await coreAuth.setPassword(ctx.principal!.userId, body.password);
    return { set: true };
  },
);
