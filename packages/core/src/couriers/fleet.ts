/**
 * Courier fleet + coverage — vehicles (+ docs), service areas, weekly
 * availability. Vehicle/doc approval is a mock reviewer in dev.
 */
import { prisma, type VehicleKind } from "@stall/db";
import { AppError } from "../errors.ts";

async function courierFor(userId: string) {
  const c = await prisma.courierProfile.findUnique({ where: { userId } });
  if (!c) throw new AppError("FORBIDDEN", "Complete courier onboarding first");
  return c;
}

// --- vehicles --------------------------------------------------------

export interface VehicleInput {
  type: VehicleKind;
  make?: string;
  model?: string;
  color?: string;
  plate?: string;
  year?: number;
  photos?: string[];
}

export async function addVehicle(userId: string, input: VehicleInput) {
  const courier = await courierFor(userId);
  const v = await prisma.courierVehicle.create({
    data: {
      courierId: courier.id,
      type: input.type,
      make: input.make,
      model: input.model,
      color: input.color,
      plate: input.plate,
      year: input.year,
      photos: input.photos ?? [],
      status: "PENDING",
    },
  });
  if (!courier.activeVehicleId) {
    await prisma.courierProfile.update({ where: { id: courier.id }, data: { activeVehicleId: v.id } });
  }
  return { id: v.id, status: v.status };
}

export async function updateVehicle(userId: string, vehicleId: string, input: Partial<VehicleInput>) {
  const courier = await courierFor(userId);
  const v = await prisma.courierVehicle.findFirst({ where: { id: vehicleId, courierId: courier.id } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found");
  await prisma.courierVehicle.update({
    where: { id: vehicleId },
    data: {
      type: input.type,
      make: input.make,
      model: input.model,
      color: input.color,
      plate: input.plate,
      year: input.year,
      photos: input.photos,
      // any change re-opens review
      status: "PENDING",
    },
  });
  return { id: vehicleId, status: "PENDING" as const };
}

export async function removeVehicle(userId: string, vehicleId: string) {
  const courier = await courierFor(userId);
  const v = await prisma.courierVehicle.findFirst({ where: { id: vehicleId, courierId: courier.id } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found");
  await prisma.courierVehicle.delete({ where: { id: vehicleId } });
  if (courier.activeVehicleId === vehicleId) {
    const next = await prisma.courierVehicle.findFirst({ where: { courierId: courier.id }, orderBy: { createdAt: "asc" } });
    await prisma.courierProfile.update({ where: { id: courier.id }, data: { activeVehicleId: next?.id ?? null } });
  }
  return { deleted: true };
}

export async function setActiveVehicle(userId: string, vehicleId: string) {
  const courier = await courierFor(userId);
  const v = await prisma.courierVehicle.findFirst({ where: { id: vehicleId, courierId: courier.id } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found");
  if (v.status !== "APPROVED") throw new AppError("CONFLICT", "That vehicle isn't approved yet");
  await prisma.courierProfile.update({ where: { id: courier.id }, data: { activeVehicleId: vehicleId } });
  return { activeVehicleId: vehicleId };
}

export async function addVehicleDocument(userId: string, vehicleId: string, input: { type: string; fileKey: string; expiresAt?: Date }) {
  const courier = await courierFor(userId);
  const v = await prisma.courierVehicle.findFirst({ where: { id: vehicleId, courierId: courier.id } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found");
  const doc = await prisma.courierVehicleDocument.create({
    data: { vehicleId, type: input.type, fileKey: input.fileKey, expiresAt: input.expiresAt, status: "PENDING" },
  });
  return { id: doc.id, status: doc.status };
}

/** STAFF/ADMIN mock: approve or reject a vehicle. */
export async function reviewVehicle(reviewerId: string, input: { vehicleId: string; decision: "APPROVE" | "REJECT"; note?: string }) {
  const v = await prisma.courierVehicle.findUnique({ where: { id: input.vehicleId } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found");
  const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  await prisma.$transaction([
    prisma.courierVehicle.update({ where: { id: v.id }, data: { status } }),
    prisma.courierVehicleDocument.updateMany({ where: { vehicleId: v.id }, data: { status } }),
    prisma.auditLog.create({ data: { actorId: reviewerId, actorType: "USER", action: "courier.vehicle.review", targetType: "CourierVehicle", targetId: v.id, after: { status, note: input.note } } }),
  ]);
  return { vehicleId: v.id, status };
}

// --- service areas -------------------------------------------------

export interface ServiceAreaInput {
  name: string;
  centerLat: number;
  centerLng: number;
  radiusM: number;
  polygon?: number[][][];
  enabled?: boolean;
}

export async function upsertServiceArea(userId: string, input: ServiceAreaInput & { id?: string }) {
  const courier = await courierFor(userId);
  const data = {
    courierId: courier.id,
    name: input.name,
    centerLat: input.centerLat,
    centerLng: input.centerLng,
    radiusM: input.radiusM,
    enabled: input.enabled ?? true,
  };
  const row = input.id
    ? await (async () => {
        const found = await prisma.courierServiceArea.findFirst({ where: { id: input.id, courierId: courier.id } });
        if (!found) throw new AppError("NOT_FOUND", "Service area not found");
        return prisma.courierServiceArea.update({ where: { id: input.id }, data });
      })()
    : await prisma.courierServiceArea.create({ data });

  if (input.polygon) {
    await prisma.$executeRawUnsafe(
      `UPDATE "courier_service_areas" SET "area" = ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography WHERE "id" = $2`,
      JSON.stringify({ type: "Polygon", coordinates: input.polygon }),
      row.id,
    );
  }
  return { id: row.id };
}

export async function removeServiceArea(userId: string, id: string) {
  const courier = await courierFor(userId);
  const found = await prisma.courierServiceArea.findFirst({ where: { id, courierId: courier.id } });
  if (!found) throw new AppError("NOT_FOUND", "Service area not found");
  await prisma.courierServiceArea.delete({ where: { id } });
  return { deleted: true };
}

// --- availability -------------------------------------------------

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled?: boolean;
}

export async function setAvailability(userId: string, slots: AvailabilitySlot[]) {
  const courier = await courierFor(userId);
  await prisma.$transaction([
    prisma.courierAvailability.deleteMany({ where: { courierId: courier.id } }),
    ...slots.map((s) =>
      prisma.courierAvailability.create({
        data: { courierId: courier.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, enabled: s.enabled ?? true },
      }),
    ),
  ]);
  return { count: slots.length };
}
