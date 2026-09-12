import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * Phase 4 delivery + courier contract. Mirrors `@stall/core/{delivery,couriers,
 * maps}` and the `/api/v1/{deliveries,courier,vendors/deliveries,maps}` routes.
 * The Flutter client (`mobile/lib/api/`) is kept faithful to these shapes.
 */

export const VehicleKind = z.enum(["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK", "OTHER"]);
export const DeliveryStatus = z.enum([
  "REQUESTED",
  "SEARCHING_COURIER",
  "COURIER_ASSIGNED",
  "COURIER_EN_ROUTE_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_DROPOFF",
  "ARRIVED_DROPOFF",
  "DELIVERED",
  "COMPLETED",
  "FAILED_RECIPIENT_UNAVAILABLE",
  "REASSIGNING",
  "RESCHEDULED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_COURIER",
  "CANCELLED_BY_SYSTEM",
]);

const LatLng = z.object({ lat: z.number(), lng: z.number() });
const Endpoint = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.unknown().optional(),
  contact: z.unknown().optional(),
});

export const DeliveryCourier = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  avatar: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  completedDeliveries: z.number().int(),
  vehicle: z
    .object({ type: VehicleKind, make: z.string().nullable(), model: z.string().nullable(), color: z.string().nullable(), plate: z.string().nullable() })
    .nullable(),
});

export const DeliveryView = z.object({
  id: z.string(),
  code: z.string(),
  platformSlug: z.string(),
  sourceType: z.enum(["FULFILMENT", "AUCTION", "ADHOC"]),
  sourceId: z.string(),
  status: DeliveryStatus,
  active: z.boolean(),
  vehicleType: VehicleKind,
  distanceM: z.number().int(),
  durationS: z.number().int(),
  feeMinor: z.number().int(),
  courierPayoutMinor: z.number().int().optional(),
  tipMinor: z.number().int(),
  currency: z.string(),
  pickup: Endpoint,
  dropoff: Endpoint,
  items: z.array(z.object({ id: z.string(), description: z.string(), qty: z.number().int(), photoKey: z.string().nullable(), valueMinor: z.number().int().nullable(), fragile: z.boolean() })),
  courier: DeliveryCourier.nullable(),
  pickupVerification: z.object({ method: z.string(), verified: z.boolean(), packageCount: z.number().int().nullable(), photoKeys: z.array(z.string()) }).nullable(),
  dropoffVerification: z.object({ method: z.string(), verified: z.boolean(), recipientName: z.string().nullable() }).nullable(),
  proofOfDelivery: z.object({ photoKeys: z.array(z.string()), notes: z.string().nullable(), at: z.string() }).nullable(),
  pickupCode: z.string().optional(),
  dropoffCode: z.string().optional(),
  ratings: z.array(z.object({ role: z.string(), stars: z.number().int(), tags: z.array(z.string()), comment: z.string().nullable() })),
  scheduledFor: z.string().nullable(),
  assignedAt: z.string().nullable(),
  pickedUpAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  etaAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  reassignCount: z.number().int(),
  createdAt: z.string(),
  events: z.array(z.object({ type: z.string(), actorType: z.string(), at: z.string(), data: z.unknown().nullable(), lat: z.number().nullable(), lng: z.number().nullable() })),
});

export const DeliveryResponse = ok(DeliveryView);
export const DeliveriesResponse = ok(z.object({ items: z.array(DeliveryView), nextCursor: z.string().nullable() }));

export const DeliveryTrack = z.object({
  status: DeliveryStatus,
  etaAt: z.string().nullable(),
  pickup: LatLng,
  dropoff: LatLng,
  courier: z.object({ lat: z.number(), lng: z.number(), heading: z.number().nullable(), at: z.string() }).nullable(),
  /** Google-encoded polyline of the road route for the courier's current leg; null on the fallback / when finished. */
  routePolyline: z.string().nullable(),
  trail: z.array(z.object({ lat: z.number(), lng: z.number(), at: z.string() })),
  distanceRemainingM: z.number().int(),
});
export const DeliveryTrackResponse = ok(DeliveryTrack);

export const EstimateRequest = z.object({
  pickup: LatLng,
  dropoff: LatLng,
  vehicleType: VehicleKind.optional(),
});
export const EstimateResponse = ok(
  z.object({
    distanceM: z.number().int(),
    durationS: z.number().int(),
    polyline: z.string().nullable(),
    source: z.enum(["google", "haversine"]),
    feeMinor: z.number().int(),
    currency: z.string(),
  }),
);

export const CreateDeliveryRequest = z.object({
  pickup: z.object({ lat: z.number(), lng: z.number(), address: z.record(z.string(), z.unknown()).optional(), contactName: z.string().optional(), contactPhone: z.string().optional() }),
  dropoff: z.object({ lat: z.number(), lng: z.number(), address: z.record(z.string(), z.unknown()).optional(), contactName: z.string().optional(), contactPhone: z.string().optional() }),
  items: z.array(z.object({ description: z.string(), qty: z.number().int().positive().optional(), valueMinor: z.number().int().optional(), fragile: z.boolean().optional() })).optional(),
  vehicleType: VehicleKind.optional(),
  scheduledFor: z.string().datetime().optional(),
});

export const CancelRequest = z.object({ reason: z.string().optional() });
export const RateRequest = z.object({ stars: z.number().int().min(1).max(5), tags: z.array(z.string()).optional(), comment: z.string().optional() });
export const DisputeRequest = z.object({ category: z.string(), body: z.string(), evidence: z.unknown().optional() });
export const RescheduleRequest = z.object({ scheduledFor: z.string().datetime() });
export const OkTrue = ok(z.object({ ok: z.boolean() }));
export const IdStatusResponse = ok(z.object({ id: z.string(), status: z.string() }));
export const DeliveryIdStatusResponse = ok(z.object({ deliveryId: z.string(), status: z.string() }));

// --- courier ------------------------------------------------------

export const CourierMeResponse = ok(z.unknown());
export const CourierDashboardResponse = ok(z.unknown());
export const CourierPerformanceResponse = ok(z.unknown());

export const CourierOnboardingRequest = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phoneVerified: z.boolean().optional(),
  agreementAccepted: z.boolean().optional(),
});
export const CourierKycRequest = z.object({
  documents: z.array(z.object({ type: z.enum(["ID_FRONT", "ID_BACK", "SELFIE", "PROOF_ADDRESS", "DRIVER_LICENSE", "OTHER"]), fileKey: z.string() })).min(1),
  selfieKey: z.string().optional(),
});
export const CourierKycReviewRequest = z.object({ courierId: z.string(), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().optional() });

export const VehicleInput = z.object({
  type: VehicleKind,
  make: z.string().optional(),
  model: z.string().optional(),
  color: z.string().optional(),
  plate: z.string().optional(),
  year: z.number().int().optional(),
  photos: z.array(z.string()).optional(),
});
export const VehicleDocumentRequest = z.object({ type: z.string(), fileKey: z.string(), expiresAt: z.string().datetime().optional() });
export const VehicleReviewRequest = z.object({ vehicleId: z.string(), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().optional() });

export const ServiceAreaRequest = z.object({
  id: z.string().optional(),
  name: z.string(),
  centerLat: z.number(),
  centerLng: z.number(),
  radiusM: z.number().int().positive(),
  enabled: z.boolean().optional(),
});
export const AvailabilityRequest = z.object({
  slots: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string(), endTime: z.string(), enabled: z.boolean().optional() })),
});

export const OnlineRequest = LatLng;
export const HeartbeatRequest = z.object({ lat: z.number(), lng: z.number(), heading: z.number().optional(), speed: z.number().optional() });
export const OnlineResponse = ok(z.object({ onlineStatus: z.enum(["ONLINE", "OFFLINE"]) }));

export const JobCard = z.object({
  offerId: z.string(),
  deliveryId: z.string(),
  state: z.string(),
  payoutMinor: z.number().int(),
  currency: z.string(),
  pickupArea: z.string(),
  dropoffArea: z.string(),
  distanceM: z.number().int(),
  durationS: z.number().int(),
  vehicleType: VehicleKind,
  itemCount: z.number().int(),
  requirements: z.unknown().nullable(),
  expiresAt: z.string(),
  pickupDistanceM: z.number().int(),
});
export const JobsResponse = ok(z.object({ items: z.array(JobCard) }));
export const JobDetailResponse = ok(z.unknown());
export const OfferRespondRequest = z.object({ response: z.enum(["ACCEPTED", "DECLINED"]), reason: z.string().optional() });

export const AdvanceRequest = z.object({
  to: z.enum(["COURIER_EN_ROUTE_PICKUP", "ARRIVED_PICKUP", "PICKED_UP", "EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF", "DELIVERED", "COMPLETED"]),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export const VerifyPickupRequest = z.object({
  code: z.string().optional(),
  method: z.enum(["OTP", "QR", "PHOTO", "VENDOR_CONFIRM"]).optional(),
  packageCount: z.number().int().optional(),
  conditionNote: z.string().optional(),
  photoKeys: z.array(z.string()).optional(),
});
export const VerifyDropoffRequest = z.object({
  code: z.string().optional(),
  method: z.enum(["OTP", "QR", "SIGNATURE", "PHOTO"]).optional(),
  signatureKey: z.string().optional(),
  photoKeys: z.array(z.string()).optional(),
  recipientName: z.string().optional(),
});
export const PodRequest = z.object({ photoKeys: z.array(z.string()).min(1), notes: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() });
export const FailRequest = z.object({ reason: z.string(), photoKeys: z.array(z.string()).optional() });
export const CourierCancelRequest = z.object({ reason: z.string() });
export const BreadcrumbRequest = z.object({ lat: z.number(), lng: z.number(), heading: z.number().optional(), speed: z.number().optional(), accuracy: z.number().optional() });
export const BreadcrumbResponse = ok(z.object({ stored: z.boolean(), etaAt: z.string().nullable() }));

export const EarningsSummary = z.object({
  currency: z.string(),
  balanceMinor: z.number().int(),
  today: z.number().int(),
  week: z.number().int(),
  month: z.number().int(),
  lifetimeNetMinor: z.number().int(),
  deliveries: z.number().int(),
});
export const EarningsSummaryResponse = ok(EarningsSummary);
export const EarningsTxn = z.object({
  id: z.string(),
  kind: z.string(),
  grossMinor: z.number().int(),
  deductionMinor: z.number().int(),
  netMinor: z.number().int(),
  currency: z.string(),
  deliveryCode: z.string().nullable(),
  memo: z.string().nullable(),
  at: z.string(),
});
export const EarningsTxnsResponse = ok(z.object({ items: z.array(EarningsTxn), nextCursor: z.string().nullable() }));
export const PayoutRequest = z.object({ amountMinor: z.number().int().positive(), pin: z.string().min(4).max(6), payoutAccountId: z.string().optional() });
export const PayoutResponse = ok(z.object({ payoutId: z.string(), balanceMinor: z.number().int() }));
export const PayoutsResponse = ok(z.object({ items: z.array(z.object({ id: z.string(), amountMinor: z.number().int(), currency: z.string(), status: z.string(), at: z.string() })) }));

export const IdResponse = ok(z.object({ id: z.string() }));
export const DeletedResponse = ok(z.object({ deleted: z.boolean() }));
export const MutationResponse = ok(z.record(z.string(), z.unknown()));

export const RouteEstimateResponse = ok(
  z.object({ distanceM: z.number().int(), durationS: z.number().int(), polyline: z.string().nullable(), source: z.enum(["google", "haversine"]) }),
);
