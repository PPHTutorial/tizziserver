import '../../api/models.dart';

enum AuthStatus { unknown, unauthenticated, authenticated }

/// Snapshot of who is signed in and what they can act as.
class AuthState {
  const AuthState({
    required this.status,
    this.user,
    this.activeRole,
    this.roles = const [],
    this.roleChosen = false,
    this.accountStatus,
  });

  final AuthStatus status;
  final PublicUser? user;
  final String? activeRole;
  final List<String> roles;

  /// The user has passed through select-role this session (or only holds one).
  final bool roleChosen;

  /// `ACTIVE` | `SUSPENDED` | `DISABLED` | `PENDING` — from the user projection.
  final String? accountStatus;

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get needsRoleSelection => isAuthenticated && roles.length > 1 && !roleChosen;
  bool get isSuspended => accountStatus == 'SUSPENDED';
  bool get isDisabled => accountStatus == 'DISABLED' || accountStatus == 'BANNED';

  const AuthState.unknown() : this(status: AuthStatus.unknown);
  const AuthState.signedOut() : this(status: AuthStatus.unauthenticated);

  AuthState copyWith({
    AuthStatus? status,
    PublicUser? user,
    String? activeRole,
    List<String>? roles,
    bool? roleChosen,
    String? accountStatus,
  }) =>
      AuthState(
        status: status ?? this.status,
        user: user ?? this.user,
        activeRole: activeRole ?? this.activeRole,
        roles: roles ?? this.roles,
        roleChosen: roleChosen ?? this.roleChosen,
        accountStatus: accountStatus ?? this.accountStatus,
      );
}
