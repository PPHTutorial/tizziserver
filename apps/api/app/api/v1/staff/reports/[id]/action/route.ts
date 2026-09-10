import { z } from "zod";
import { trust, AppError } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  status: z.enum(["OPEN","REVIEWING","ACTIONED","DISMISSED"]),
  note: z.string().max(500).optional(),
  safetyAction: z.object({ targetUserId: z.string(), action: z.enum(["WARN","RESTRICT","SUSPEND","BAN","CLEAR"]), reason: z.string().min(3).max(500), expiresAt: z.string().datetime().optional() }).optional(),
});
export const POST = withApi({ auth: ["STAFF","ADMIN"], body: Body, audit: "report.action" }, async ({ ctx, params, body }) => {
  // A plain status change is routine STAFF triage, but a bundled safetyAction
  // (WARN..BAN) is the same high-impact lever as /staff/safety-action — ADMIN only.
  if (body.safetyAction && !ctx.principal!.roles.includes("ADMIN")) {
    throw new AppError("FORBIDDEN", "Applying a safety action requires the ADMIN role");
  }
  return trust.actionReport(ctx.principal!.userId, params.id!, {
    ...body,
    safetyAction: body.safetyAction ? { ...body.safetyAction, expiresAt: body.safetyAction.expiresAt ? new Date(body.safetyAction.expiresAt) : undefined } : undefined,
  });
});

