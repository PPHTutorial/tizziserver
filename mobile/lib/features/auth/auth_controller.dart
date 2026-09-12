import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../app/providers.dart';
import 'auth_state.dart';

/// Owns the session lifecycle. UI never touches [TokenStore] directly — it goes
/// through here so router redirects react to a single source of truth.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState.unknown();

  /// Called once at startup (from the splash screen).
  Future<void> restore() async {
    try {
      final tokens = ref.read(tokenStoreProvider);
      await tokens.load();
      if (!tokens.hasSession) {
        state = const AuthState.signedOut();
        return;
      }
      state = AuthState(
        status: AuthStatus.authenticated,
        activeRole: tokens.activeRole,
        roles: tokens.roles,
        roleChosen: tokens.roles.length <= 1,
        accountStatus: 'ACTIVE',
      );
    } catch (_) {
      state = const AuthState.signedOut();
    }
  }

  /// Commit a completed login/social result.
  Future<void> completeLogin(LoginResult result) async {
    final pair = result.tokens;
    if (pair == null) return;
    await ref.read(tokenStoreProvider).save(pair);
    state = AuthState(
      status: AuthStatus.authenticated,
      user: result.user,
      activeRole: pair.activeRole,
      roles: pair.roles,
      roleChosen: pair.roles.length <= 1,
      accountStatus: result.user?.status ?? 'ACTIVE',
    );
  }

  Future<void> chooseRole(String role) async {
    final api = ref.read(stallApiProvider);
    final res = await api.switchRole(role);
    await ref
        .read(tokenStoreProvider)
        .updateAccess(res.accessToken, res.activeRole, res.roles);
    state = state.copyWith(
      activeRole: res.activeRole,
      roles: res.roles,
      roleChosen: true,
    );
  }

  /// Mark role selection satisfied without a server round-trip (single-role, or
  /// the user picked the role the token already carries).
  void confirmRole() => state = state.copyWith(roleChosen: true);

  Future<void> logout({bool everywhere = false}) async {
    try {
      await ref.read(stallApiProvider).logout(everywhere: everywhere);
    } catch (_) {
      // best-effort — clear locally regardless
    }
    await ref.read(tokenStoreProvider).clear();
    state = const AuthState.signedOut();
  }

  /// Invoked by the API layer when a refresh fails terminally.
  Future<void> forceLogout() async {
    await ref.read(tokenStoreProvider).clear();
    state = const AuthState.signedOut();
  }

  void applyAccountStatus(String status) =>
      state = state.copyWith(accountStatus: status);

  /// Updates the cached user projection in place — used after a profile edit
  /// so the Account tab / home header reflect the new name immediately
  /// without a full re-fetch.
  void setUser(PublicUser user) => state = state.copyWith(user: user);
}
