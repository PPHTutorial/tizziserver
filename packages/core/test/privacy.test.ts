import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { privacy } from "@stall/core";
import { dropUser, makeUser } from "./helpers.ts";

const trash: string[] = [];

afterAll(async () => {
  for (const id of trash) {
    await prisma.accountDeletionRequest.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { targetId: id } }).catch(() => {});
    await dropUser(id).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("privacy — GDPR pipeline", () => {
  it("exports a data bundle for the caller", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    const bundle = await privacy.exportMyData(u.id);
    expect(bundle.profile?.id).toBe(u.id);
    expect(bundle).toHaveProperty("orders");
    expect(bundle).toHaveProperty("wallet");
    expect(bundle).toHaveProperty("addresses");
  });

  it("request → cancel round-trips within the grace period", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    const req = await privacy.requestAccountDeletion(u.id, "moving on");
    expect(req.status).toBe("GRACE_PERIOD");
    expect(req.canCancel).toBe(true);

    await expect(privacy.requestAccountDeletion(u.id)).rejects.toThrow(/in progress/);

    const cancel = await privacy.cancelAccountDeletion(u.id);
    expect(cancel.status).toBe("cancelled");
    expect((await privacy.getAccountDeletionStatus(u.id)).status).toBe("CANCELLED");
  });

  it("processDueDeletions anonymises PII, revokes access, and tombstones", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    await prisma.user.update({ where: { id: u.id }, data: { email: `p-${Date.now()}@example.com`, firstName: "Ada", lastName: "Lovelace" } });
    await prisma.session.create({ data: { userId: u.id, familyId: `f-${Date.now()}`, refreshHash: `h-${Date.now()}-${Math.random()}`, activeRole: "CUSTOMER", platformSlug: "grandprice", expiresAt: new Date(Date.now() + 8.64e7) } });

    // request, then force the grace period to be in the past
    await privacy.requestAccountDeletion(u.id);
    await prisma.accountDeletionRequest.update({ where: { userId: u.id }, data: { purgeAfter: new Date(Date.now() - 1000) } });

    const res = await privacy.processDueDeletions();
    expect(res.processed).toBeGreaterThanOrEqual(1);

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.email).toBeNull();
    expect(after?.firstName).toBeNull();
    expect(after?.phone).toBe(`deleted:${u.id}`);
    expect(after?.deletedAt).not.toBeNull();
    expect(after?.status).toBe("BANNED");
    const liveSessions = await prisma.session.count({ where: { userId: u.id, revokedAt: null } });
    expect(liveSessions).toBe(0);
    expect((await prisma.accountDeletionRequest.findUnique({ where: { userId: u.id } }))?.status).toBe("COMPLETED");
  });
});
