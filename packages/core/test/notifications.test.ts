import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@stall/db";
import { dropUser, makeUser } from "./helpers.ts";

const sendEachForMulticast = vi.fn();
vi.mock("../src/comms/fcm.ts", () => ({
  getFcmMessaging: () => ({ sendEachForMulticast }),
}));

const { notify } = await import("../src/comms/notifications.ts");

const trash: string[] = [];

afterAll(async () => {
  for (const id of trash) await dropUser(id).catch(() => {}); // cascades devices + notifications
  await prisma.$disconnect();
});

beforeEach(() => {
  sendEachForMulticast.mockReset();
});

describe("push notifications (FCM)", () => {
  it("sends via FCM to every device token and clears one FCM reports dead", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    const good = await prisma.device.create({
      data: { userId: u.id, deviceId: `d1-${u.id}`, platform: "ANDROID", pushToken: "good-token" },
    });
    const dead = await prisma.device.create({
      data: { userId: u.id, deviceId: `d2-${u.id}`, platform: "IOS", pushToken: "dead-token" },
    });

    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true, messageId: "m1" },
        { success: false, error: { code: "messaging/registration-token-not-registered", message: "gone" } },
      ],
      successCount: 1,
      failureCount: 1,
    });

    const res = await notify({ userId: u.id, category: "ORDER", title: "Hi", body: "there" });
    expect(res.delivered).toBeGreaterThan(0);
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);

    const call = sendEachForMulticast.mock.calls[0]![0] as { tokens: string[] };
    expect([...call.tokens].sort()).toEqual(["dead-token", "good-token"]);

    const goodAfter = await prisma.device.findUniqueOrThrow({ where: { id: good.id } });
    const deadAfter = await prisma.device.findUniqueOrThrow({ where: { id: dead.id } });
    expect(goodAfter.pushToken).toBe("good-token");
    expect(deadAfter.pushToken).toBeNull();
  });

  it("stringifies non-string data values for the FCM payload", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    await prisma.device.create({ data: { userId: u.id, deviceId: `d3-${u.id}`, platform: "ANDROID", pushToken: "tok" } });

    sendEachForMulticast.mockResolvedValue({ responses: [{ success: true, messageId: "m" }], successCount: 1, failureCount: 0 });

    await notify({ userId: u.id, category: "ORDER", title: "Hi", body: "there", data: { count: 3, flag: true, text: "ok" } });

    const call = sendEachForMulticast.mock.calls[0]![0] as { data: Record<string, string> };
    expect(call.data).toEqual({ count: "3", flag: "true", text: "ok" });
  });

  it("falls back to a log line (no FCM call) when the caller has no device tokens", async () => {
    const u = await makeUser("CUSTOMER");
    trash.push(u.id);
    const res = await notify({ userId: u.id, category: "ORDER", title: "Hi", body: "there" });
    expect(res.delivered).toBeGreaterThan(0);
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });
});
