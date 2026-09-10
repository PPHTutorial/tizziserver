import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ type: z.string().min(2).max(40), fileKey: z.string().min(1).max(300), expiresAt: z.string().datetime().optional() });
export const POST = withApi({ auth: true, body: Body }, async ({ ctx, params, body }) =>
  couriers.addVehicleDocument(ctx.principal!.userId, params.id!, { type: body.type, fileKey: body.fileKey, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined }),
);

