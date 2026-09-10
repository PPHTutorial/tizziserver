// Phase 6 — chat / notifications / disputes / support / trust models.
// Mirrors packages/contracts/src/comms.ts.

int _i(dynamic v) => v == null ? 0 : (v as num).toInt();
String _s(dynamic v) => (v as String?) ?? '';
DateTime? _dt(dynamic v) => v == null ? null : DateTime.tryParse(v as String);
List<Map<String, dynamic>> _list(dynamic v) =>
    (v as List<dynamic>? ?? const []).map((e) => (e as Map).cast<String, dynamic>()).toList();

class ConversationCardDto {
  const ConversationCardDto({
    required this.id,
    required this.kind,
    required this.title,
    this.avatar,
    this.subjectType,
    this.subjectId,
    this.lastBody,
    this.lastFromMe = false,
    this.lastAt,
    required this.unread,
  });
  final String id;
  final String kind;
  final String title;
  final String? avatar;
  final String? subjectType;
  final String? subjectId;
  final String? lastBody;
  final bool lastFromMe;
  final DateTime? lastAt;
  final int unread;

  factory ConversationCardDto.fromJson(Map<String, dynamic> j) {
    final last = (j['lastMessage'] as Map?)?.cast<String, dynamic>();
    return ConversationCardDto(
      id: _s(j['id']),
      kind: _s(j['kind']),
      title: _s(j['title']),
      avatar: j['avatar'] as String?,
      subjectType: j['subjectType'] as String?,
      subjectId: j['subjectId'] as String?,
      lastBody: last?['body'] as String?,
      lastFromMe: last?['fromMe'] == true,
      lastAt: _dt(last?['at']),
      unread: _i(j['unread']),
    );
  }
}

class ChatMessageDto {
  const ChatMessageDto({required this.id, required this.kind, this.body, this.attachments, required this.fromMe, required this.at});
  final String id;
  final String kind;
  final String? body;
  final Object? attachments;
  final bool fromMe;
  final DateTime at;
  factory ChatMessageDto.fromJson(Map<String, dynamic> j) => ChatMessageDto(
        id: _s(j['id']),
        kind: j['kind'] as String? ?? 'TEXT',
        body: j['body'] as String?,
        attachments: j['attachments'],
        fromMe: j['fromMe'] == true,
        at: _dt(j['at']) ?? DateTime.now(),
      );
}

class NotificationDto {
  const NotificationDto({required this.id, required this.category, required this.title, required this.body, required this.read, required this.at, this.data});
  final String id;
  final String category;
  final String title;
  final String body;
  final bool read;
  final DateTime at;
  final Object? data;
  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: _s(j['id']),
        category: _s(j['category']),
        title: _s(j['title']),
        body: _s(j['body']),
        read: j['read'] == true,
        at: _dt(j['at']) ?? DateTime.now(),
        data: j['data'],
      );
}

class NotificationFeedDto {
  const NotificationFeedDto({required this.unread, required this.items, this.nextCursor});
  final int unread;
  final List<NotificationDto> items;
  final String? nextCursor;
  factory NotificationFeedDto.fromJson(Map<String, dynamic> j) => NotificationFeedDto(
        unread: _i(j['unread']),
        items: _list(j['items']).map(NotificationDto.fromJson).toList(),
        nextCursor: j['nextCursor'] as String?,
      );
}

class NotificationPrefDto {
  const NotificationPrefDto({required this.category, required this.push, required this.email, required this.sms, required this.inApp});
  final String category;
  final bool push;
  final bool email;
  final bool sms;
  final bool inApp;
  factory NotificationPrefDto.fromJson(Map<String, dynamic> j) => NotificationPrefDto(
        category: _s(j['category']),
        push: j['push'] == true,
        email: j['email'] == true,
        sms: j['sms'] == true,
        inApp: j['inApp'] == true,
      );
}

class DisputeDto {
  const DisputeDto({
    required this.id,
    required this.kind,
    required this.refId,
    required this.category,
    required this.body,
    required this.status,
    this.refundMinor,
    this.slaDueAt,
    this.resolvedAt,
    required this.createdAt,
    required this.evidence,
    required this.messages,
    this.appealStatus,
  });
  final String id;
  final String kind;
  final String refId;
  final String category;
  final String body;
  final String status;
  final int? refundMinor;
  final DateTime? slaDueAt;
  final DateTime? resolvedAt;
  final DateTime createdAt;
  final List<({String by, String kind, String? fileKey, String? body, DateTime at})> evidence;
  final List<({String by, String body, bool staffOnly, DateTime at})> messages;
  final String? appealStatus;

  bool get isOpen => const {'OPEN', 'EVIDENCE', 'UNDER_REVIEW', 'APPEALED'}.contains(status);

  factory DisputeDto.fromJson(Map<String, dynamic> j) => DisputeDto(
        id: _s(j['id']),
        kind: _s(j['kind']),
        refId: _s(j['refId']),
        category: _s(j['category']),
        body: _s(j['body']),
        status: _s(j['status']),
        refundMinor: (j['refundMinor'] as num?)?.toInt(),
        slaDueAt: _dt(j['slaDueAt']),
        resolvedAt: _dt(j['resolvedAt']),
        createdAt: _dt(j['createdAt']) ?? DateTime.now(),
        evidence: _list(j['evidence'])
            .map((e) => (by: _s(e['by']), kind: _s(e['kind']), fileKey: e['fileKey'] as String?, body: e['body'] as String?, at: _dt(e['at']) ?? DateTime.now()))
            .toList(),
        messages: _list(j['messages'])
            .map((m) => (by: _s(m['by']), body: _s(m['body']), staffOnly: m['staffOnly'] == true, at: _dt(m['at']) ?? DateTime.now()))
            .toList(),
        appealStatus: (j['appeal'] as Map?)?['status'] as String?,
      );
}

class SupportTicketDto {
  const SupportTicketDto({
    required this.id,
    required this.number,
    required this.category,
    required this.subject,
    required this.priority,
    required this.status,
    this.conversationId,
    required this.createdAt,
    this.body,
  });
  final String id;
  final String number;
  final String category;
  final String subject;
  final String priority;
  final String status;
  final String? conversationId;
  final DateTime createdAt;
  final String? body;
  factory SupportTicketDto.fromJson(Map<String, dynamic> j) => SupportTicketDto(
        id: _s(j['id']),
        number: _s(j['number']),
        category: _s(j['category']),
        subject: _s(j['subject']),
        priority: j['priority'] as String? ?? 'NORMAL',
        status: _s(j['status']),
        conversationId: j['conversationId'] as String?,
        createdAt: _dt(j['createdAt']) ?? DateTime.now(),
        body: j['body'] as String?,
      );
}

class SecurityCentreDto {
  const SecurityCentreDto({
    required this.activeSessions,
    required this.twoFactorEnabled,
    required this.pinSet,
    required this.passwordSet,
    required this.blockedCount,
    required this.reportsFiled,
    required this.recentLogins,
  });
  final int activeSessions;
  final bool twoFactorEnabled;
  final bool pinSet;
  final bool passwordSet;
  final int blockedCount;
  final int reportsFiled;
  final List<({String? ip, String? ua, String result, DateTime at})> recentLogins;
  factory SecurityCentreDto.fromJson(Map<String, dynamic> j) => SecurityCentreDto(
        activeSessions: _i(j['activeSessions']),
        twoFactorEnabled: j['twoFactorEnabled'] == true,
        pinSet: j['pinSet'] == true,
        passwordSet: j['passwordSet'] == true,
        blockedCount: _i(j['blockedCount']),
        reportsFiled: _i(j['reportsFiled']),
        recentLogins: _list(j['recentLogins'])
            .map((l) => (ip: l['ip'] as String?, ua: l['ua'] as String?, result: _s(l['result']), at: _dt(l['at']) ?? DateTime.now()))
            .toList(),
      );
}

class ReportDto {
  const ReportDto({
    required this.id,
    required this.targetType,
    required this.category,
    required this.status,
    required this.at,
  });
  final String id;
  final String targetType;
  final String category;
  final String status;
  final DateTime at;
  factory ReportDto.fromJson(Map<String, dynamic> j) => ReportDto(
        id: _s(j['id']),
        targetType: _s(j['targetType']),
        category: _s(j['category']),
        status: _s(j['status']),
        at: _dt(j['at']) ?? DateTime.now(),
      );
}

class HelpCenterDto {
  const HelpCenterDto({required this.categories, required this.faq});
  final List<String> categories;
  final List<({String category, String q, String a})> faq;
  factory HelpCenterDto.fromJson(Map<String, dynamic> j) => HelpCenterDto(
        categories: (j['categories'] as List<dynamic>? ?? const []).cast<String>(),
        faq: _list(j['faq']).map((f) => (category: _s(f['category']), q: _s(f['q']), a: _s(f['a']))).toList(),
      );
}
