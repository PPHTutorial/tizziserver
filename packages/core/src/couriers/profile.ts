/**
 * Courier onboarding + unified KYC (reuses `KycCase` / `KycDocument` /
 * `LivenessCheck`). A mock reviewer (STAFF/ADMIN) flips the case in dev; the
 * full review console + provider hooks are Phase 6.
 */
import { prisma, type Prisma, type KycDocKind } from "@stall/db";
import { AppError } from "../errors.ts";

export interface CourierOnboardingInput {
  userId: string;
  platformSlug: string;
  firstName?: string;
  lastName?: string;
  phoneVerified?: boolean;
  agreementAcceptedAt?: Date;
}

export async function startCourierOnboarding(input: CourierOnboardingInput) {
  const existing = await prisma.courierProfile.findUnique({ where: { userId: input.userId } });
  const courier =
    existing ??
    (await prisma.courierProfile.create({
      data: { userId: input.userId, status: "PENDING", onlineStatus: "OFFLINE" },
    }));

  if (input.firstName || input.lastName) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { firstName: input.firstName ?? undefined, lastName: input.lastName ?? undefined },
    });
  }

  await prisma.userRole.upsert({
    where: { userId_role: { userId: input.userId, role: "COURIER" } },
    create: { userId: input.userId, role: "COURIER", status: "PENDING", kycStatus: "PENDING" },
    update: { kycStatus: "PENDING" },
  });

  const kyc = await prisma.kycCase.upsert({
    where: { subjectType_subjectId: { subjectType: "COURIER", subjectId: courier.id } },
    create: {
      subjectType: "COURIER",
      subjectId: courier.id,
      level: "FULL",
      status: "PENDING",
      platformSlug: input.platformSlug,
      fields: { agreementAcceptedAt: input.agreementAcceptedAt?.toISOString(), phoneVerified: !!input.phoneVerified },
    },
    update: {
      fields: { agreementAcceptedAt: input.agreementAcceptedAt?.toISOString(), phoneVerified: !!input.phoneVerified },
    },
  });

  return { courierId: courier.id, status: courier.status, kycStatus: kyc.status };
}

async function courierFor(userId: string) {
  const c = await prisma.courierProfile.findUnique({ where: { userId } });
  if (!c) throw new AppError("FORBIDDEN", "Complete courier onboarding first");
  return c;
}

export async function getCourierMe(userId: string) {
  const courier = await prisma.courierProfile.findUnique({
    where: { userId },
    include: {
      vehicles: { include: { documents: true } },
      serviceAreas: true,
      availability: { orderBy: { dayOfWeek: "asc" } },
    },
  });
  if (!courier) return { onboarded: false as const };
  const kyc = await prisma.kycCase.findUnique({
    where: { subjectType_subjectId: { subjectType: "COURIER", subjectId: courier.id } },
    include: { documents: true, liveness: true },
  });
  return {
    onboarded: true as const,
    courierId: courier.id,
    status: courier.status,
    onlineStatus: courier.onlineStatus,
    ratingAvg: courier.ratingAvg,
    ratingCount: courier.ratingCount,
    completedDeliveries: courier.completedDeliveries,
    acceptanceRate: courier.acceptanceRate,
    cancellationRate: courier.cancellationRate,
    activeVehicleId: courier.activeVehicleId,
    kyc: kyc
      ? {
          status: kyc.status,
          level: kyc.level,
          note: kyc.note,
          documents: kyc.documents.map((d) => ({ id: d.id, type: d.type, status: d.status, fileKey: d.fileKey })),
          liveness: kyc.liveness.map((l) => ({ provider: l.provider, score: l.score, passed: l.passed })),
        }
      : null,
    vehicles: courier.vehicles.map((v) => ({
      id: v.id,
      type: v.type,
      make: v.make,
      model: v.model,
      color: v.color,
      plate: v.plate,
      year: v.year,
      photos: v.photos,
      status: v.status,
      isActive: v.id === courier.activeVehicleId,
      documents: v.documents.map((d) => ({ id: d.id, type: d.type, status: d.status, expiresAt: d.expiresAt?.toISOString() ?? null })),
    })),
    serviceAreas: courier.serviceAreas.map((a) => ({
      id: a.id,
      name: a.name,
      centerLat: a.centerLat,
      centerLng: a.centerLng,
      radiusM: a.radiusM,
      enabled: a.enabled,
    })),
    availability: courier.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime, enabled: a.enabled })),
  };
}

export interface KycDocInput {
  type: KycDocKind;
  fileKey: string;
}

export async function submitCourierKyc(
  userId: string,
  input: { documents: KycDocInput[]; selfieKey?: string },
) {
  const courier = await courierFor(userId);
  const kyc = await prisma.kycCase.upsert({
    where: { subjectType_subjectId: { subjectType: "COURIER", subjectId: courier.id } },
    create: { subjectType: "COURIER", subjectId: courier.id, level: "FULL", status: "IN_REVIEW" },
    update: { status: "IN_REVIEW" },
  });

  await prisma.$transaction([
    ...input.documents.map((d) =>
      prisma.kycDocument.create({ data: { kycCaseId: kyc.id, type: d.type, fileKey: d.fileKey } }),
    ),
    ...(input.selfieKey
      ? [
          prisma.kycDocument.create({ data: { kycCaseId: kyc.id, type: "SELFIE" as KycDocKind, fileKey: input.selfieKey } }),
          prisma.livenessCheck.create({ data: { kycCaseId: kyc.id, provider: "mock", score: 0.97, passed: true, ref: { auto: true } as Prisma.InputJsonValue } }),
        ]
      : []),
    prisma.userRole.update({ where: { userId_role: { userId, role: "COURIER" } }, data: { kycStatus: "IN_REVIEW" } }),
  ]);

  return { kycCaseId: kyc.id, status: "IN_REVIEW" as const };
}

/** STAFF / ADMIN mock review. */
export async function reviewCourierKyc(
  reviewerId: string,
  input: { courierId: string; decision: "APPROVE" | "REJECT"; note?: string },
) {
  const courier = await prisma.courierProfile.findUnique({ where: { id: input.courierId } });
  if (!courier) throw new AppError("NOT_FOUND", "Courier not found");
  const approved = input.decision === "APPROVE";

  await prisma.$transaction([
    prisma.kycCase.update({
      where: { subjectType_subjectId: { subjectType: "COURIER", subjectId: courier.id } },
      data: { status: approved ? "APPROVED" : "REJECTED", note: input.note, reviewedById: reviewerId, reviewedAt: new Date() },
    }),
    prisma.courierProfile.update({
      where: { id: courier.id },
      data: { status: approved ? "ACTIVE" : "SUSPENDED" },
    }),
    prisma.userRole.update({
      where: { userId_role: { userId: courier.userId, role: "COURIER" } },
      data: {
        kycStatus: approved ? "APPROVED" : "REJECTED",
        status: approved ? "ACTIVE" : "SUSPENDED",
        activatedAt: approved ? new Date() : undefined,
      },
    }),
  ]);

  return { courierId: courier.id, status: approved ? "ACTIVE" : "SUSPENDED", kycStatus: approved ? "APPROVED" : "REJECTED" };
}
