/**
 * Notifications — per-category preferences, in-app feed, and a push adapter.
 *
 * `notify()` fans a single logical event to the channels the user has enabled
 * (`NotificationPreference`, default push+email+inApp). PUSH goes through a
 * real Firebase Admin SDK send (`sendEachForMulticast`) that falls back to a
 * log line when `FCM_*` isn't set. Every delivered notification also emits an
 * `OutboxEvent` the realtime `/notifications` namespace rebroadcasts.
 */
import { prisma, type Prisma, type NotificationCategory, type NotificationChannel } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { getFcmMessaging } from "./fcm.ts";

const ALL_CATEGORIES: NotificationCategory[] = [
  "ORDER", "PAYMENT", "DELIVERY", "COURIER", "AUCTION", "TICKET", "COUPON", "VENDOR", "PROMO", "SECURITY", "CHAT", "SUPPORT",
];

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** override the preference-derived channel set */
  channels?: NotificationChannel[];
}

async function prefFor(userId: string, category: NotificationCategory) {
  const p = await prisma.notificationPreference.findUnique({ where: { userId_category: { userId, category } } });
  return p ?? { push: true, email: category !== "PROMO", sms: false, inApp: true };
}

/** FCM rejects these tokens permanently — clear them so we stop targeting a dead install. */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

async function pushToDevices(userId: string, title: string, body: string, data?: Record<string, unknown>) {
  const devices = await prisma.device.findMany({ where: { userId, pushToken: { not: null } }, select: { id: true, pushToken: true } });
  const messaging = getFcmMessaging();
  if (!messaging || devices.length === 0) {
    if (env.NODE_ENV !== "test") console.log(`[push:log] → ${userId} "${title}" (${devices.length} device(s))`, data ?? "");
    return { sent: 0, logged: devices.length };
  }

  // FCM data payload values must all be strings.
  const stringData: Record<string, string> | undefined = data
    ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]))
    : undefined;

  const res = await messaging.sendEachForMulticast({
    tokens: devices.map((d) => d.pushToken!),
    notification: { title, body },
    data: stringData,
  });

  const deadDeviceIds: string[] = [];
  res.responses.forEach((r, i) => {
    if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) deadDeviceIds.push(devices[i]!.id);
  });
  if (deadDeviceIds.length) {
    await prisma.device.updateMany({ where: { id: { in: deadDeviceIds } }, data: { pushToken: null } }).catch(() => {});
  }

  return { sent: res.successCount, logged: 0 };
}

export async function notify(input: NotifyInput) {
  const pref = await prefFor(input.userId, input.category);
  const channels: NotificationChannel[] =
    input.channels ??
    ([
      pref.inApp ? "IN_APP" : null,
      pref.push ? "PUSH" : null,
      pref.email ? "EMAIL" : null,
      pref.sms ? "SMS" : null,
    ].filter(Boolean) as NotificationChannel[]);

  if (channels.length === 0) return { delivered: 0 };

  const rows = await prisma.$transaction(
    channels.map((channel) =>
      prisma.notification.create({
        data: {
          userId: input.userId,
          category: input.category,
          title: input.title,
          body: input.body,
          data: (input.data ?? undefined) as Prisma.InputJsonValue,
          channel,
        },
      }),
    ),
  );

  if (channels.includes("PUSH")) await pushToDevices(input.userId, input.title, input.body, input.data).catch(() => {});
  await prisma.outboxEvent.create({
    data: {
      type: "notification.created",
      aggregateType: "Notification",
      aggregateId: rows[0]!.id,
      payload: { userId: input.userId, category: input.category, title: input.title, body: input.body } as Prisma.InputJsonValue,
    },
  });

  return { delivered: rows.length, channels };
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; cursor?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 30)), 60);
  const rows = await prisma.notification.findMany({
    where: { userId, channel: "IN_APP", ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { sentAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  const unread = await prisma.notification.count({ where: { userId, channel: "IN_APP", readAt: null } });
  return {
    unread,
    items: rows.slice(0, limit).map((n) => ({
      id: n.id,
      category: n.category,
      title: n.title,
      body: n.body,
      data: n.data,
      read: !!n.readAt,
      at: n.sentAt.toISOString(),
    })),
    nextCursor,
  };
}

export async function markNotificationRead(userId: string, id: string) {
  const n = await prisma.notification.findFirst({ where: { id, userId } });
  if (!n) throw new AppError("NOT_FOUND", "Notification not found");
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return { read: true };
}

export async function markAllNotificationsRead(userId: string) {
  const { count } = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { updated: count };
}

export async function getNotificationPreferences(userId: string) {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const byCat = new Map(rows.map((r) => [r.category, r]));
  return {
    items: ALL_CATEGORIES.map((category) => {
      const r = byCat.get(category);
      return {
        category,
        push: r?.push ?? true,
        email: r?.email ?? category !== "PROMO",
        sms: r?.sms ?? false,
        inApp: r?.inApp ?? true,
      };
    }),
  };
}

export async function setNotificationPreference(
  userId: string,
  category: NotificationCategory,
  patch: { push?: boolean; email?: boolean; sms?: boolean; inApp?: boolean },
) {
  await prisma.notificationPreference.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, ...patch },
    update: patch,
  });
  return getNotificationPreferences(userId);
}

// --- worker fan-out: known OutboxEvent types → notifications -----------

const OUTBOX_MAP: Record<string, { category: NotificationCategory; title: string; body: (p: Record<string, unknown>) => string }> = {
  "order.paid": { category: "ORDER", title: "Order confirmed", body: (p) => `Your order ${p.number ?? ""} is confirmed.` },
  "order.cancelled": { category: "ORDER", title: "Order cancelled", body: (p) => `Order ${p.number ?? ""} was cancelled.` },
  "delivery.assigned": { category: "DELIVERY", title: "Courier assigned", body: () => "A courier is on the way to pick up your order." },
  "delivery.picked_up": { category: "DELIVERY", title: "Package collected", body: () => "Your courier has collected the package." },
  "delivery.completed": { category: "DELIVERY", title: "Delivered", body: () => "Your delivery is complete. Enjoy!" },
  "delivery.failed": { category: "DELIVERY", title: "Delivery attempt failed", body: () => "We couldn't complete your delivery. Tap to reschedule." },
  "auction.draw_completed": { category: "AUCTION", title: "Draw complete", body: () => "The Inverse Draw has run — check if you won." },
  "auction.unsold": { category: "AUCTION", title: "Draw unsold", body: () => "The pool didn't fill — your seats were refunded to your wallet." },
  "auction.tickets_bought": { category: "TICKET", title: "Seats secured", body: (p) => `${p.total ?? ""} seat(s) added. Good luck!` },
};

/**
 * Map one OutboxEvent → an in-app notification (called by the worker's
 * outbox-relay per event, before it marks the event dispatched). No-op for
 * unmapped types.
 */
export async function notifyFromOutboxEvent(ev: {
  type: string;
  aggregateType: string | null;
  aggregateId: string;
  payload: unknown;
}): Promise<boolean> {
  const map = OUTBOX_MAP[ev.type];
  if (!map) return false;
  const payload = (ev.payload ?? {}) as Record<string, unknown>;

  let userId = payload.userId as string | undefined;
  if (!userId && ev.aggregateType === "Order") {
    userId = (await prisma.order.findUnique({ where: { id: ev.aggregateId }, select: { customerId: true } }))?.customerId;
  }
  if (!userId && ev.aggregateType === "Delivery") {
    userId = (await prisma.delivery.findUnique({ where: { id: ev.aggregateId }, select: { customerId: true } }))?.customerId ?? undefined;
  }
  if (!userId && ev.aggregateType === "Auction") {
    const w = await prisma.winner.findFirst({ where: { draw: { auctionId: ev.aggregateId } }, include: { participant: true } });
    userId = (payload.winnerUserId as string) ?? w?.participant.userId;
  }
  if (!userId) return false;

  await notify({ userId, category: map.category, title: map.title, body: map.body(payload), data: { outboxType: ev.type, ref: ev.aggregateId } }).catch(() => {});
  return true;
}
