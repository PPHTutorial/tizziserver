import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/models.dart';

/// Persists the token pair in the platform keystore/keychain. The in-memory
/// [access] / [refresh] copies are the hot path; disk is written through.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _kAccess = 'stall.access';
  static const _kRefresh = 'stall.refresh';
  static const _kRole = 'stall.activeRole';
  static const _kRoles = 'stall.roles';

  String? access;
  String? refresh;
  String? activeRole;
  List<String> roles = const [];

  bool get hasSession => (refresh ?? '').isNotEmpty;

  Future<void> load() async {
    try {
      access = await _storage.read(key: _kAccess);
      refresh = await _storage.read(key: _kRefresh);
      activeRole = await _storage.read(key: _kRole);
      final r = await _storage.read(key: _kRoles);
      roles = (r == null || r.isEmpty) ? const [] : r.split(',');
    } catch (_) {
      // Keystore unavailable (e.g. tests) — treat as no session.
      access = refresh = activeRole = null;
      roles = const [];
    }
  }

  Future<void> save(TokenPair pair) async {
    access = pair.accessToken;
    refresh = pair.refreshToken;
    activeRole = pair.activeRole;
    roles = pair.roles;
    await Future.wait([
      _storage.write(key: _kAccess, value: pair.accessToken),
      _storage.write(key: _kRefresh, value: pair.refreshToken),
      _storage.write(key: _kRole, value: pair.activeRole),
      _storage.write(key: _kRoles, value: pair.roles.join(',')),
    ]);
  }

  /// Update just the access token + role (role switch keeps the same refresh).
  Future<void> updateAccess(String token, String role, List<String> nextRoles) async {
    access = token;
    activeRole = role;
    roles = nextRoles;
    await Future.wait([
      _storage.write(key: _kAccess, value: token),
      _storage.write(key: _kRole, value: role),
      _storage.write(key: _kRoles, value: nextRoles.join(',')),
    ]);
  }

  Future<void> clear() async {
    access = refresh = activeRole = null;
    roles = const [];
    await Future.wait([
      _storage.delete(key: _kAccess),
      _storage.delete(key: _kRefresh),
      _storage.delete(key: _kRole),
      _storage.delete(key: _kRoles),
    ]);
  }
}
