// Plain data models mirroring packages/contracts/src/auth.ts. Hand-written and
// kept faithful to the contract (a codegen step can replace this later).

T _req<T>(Map<String, dynamic> j, String k) {
  final v = j[k];
  if (v is! T) {
    throw FormatException('field "$k" expected $T, got ${v.runtimeType}');
  }
  return v;
}

/// The public user projection (`publicUser` DTO).
class PublicUser {
  const PublicUser({
    required this.id,
    this.phone,
    this.email,
    this.firstName,
    this.lastName,
    this.avatar,
    required this.status,
    this.locale,
  });

  final String id;
  final String? phone;
  final String? email;
  final String? firstName;
  final String? lastName;
  final String? avatar;
  final String status;
  final String? locale;

  String get displayName {
    final n = [firstName, lastName].where((s) => s != null && s.isNotEmpty).join(' ');
    if (n.isNotEmpty) return n;
    return phone ?? email ?? 'Account';
  }

  factory PublicUser.fromJson(Map<String, dynamic> j) => PublicUser(
        id: _req<String>(j, 'id'),
        phone: j['phone'] as String?,
        email: j['email'] as String?,
        firstName: j['firstName'] as String?,
        lastName: j['lastName'] as String?,
        avatar: j['avatar'] as String?,
        status: (j['status'] as String?) ?? 'ACTIVE',
        locale: j['locale'] as String?,
      );
}

/// Access + rotating-refresh pair.
class TokenPair {
  const TokenPair({
    required this.accessToken,
    required this.refreshToken,
    required this.activeRole,
    required this.roles,
    required this.refreshExpiresAt,
  });

  final String accessToken;
  final String refreshToken;
  final String activeRole;
  final List<String> roles;
  final String refreshExpiresAt;

  factory TokenPair.fromJson(Map<String, dynamic> j) => TokenPair(
        accessToken: _req<String>(j, 'accessToken'),
        refreshToken: _req<String>(j, 'refreshToken'),
        activeRole: _req<String>(j, 'activeRole'),
        roles: (j['roles'] as List<dynamic>? ?? const []).cast<String>(),
        refreshExpiresAt: (j['refreshExpiresAt'] as String?) ?? '',
      );
}

/// Result of `POST /auth/verify` / `/auth/social`: either an MFA challenge or a
/// completed login.
class LoginResult {
  const LoginResult({this.mfaRequired = false, this.user, this.tokens, this.created});

  final bool mfaRequired;
  final PublicUser? user;
  final TokenPair? tokens;
  final bool? created;

  bool get isComplete => tokens != null;

  factory LoginResult.fromJson(Map<String, dynamic> j) {
    if (j['mfaRequired'] == true) return const LoginResult(mfaRequired: true);
    return LoginResult(
      user: j['user'] is Map<String, dynamic>
          ? PublicUser.fromJson(j['user'] as Map<String, dynamic>)
          : null,
      tokens: TokenPair.fromJson(j),
      created: j['created'] as bool?,
    );
  }
}

class SwitchRoleResult {
  const SwitchRoleResult({required this.accessToken, required this.activeRole, required this.roles});
  final String accessToken;
  final String activeRole;
  final List<String> roles;

  factory SwitchRoleResult.fromJson(Map<String, dynamic> j) => SwitchRoleResult(
        accessToken: _req<String>(j, 'accessToken'),
        activeRole: _req<String>(j, 'activeRole'),
        roles: (j['roles'] as List<dynamic>? ?? const []).cast<String>(),
      );
}

class SessionInfo {
  const SessionInfo({
    required this.id,
    this.deviceId,
    this.platformSlug,
    required this.activeRole,
    this.userAgent,
    this.ip,
    this.lastUsedAt,
    required this.createdAt,
    required this.current,
  });

  final String id;
  final String? deviceId;
  final String? platformSlug;
  final String activeRole;
  final String? userAgent;
  final String? ip;
  final String? lastUsedAt;
  final String createdAt;
  final bool current;

  factory SessionInfo.fromJson(Map<String, dynamic> j) => SessionInfo(
        id: _req<String>(j, 'id'),
        deviceId: j['deviceId'] as String?,
        platformSlug: j['platformSlug'] as String?,
        activeRole: (j['activeRole'] as String?) ?? 'CUSTOMER',
        userAgent: j['userAgent'] as String?,
        ip: j['ip'] as String?,
        lastUsedAt: j['lastUsedAt'] as String?,
        createdAt: (j['createdAt'] as String?) ?? '',
        current: j['current'] == true,
      );
}

class TwoFactorEnroll {
  const TwoFactorEnroll({required this.uri, required this.secret});
  final String uri;
  final String secret;
  factory TwoFactorEnroll.fromJson(Map<String, dynamic> j) =>
      TwoFactorEnroll(uri: _req<String>(j, 'uri'), secret: _req<String>(j, 'secret'));
}

class NavItemDto {
  const NavItemDto({required this.key, required this.label, required this.icon, required this.route});
  final String key;
  final String label;
  final String icon;
  final String route;

  factory NavItemDto.fromJson(Map<String, dynamic> j) => NavItemDto(
        key: _req<String>(j, 'key'),
        label: _req<String>(j, 'label'),
        icon: (j['icon'] as String?) ?? 'circle',
        route: (j['route'] as String?) ?? '/',
      );
}

class PlatformInfo {
  const PlatformInfo({required this.slug, required this.name, required this.defaultCurrency});
  final String slug;
  final String name;
  final String defaultCurrency;

  factory PlatformInfo.fromJson(Map<String, dynamic> j) => PlatformInfo(
        slug: (j['slug'] as String?) ?? 'grandprice',
        name: (j['name'] as String?) ?? 'Stall',
        defaultCurrency: (j['defaultCurrency'] as String?) ?? 'USD',
      );
}

/// `GET /config/bootstrap` — everything the client needs on launch.
class Bootstrap {
  const Bootstrap({
    required this.platform,
    required this.authenticated,
    this.activeRole,
    required this.roles,
    required this.features,
    required this.nav,
    required this.minAppVersion,
  });

  final PlatformInfo platform;
  final bool authenticated;
  final String? activeRole;
  final List<String> roles;
  final Map<String, dynamic> features;
  final List<NavItemDto> nav;
  final Map<String, String> minAppVersion;

  bool hasFeature(String key) {
    final v = features[key];
    if (v == null || v == false || v == 0 || v == '' || v == 'off' || v == 'false') {
      return false;
    }
    return true;
  }

  factory Bootstrap.fromJson(Map<String, dynamic> j) => Bootstrap(
        platform: PlatformInfo.fromJson((j['platform'] as Map<String, dynamic>?) ?? const {}),
        authenticated: j['authenticated'] == true,
        activeRole: j['activeRole'] as String?,
        roles: (j['roles'] as List<dynamic>? ?? const []).cast<String>(),
        features: (j['features'] as Map<String, dynamic>?) ?? const {},
        nav: (j['nav'] as List<dynamic>? ?? const [])
            .map((e) => NavItemDto.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
        minAppVersion: ((j['minAppVersion'] as Map<String, dynamic>?) ?? const {})
            .map((k, v) => MapEntry(k, v.toString())),
      );
}

/// Registered device metadata sent on login.
class DeviceInfo {
  const DeviceInfo({
    required this.deviceId,
    required this.platform,
    this.model,
    this.pushToken,
    this.appVersion,
  });

  final String deviceId;
  final String platform; // IOS | ANDROID | WEB
  final String? model;
  final String? pushToken;
  final String? appVersion;

  Map<String, dynamic> toJson() => {
        'deviceId': deviceId,
        'platform': platform,
        if (model != null) 'model': model,
        if (pushToken != null) 'pushToken': pushToken,
        if (appVersion != null) 'appVersion': appVersion,
      };
}
