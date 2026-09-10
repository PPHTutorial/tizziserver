import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/comms_models.dart';

void main() {
  test('ConversationCardDto flattens lastMessage + unread', () {
    final cv = ConversationCardDto.fromJson({
      'id': 'c1',
      'kind': 'CUSTOMER_VENDOR',
      'status': 'OPEN',
      'subjectType': 'ORDER',
      'subjectId': 'o1',
      'title': 'Accra Electronics Hub',
      'avatar': null,
      'lastMessage': {'kind': 'TEXT', 'body': 'On its way', 'at': '2026-09-02T10:00:00.000Z', 'fromMe': false},
      'unread': 3,
      'lastMessageAt': '2026-09-02T10:00:00.000Z',
    });
    expect(cv.title, 'Accra Electronics Hub');
    expect(cv.lastBody, 'On its way');
    expect(cv.lastFromMe, false);
    expect(cv.unread, 3);
  });

  test('NotificationFeedDto parses unread + items', () {
    final f = NotificationFeedDto.fromJson({
      'unread': 2,
      'items': [
        {'id': 'n1', 'category': 'DELIVERY', 'title': 'Delivered', 'body': 'Enjoy', 'read': false, 'at': '2026-09-02T10:00:00.000Z', 'data': null},
        {'id': 'n2', 'category': 'ORDER', 'title': 'Confirmed', 'body': 'ok', 'read': true, 'at': '2026-09-02T09:00:00.000Z', 'data': null},
      ],
      'nextCursor': null,
    });
    expect(f.unread, 2);
    expect(f.items.first.category, 'DELIVERY');
    expect(f.items[1].read, true);
  });

  test('DisputeDto rolls evidence + messages + isOpen', () {
    final d = DisputeDto.fromJson({
      'id': 'd1',
      'kind': 'ORDER',
      'refId': 'o1',
      'category': 'item-not-as-described',
      'body': 'Scratched',
      'status': 'EVIDENCE',
      'refundMinor': null,
      'slaDueAt': '2026-09-05T00:00:00.000Z',
      'resolvedAt': null,
      'createdAt': '2026-09-02T09:00:00.000Z',
      'evidence': [
        {'by': 'Ama', 'kind': 'TEXT', 'fileKey': null, 'body': 'Scratched', 'at': '2026-09-02T09:00:00.000Z'},
        {'by': 'Ama', 'kind': 'IMAGE', 'fileKey': 'ev/1.jpg', 'body': null, 'at': '2026-09-02T09:05:00.000Z'},
      ],
      'messages': [
        {'by': 'Support', 'body': 'Looking into it', 'staffOnly': false, 'at': '2026-09-02T10:00:00.000Z'},
      ],
      'appeal': null,
    });
    expect(d.isOpen, true);
    expect(d.evidence, hasLength(2));
    expect(d.messages.single.by, 'Support');
    expect(d.appealStatus, isNull);
  });

  test('SecurityCentreDto parses toggles + recent logins', () {
    final s = SecurityCentreDto.fromJson({
      'activeSessions': 2,
      'twoFactorEnabled': true,
      'pinSet': false,
      'passwordSet': true,
      'blockedCount': 1,
      'reportsFiled': 0,
      'recentLogins': [
        {'ip': '1.2.3.4', 'ua': 'Flutter', 'geo': null, 'result': 'SUCCESS', 'at': '2026-09-02T08:00:00.000Z'},
      ],
    });
    expect(s.twoFactorEnabled, true);
    expect(s.pinSet, false);
    expect(s.recentLogins.single.result, 'SUCCESS');
  });
}
