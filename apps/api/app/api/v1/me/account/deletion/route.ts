import { z } from "zod";
import { privacy } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi({ auth: true }, async ({ ctx }) => privacy.getAccountDeletionStatus(ctx.principal!.userId));

export const POST = withApi(
  { auth: true, body: z.object({ reason: z.string().max(500).optional() }), rateLimit: { limit: 5, windowSec: 3600, by: "principal" }, audit: "account.deletion_request" },
  async ({ ctx, body }) => privacy.requestAccountDeletion(ctx.principal!.userId, body.reason),
);

export const DELETE = withApi({ auth: true, audit: "account.deletion_cancel" }, async ({ ctx }) =>
  privacy.cancelAccountDeletion(ctx.principal!.userId),
);
