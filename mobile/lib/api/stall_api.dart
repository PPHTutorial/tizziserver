import 'package:dio/dio.dart';

import '../core/api_config.dart';
import '../core/token_store.dart';
import 'api_exception.dart';
import 'models.dart';

/// Typed wrapper over the `/api/v1` surface (see `packages/contracts`).
///
/// Responsibilities: attach the tenant + bearer headers, unwrap the
/// `{ ok, data, error }` envelope, and transparently rotate the refresh token
/// once on a `401`. A terminal auth failure invokes [onSessionExpired].
class StallApi {
  StallApi({
    required ApiConfig config,
    required TokenStore tokens,
    this.onSessionExpired,
    Dio? dio,
  })  : _cfg = config,
        _tokens = tokens,
        _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = config.baseUrl
      ..connectTimeout = const Duration(seconds: 15)
      ..receiveTimeout = const Duration(seconds: 20)
      ..headers['X-Platform'] = config.platformSlug
      ..validateStatus = (_) => true; // envelope carries the error; we map it
  }

  final ApiConfig _cfg;
  final TokenStore _tokens;
  final Dio _dio;
  final void Function()? onSessionExpired;

  Future<bool>? _refreshing;

  // --- low level ---------------------------------------------------------

  Map<String, dynamic> _headers({bool auth = true}) => {
        if (auth && (_tokens.access ?? '').isNotEmpty)
          'Authorization': 'Bearer ${_tokens.access}',
      };

  Never _raise(Response<dynamic> res) {
    final body = res.data;
    if (body is Map && body['error'] is Map) {
      final e = body['error'] as Map;
      throw StallApiException(
        code: (e['code'] as String?) ?? 'UNKNOWN',
        message: (e['message'] as String?) ?? 'Request failed',
        status: res.statusCode,
        details: e['details'],
      );
    }
    throw StallApiException(
      code: 'UNKNOWN',
      message: 'Unexpected response (${res.statusCode})',
      status: res.statusCode,
    );
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool auth = true,
    bool canRetry = true,
  }) async {
    Response<dynamic> res;
    try {
      res = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, headers: _headers(auth: auth)),
      );
    } on DioException catch (e) {
      throw StallApiException(
        code: 'NETWORK',
        message: e.message ?? 'Network error — check your connection.',
      );
    }

    if (res.statusCode == 401 && auth && canRetry && _tokens.hasSession) {
      final ok = await _refreshOnce();
      if (ok) {
        return _send(method, path, body: body, query: query, auth: auth, canRetry: false);
      }
      onSessionExpired?.call();
      _raise(res);
    }

    if ((res.statusCode ?? 500) >= 400) _raise(res);

    final data = res.data;
    if (data is Map<String, dynamic>) {
      final inner = data['data'];
      if (inner is Map<String, dynamic>) return inner;
      if (inner is List) return {'items': inner};
      return const {};
    }
    return const {};
  }

  Future<bool> _refreshOnce() {
    return _refreshing ??= () async {
      try {
        final res = await _dio.post<dynamic>(
          '/api/v1/auth/refresh',
          data: {'refreshToken': _tokens.refresh},
          options: Options(headers: {'X-Platform': _cfg.platformSlug}),
        );
        final data = res.data;
        if (res.statusCode == 200 && data is Map && data['data'] is Map) {
          await _tokens.save(TokenPair.fromJson((data['data'] as Map).cast<String, dynamic>()));
          return true;
        }
        return false;
      } catch (_) {
        return false;
      } finally {
        _refreshing = null;
      }
    }();
  }

  // --- endpoints -------------------------------------------------------

  Future<Bootstrap> bootstrap({String? region}) async {
    final d = await _send('GET', '/api/v1/config/bootstrap',
        auth: true, query: region == null ? null : {'region': region});
    return Bootstrap.fromJson(d);
  }

  Future<DateTime> requestOtp({
    String? phone,
    String? email,
    String purpose = 'LOGIN',
  }) async {
    final d = await _send('POST', '/api/v1/auth/otp', auth: false, body: {
      if (phone != null) 'phone': phone,
      if (email != null) 'email': email,
      'purpose': purpose,
    });
    return DateTime.tryParse((d['expiresAt'] as String?) ?? '') ?? DateTime.now();
  }

  Future<LoginResult> verifyOtp({
    String? phone,
    String? email,
    required String code,
    String purpose = 'LOGIN',
    String? totpCode,
    String? activeRole,
    DeviceInfo? device,
  }) async {
    final d = await _send('POST', '/api/v1/auth/verify', auth: false, body: {
      if (phone != null) 'phone': phone,
      if (email != null) 'email': email,
      'code': code,
      'purpose': purpose,
      if (totpCode != null) 'totpCode': totpCode,
      if (activeRole != null) 'activeRole': activeRole,
      if (device != null) 'device': device.toJson(),
    });
    return LoginResult.fromJson(d);
  }

  Future<LoginResult> signInWithSocial({
    required String provider,
    required String token,
    DeviceInfo? device,
  }) async {
    final d = await _send('POST', '/api/v1/auth/social', auth: false, body: {
      'provider': provider,
      'token': token,
      if (device != null) 'device': device.toJson(),
    });
    return LoginResult.fromJson(d);
  }

  Future<void> logout({bool everywhere = false}) =>
      _send('POST', '/api/v1/auth/logout', body: {'everywhere': everywhere});

  Future<List<SessionInfo>> sessions() async {
    final d = await _send('GET', '/api/v1/auth/sessions');
    final items = (d['items'] as List<dynamic>? ?? const []);
    return items
        .map((e) => SessionInfo.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false);
  }

  Future<bool> revokeSession(String sessionId) async {
    final d = await _send('DELETE', '/api/v1/auth/sessions', body: {'sessionId': sessionId});
    return d['revoked'] == true;
  }

  Future<SwitchRoleResult> switchRole(String role) async {
    final d = await _send('POST', '/api/v1/auth/switch-role', body: {'role': role});
    return SwitchRoleResult.fromJson(d);
  }

  Future<void> setPassword(String password) =>
      _send('POST', '/api/v1/auth/password', body: {'password': password});

  Future<void> setPin(String pin) => _send('POST', '/api/v1/auth/pin', body: {'pin': pin});

  Future<TwoFactorEnroll> enroll2fa() async {
    final d = await _send('POST', '/api/v1/auth/2fa', body: {'action': 'enroll'});
    return TwoFactorEnroll.fromJson(d);
  }

  Future<List<String>> confirm2fa(String code) async {
    final d = await _send('POST', '/api/v1/auth/2fa', body: {'action': 'confirm', 'code': code});
    return (d['recoveryCodes'] as List<dynamic>? ?? const []).cast<String>();
  }
}
