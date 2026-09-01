import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/models.dart';

void main() {
  test('LoginResult parses an MFA challenge', () {
    final r = LoginResult.fromJson({
      'mfaRequired': true,
      'methods': ['totp'],
    });
    expect(r.mfaRequired, isTrue);
    expect(r.isComplete, isFalse);
  });

  test('LoginResult parses a completed login (user + token pair)', () {
    final r = LoginResult.fromJson({
      'user': {'id': 'u1', 'phone': '+15550001234', 'status': 'ACTIVE'},
      'accessToken': 'a.b.c',
      'refreshToken': 'r' * 40,
      'activeRole': 'CUSTOMER',
      'roles': ['CUSTOMER', 'VENDOR'],
      'refreshExpiresAt': '2026-01-01T00:00:00.000Z',
    });
    expect(r.isComplete, isTrue);
    expect(r.user!.id, 'u1');
    expect(r.tokens!.roles, ['CUSTOMER', 'VENDOR']);
  });

  test('Bootstrap.hasFeature follows the resolver truthiness rules', () {
    final boot = Bootstrap.fromJson({
      'platform': {'slug': 'tizzi-gas', 'name': 'Tizzi Gas', 'defaultCurrency': 'GHS'},
      'authenticated': false,
      'roles': <String>[],
      'features': {'auction': false, 'catalog.scope': 'gas', 'wallet': true},
      'nav': <dynamic>[],
      'minAppVersion': {'ios': '1.0.0', 'android': '1.0.0'},
    });
    expect(boot.hasFeature('auction'), isFalse);
    expect(boot.hasFeature('wallet'), isTrue);
    expect(boot.hasFeature('missing'), isFalse);
    expect(boot.features['catalog.scope'], 'gas');
  });

  test('SessionInfo tolerates null device fields', () {
    final s = SessionInfo.fromJson({
      'id': 's1',
      'deviceId': null,
      'activeRole': 'COURIER',
      'createdAt': '2026-01-01T00:00:00.000Z',
      'current': true,
    });
    expect(s.current, isTrue);
    expect(s.deviceId, isNull);
    expect(s.activeRole, 'COURIER');
  });
}
