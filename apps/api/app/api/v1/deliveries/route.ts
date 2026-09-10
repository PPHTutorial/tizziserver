import { z } from "zod";
import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";

const List = z.object({ active: z.enum(["0", "1"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(50).optional() });
const Point = z.object({ lat: z.number(), lng: z.number(), address: z.record(z.string(), z.unknown()).optional(), contactName: z.string().max(120).optional(), contactPhone: z.string().max(24).optional() });
const Create = z.object({
  pickup: Point,
  dropoff: Point,
  items: z.array(z.object({ description: z.string().min(1).max(200), qty: z.number().int().positive().max(50).optional(), valueMinor: z.number().int().nonnegative().optional(), fragile: z.boolean().optional() })).max(20).optional(),
  vehicleType: z.enum(["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK", "OTHER"]).optional(),
  scheduledFor: z.string().datetime().optional(),
});

export const GET = withApi({ auth: true, capability: "delivery.live_tracking", query: List }, async ({ ctx, query }) =>
  delivery.listCustomerDeliveries(ctx.principal!.userId, { active: query.active === "1", cursor: query.cursor, limit: query.limit }),
);

export const POST = withApi({ auth: true, capability: "delivery.live_tracking", idempotent: true, body: Create, audit: "delivery.create" }, async ({ ctx, body }) => {
  const res = await delivery.createDelivery({
    platformSlug: ctx.platform,
    sourceType: "ADHOC",
    sourceId: ctx.principal!.userId,
    customerId: ctx.principal!.userId,
    pickup: { lat: body.pickup.lat, lng: body.pickup.lng, address: body.pickup.address ?? {}, contact: { name: body.pickup.contactName, phone: body.pickup.contactPhone } },
    dropoff: { lat: body.dropoff.lat, lng: body.dropoff.lng, address: body.dropoff.address ?? {}, contact: { name: body.dropoff.contactName, phone: body.dropoff.contactPhone } },
    items: body.items,
    vehicleType: body.vehicleType,
    scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
    payment: { method: "wallet", userId: ctx.principal!.userId },
  });
  return res.delivery;
});

