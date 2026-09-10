import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * Phase 6 — chat, notifications, disputes, support, trust & safety.
 * Mirrors `@stall/core/{comms,trust}` + `/api/v1/{conversations,notifications,
 * disputes,support,reports,me/security,staff/*}`.
 */

export const NotificationCategory = z.enum([
  "ORDER", "PAYMENT", "DELIVERY", "COURIER", "AUCTION", "TICKET", "COUPON", "VENDOR", "PROMO", "SECURITY", "CHAT", "SUPPORT",
]);
export const MessageKind = z.enum(["TEXT", "IMAGE", "DOC", "VOICE", "PRODUCT", "ORDER", "DELIVERY", "SYSTEM"]);
export const DisputeKind = z.enum(["ORDER", "PAYMENT", "DELIVERY", "VENDOR", "COURIER", "AUCTION"]);
export const DisputeStatus = z.enum(["OPEN", "EVIDENCE", "UNDER_REVIEW", "RESOLVED", "APPEALED", "CLOSED"]);

// --- chat --------------------------------------------------------
export const ConversationCard = z.object({
  id: z.string(),
  kind: z.enum(["CUSTOMER_VENDOR", "CUSTOMER_COURIER", "SUPPORT"]),
  status: z.string(),
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  title: z.string(),
  avatar: z.string().nullable(),
  lastMessage: z.object({ kind: z.string(), body: z.string().nullable(), at: z.string(), fromMe: z.boolean() }).nullable(),
  unread: z.number().int(),
  lastMessageAt: z.string().nullable(),
});
export const ConversationsResponse = ok(z.object({ items: z.array(ConversationCard) }));
export const ChatMessage = z.object({
  id: z.string(),
  kind: MessageKind,
  body: z.string().nullable(),
  attachments: z.unknown().nullable(),
  meta: z.unknown().nullable(),
  fromMe: z.boolean(),
  at: z.string(),
});
export const MessagesResponse = ok(z.object({ items: z.array(ChatMessage), nextCursor: z.string().nullable() }));
export const SendMessageRequest = z.object({
  kind: z.enum(["TEXT", "IMAGE", "DOC", "VOICE", "PRODUCT", "ORDER", "DELIVERY"]).optional(),
  body: z.string().max(4000).optional(),
  attachments: z.unknown().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export const MessageSentResponse = ok(z.object({ id: z.string(), at: z.string() }));
export const ConversationRefResponse = ok(z.object({ conversationId: z.string() }));
export const OkReadResponse = ok(z.object({ read: z.boolean() }));
export const OkMutedResponse = ok(z.object({ muted: z.boolean() }));
export const BlockRequest = z.object({ targetUserId: z.string() });
export const BlocksResponse = ok(z.object({ items: z.array(z.object({ userId: z.string(), name: z.string(), at: z.string() })) }));
export const BlockToggleResponse = ok(z.object({ blocked: z.boolean() }));

// --- notifications ---------------------------------------------
export const NotificationView = z.object({
  id: z.string(),
  category: NotificationCategory,
  title: z.string(),
  body: z.string(),
  data: z.unknown().nullable(),
  read: z.boolean(),
  at: z.string(),
});
export const NotificationsResponse = ok(z.object({ unread: z.number().int(), items: z.array(NotificationView), nextCursor: z.string().nullable() }));
export const NotificationPreference = z.object({ category: NotificationCategory, push: z.boolean(), email: z.boolean(), sms: z.boolean(), inApp: z.boolean() });
export const PreferencesResponse = ok(z.object({ items: z.array(NotificationPreference) }));
export const SetPreferenceRequest = z.object({ category: NotificationCategory, push: z.boolean().optional(), email: z.boolean().optional(), sms: z.boolean().optional(), inApp: z.boolean().optional() });
export const OkCountResponse = ok(z.object({ updated: z.number().int() }));

// --- reports / security --------------------------------------
export const ReportRequest = z.object({
  targetType: z.enum(["USER", "PRODUCT", "VENDOR", "COURIER", "CONVERSATION", "ORDER", "DELIVERY"]),
  targetId: z.string(),
  category: z.string().min(2).max(60),
  body: z.string().min(3).max(2000),
  evidence: z.unknown().optional(),
});
export const IdStatusResponse = ok(z.object({ id: z.string(), status: z.string() }));
export const MyReportsResponse = ok(z.object({ items: z.array(z.object({ id: z.string(), targetType: z.string(), category: z.string(), status: z.string(), at: z.string() })) }));
export const SecurityCentreResponse = ok(
  z.object({
    activeSessions: z.number().int(),
    twoFactorEnabled: z.boolean(),
    pinSet: z.boolean(),
    passwordSet: z.boolean(),
    blockedCount: z.number().int(),
    reportsFiled: z.number().int(),
    recentLogins: z.array(z.object({ ip: z.string().nullable(), ua: z.string().nullable(), geo: z.string().nullable(), result: z.string(), at: z.string() })),
  }),
);

// --- disputes ------------------------------------------------
export const DisputeView = z.object({
  id: z.string(),
  kind: DisputeKind,
  refId: z.string(),
  category: z.string(),
  body: z.string(),
  status: DisputeStatus,
  resolution: z.unknown().nullable(),
  refundMinor: z.number().int().nullable(),
  slaDueAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  evidence: z.array(z.object({ by: z.string(), kind: z.string(), fileKey: z.string().nullable(), body: z.string().nullable(), at: z.string() })),
  messages: z.array(z.object({ by: z.string(), body: z.string(), staffOnly: z.boolean(), at: z.string() })),
  appeal: z.object({ status: z.string(), body: z.string(), decidedAt: z.string().nullable() }).nullable(),
});
export const DisputesResponse = ok(z.object({ items: z.array(DisputeView) }));
export const DisputeResponse = ok(DisputeView);
export const OpenDisputeRequest = z.object({
  kind: DisputeKind,
  refId: z.string(),
  category: z.string().min(2).max(60),
  body: z.string().min(3).max(2000),
  evidence: z.array(z.object({ kind: z.enum(["TEXT", "IMAGE", "DOC"]).optional(), fileKey: z.string().optional(), body: z.string().optional() })).optional(),
});
export const OpenDisputeResponse = ok(z.object({ id: z.string(), status: z.string(), slaDueAt: z.string().nullable() }));
export const EvidenceRequest = z.object({ kind: z.enum(["TEXT", "IMAGE", "DOC"]).optional(), fileKey: z.string().max(300).optional(), body: z.string().max(2000).optional() });
export const DisputeMessageRequest = z.object({ body: z.string().min(1).max(2000) });
export const AppealRequest = z.object({ body: z.string().min(3).max(2000) });
export const OkAddedResponse = ok(z.object({ added: z.boolean() }));
export const OkSentResponse = ok(z.object({ sent: z.boolean() }));
export const OkStatusResponse = ok(z.object({ status: z.string() }));

// --- support -----------------------------------------------
export const HelpResponse = ok(z.object({ categories: z.array(z.string()), faq: z.array(z.object({ category: z.string(), q: z.string(), a: z.string() })) }));
export const SupportTicketCard = z.object({
  id: z.string(),
  number: z.string(),
  category: z.string(),
  subject: z.string(),
  priority: z.string(),
  status: z.string(),
  conversationId: z.string().nullable(),
  createdAt: z.string(),
});
export const SupportTicketsResponse = ok(z.object({ items: z.array(SupportTicketCard) }));
export const SupportTicketResponse = ok(SupportTicketCard.extend({ body: z.string() }));
export const CreateTicketRequest = z.object({
  category: z.string().min(2).max(60),
  subject: z.string().min(3).max(160),
  body: z.string().min(3).max(4000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});
export const CreateTicketResponse = ok(z.object({ id: z.string(), number: z.string(), status: z.string(), conversationId: z.string() }));

// --- STAFF -------------------------------------------------
export const KycQueueResponse = ok(z.unknown());
export const KycCaseResponse = ok(z.unknown());
export const KycReviewRequest = z.object({ decision: z.enum(["APPROVE", "REJECT", "RESUBMIT"]), note: z.string().max(500).optional() });
export const ResolveDisputeRequest = z.object({ outcome: z.string().min(3).max(500), notes: z.string().max(2000).optional(), refundMinor: z.number().int().nonnegative().optional() });
export const AppealDecisionRequest = z.object({ decision: z.enum(["UPHELD", "DENIED"]), notes: z.string().max(2000).optional() });
export const ReportsResponse = ok(z.unknown());
export const ActionReportRequest = z.object({
  status: z.enum(["OPEN", "REVIEWING", "ACTIONED", "DISMISSED"]),
  note: z.string().max(500).optional(),
  safetyAction: z.object({ targetUserId: z.string(), action: z.enum(["WARN", "RESTRICT", "SUSPEND", "BAN", "CLEAR"]), reason: z.string().min(3).max(500), expiresAt: z.string().datetime().optional() }).optional(),
});
export const SafetyActionRequest = z.object({ targetType: z.string(), targetId: z.string(), action: z.enum(["WARN", "RESTRICT", "SUSPEND", "BAN", "CLEAR"]), reason: z.string().min(3).max(500), expiresAt: z.string().datetime().optional() });
export const StaffTicketsResponse = ok(z.unknown());
export const StaffMutationResponse = ok(z.record(z.string(), z.unknown()));
