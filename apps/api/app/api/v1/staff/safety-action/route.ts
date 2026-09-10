import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ targetType: z.string().min(2).max(40), targetId: z.string(), action: z.enum(["WARN","RESTRICT","SUSPEND","BAN","CLEAR"]), reason: z.string().min(3).max(500), expiresAt: z.string().datetime().optional() });
export const POST = withApi({ auth: ["ADMIN"], body: Body, audit: "safety.action" }, async ({ ctx, body }) => trust.applySafetyAction(ctx.principal!.userId, { ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined }));

