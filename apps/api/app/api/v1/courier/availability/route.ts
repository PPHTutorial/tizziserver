import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Slot = z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), enabled: z.boolean().optional() });
const Body = z.object({ slots: z.array(Slot).max(7) });
export const PATCH = withApi({ auth: true, body: Body }, async ({ ctx, body }) => couriers.setAvailability(ctx.principal!.userId, body.slots));

