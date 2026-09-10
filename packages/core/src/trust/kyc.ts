/**
 * Unified KYC review — one queue + one `reviewKycCase` that syncs the subject
 * (vendor / courier / user). Supersedes the Phase-4/5 mock reviewers; those
 * still work (same tables) but new review flows should route through here.
 */
import { prisma, type Prisma, type KycStatus, type KycSubject } from "@stall/db";
import { AppError } from "../errors.ts";
import { notify } from "../comms/notifications.ts";

export async function listKycQueue(opts: { status?: KycStatus; subjectType?: KycSubject } = {}) {
  const rows = await prisma.kycCase.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : { status: { in: ["PENDING", "IN_REVIEW"] } }),
      ...(opts.subjectType ? { subjectType: opts.subjectType } : {}),
    },
    orderBy: { submittedAt: "asc" },
    include: { documents: true, liveness: true },
  });
  return {
    items: rows.map((k) => ({
      id: k.id,
      subjectType: k.subjectType,
      subjectId: k.subjectId,
      level: k.level,
      status: k.status,
      platformSlug: k.platformSlug,
      documents: k.documents.map((d) => ({ id: d.id, type: d.type, status: d.status, fileKey: d.fileKey })),
      liveness: k.liveness.map((l) => ({ provider: l.provider, score: l.score, passed: l.passed })),
      submittedAt: k.submittedAt.toISOString(),
    })),
  };
}

export async function getKycCase(id: string) {
  const k = await prisma.kycCase.findUnique({ where: { id }, include: { documents: true, liveness: true } });
  if (!k) throw new AppError("NOT_FOUND", "KYC case not found");

  let subject: Record<string, unknown> = {};
  if (k.subjectType === "VENDOR") {
    const v = await prisma.vendorProfile.findUnique({ where: { id: k.subjectId }, include: { user: { select: { phone: true, email: true } }, business: true } });
    subject = { displayName: v?.displayName, phone: v?.user.phone, legalName: v?.business?.legalName, regNumber: v?.business?.regNumber };
  } else if (k.subjectType === "COURIER") {
    const c = await prisma.courierProfile.findUnique({ where: { id: k.subjectId }, include: { user: { select: { firstName: true, lastName: true, phone: true } }, vehicles: true } });
    subject = { name: [c?.user.firstName, c?.user.lastName].filter(Boolean).join(" "), phone: c?.user.phone, vehicles: c?.vehicles.map((x) => ({ type: x.type, plate: x.plate, status: x.status })) };
  } else {
    const u = await prisma.user.findUnique({ where: { id: k.subjectId }, select: { firstName: true, lastName: true, phone: true, email: true } });
    subject = { name: [u?.firstName, u?.lastName].filter(Boolean).join(" "), phone: u?.phone, email: u?.email };
  }

  return {
    id: k.id,
    subjectType: k.subjectType,
    subjectId: k.subjectId,
    level: k.level,
    status: k.status,
    note: k.note,
    fields: k.fields,
    subject,
    documents: k.documents.map((d) => ({ id: d.id, type: d.type, status: d.status, fileKey: d.fileKey, ocr: d.ocr })),
    liveness: k.liveness.map((l) => ({ provider: l.provider, score: l.score, passed: l.passed })),
  };
}

export async function reviewKycCase(reviewerId: string, id: string, decision: "APPROVE" | "REJECT" | "RESUBMIT", note?: string) {
  const k = await prisma.kycCase.findUnique({ where: { id } });
  if (!k) throw new AppError("NOT_FOUND", "KYC case not found");
  const status: KycStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const approved = decision === "APPROVE";

  const ops: Promise<unknown>[] = [
    prisma.kycCase.update({ where: { id }, data: { status: decision === "RESUBMIT" ? "PENDING" : status, note, reviewedById: reviewerId, reviewedAt: new Date() } }),
    prisma.kycDocument.updateMany({ where: { kycCaseId: id }, data: { status: approved ? "APPROVED" : "REJECTED" } }),
    prisma.auditLog.create({ data: { actorId: reviewerId, actorType: "USER", action: "kyc.review", targetType: "KycCase", targetId: id, after: { decision, note } } }),
  ];

  let notifyUserId: string | undefined;
  if (k.subjectType === "VENDOR") {
    const v = await prisma.vendorProfile.findUnique({ where: { id: k.subjectId }, select: { userId: true } });
    notifyUserId = v?.userId;
    if (v) {
      ops.push(
        prisma.vendorProfile.update({ where: { id: k.subjectId }, data: { status: approved ? "ACTIVE" : "SUSPENDED", verifiedAt: approved ? new Date() : null } }),
        prisma.userRole.updateMany({ where: { userId: v.userId, role: "VENDOR" }, data: { kycStatus: decision === "RESUBMIT" ? "PENDING" : status, status: approved ? "ACTIVE" : "SUSPENDED", activatedAt: approved ? new Date() : undefined } }),
      );
    }
  } else if (k.subjectType === "COURIER") {
    const c = await prisma.courierProfile.findUnique({ where: { id: k.subjectId }, select: { userId: true } });
    notifyUserId = c?.userId;
    if (c) {
      ops.push(
        prisma.courierProfile.update({ where: { id: k.subjectId }, data: { status: approved ? "ACTIVE" : "SUSPENDED" } }),
        prisma.userRole.updateMany({ where: { userId: c.userId, role: "COURIER" }, data: { kycStatus: decision === "RESUBMIT" ? "PENDING" : status, status: approved ? "ACTIVE" : "SUSPENDED", activatedAt: approved ? new Date() : undefined } }),
      );
    }
  } else {
    notifyUserId = k.subjectId;
    // a USER-level KYC often backs a prize claim
    ops.push(prisma.prizeClaim.updateMany({ where: { kycCaseId: id, status: "VERIFYING" }, data: { status: approved ? "APPROVED" : "REJECTED" } }));
  }

  await prisma.$transaction(ops.filter(Boolean) as Prisma.PrismaPromise<unknown>[]);
  if (notifyUserId) {
    await notify({
      userId: notifyUserId,
      category: "SECURITY",
      title: approved ? "Verification approved" : decision === "RESUBMIT" ? "Please resubmit your documents" : "Verification rejected",
      body: note ?? (approved ? "You're all set." : "Check the details and try again."),
      data: { kycCaseId: id },
    }).catch(() => {});
  }
  return { id, status: decision === "RESUBMIT" ? "PENDING" : status };
}
