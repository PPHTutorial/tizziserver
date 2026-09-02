import 'package:dio/dio.dart';

import '../core/api_config.dart';
import '../core/token_store.dart';
import 'api_exception.dart';
import 'catalog_models.dart';
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

  // --- catalog (Phase 2) -------------------------------------------

  List<T> _items<T>(Map<String, dynamic> d, T Function(Map<String, dynamic>) map) =>
      (d['items'] as List<dynamic>? ?? const [])
          .map((e) => map((e as Map).cast<String, dynamic>()))
          .toList(growable: false);

  Future<List<CategoryDto>> categories({bool tree = false}) async {
    final d = await _send('GET', '/api/v1/catalog/categories',
        auth: false, query: tree ? {'tree': '1'} : null);
    final key = tree ? 'tree' : 'items';
    return (d[key] as List<dynamic>? ?? const [])
        .map((e) => CategoryDto.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false);
  }

  Future<PageResult<ProductCard>> products({
    String? category,
    String? vendorId,
    String? sort,
    String? cursor,
    int? limit,
  }) async {
    final d = await _send('GET', '/api/v1/catalog/products', auth: false, query: {
      if (category != null) 'category': category,
      if (vendorId != null) 'vendorId': vendorId,
      if (sort != null) 'sort': sort,
      if (cursor != null) 'cursor': cursor,
      if (limit != null) 'limit': '$limit',
    });
    return PageResult(items: _items(d, ProductCard.fromJson), nextCursor: d['nextCursor'] as String?);
  }

  Future<ProductDetail> product(String slug) async {
    final d = await _send('GET', '/api/v1/catalog/products/$slug', auth: false);
    return ProductDetail.fromJson(d);
  }

  Future<List<ProductCard>> similar(String slug, {int limit = 8}) async {
    final d = await _send('GET', '/api/v1/catalog/products/$slug/similar',
        auth: false, query: {'limit': '$limit'});
    return _items(d, ProductCard.fromJson);
  }

  Future<HomeRails> home() async {
    final d = await _send('GET', '/api/v1/catalog/home', auth: false);
    return HomeRails.fromJson(d);
  }

  Future<List<PromotionView>> promotions({String? kind}) async {
    final d = await _send('GET', '/api/v1/promotions',
        auth: false, query: {if (kind != null) 'kind': kind});
    return _items(d, PromotionView.fromJson);
  }

  Future<PromotionView> promotion(String slug) async {
    final d = await _send('GET', '/api/v1/promotions/$slug', auth: false);
    return PromotionView.fromJson(d);
  }

  Future<({List<ProductCard> items, int total, int page})> search(
    String q, {
    String? category,
    int? minPrice,
    int? maxPrice,
    String? sort,
    int page = 1,
  }) async {
    final d = await _send('GET', '/api/v1/search', auth: false, query: {
      'q': q,
      if (category != null) 'category': category,
      if (minPrice != null) 'minPrice': '$minPrice',
      if (maxPrice != null) 'maxPrice': '$maxPrice',
      if (sort != null) 'sort': sort,
      'page': '$page',
    });
    return (
      items: _items(d, ProductCard.fromJson),
      total: (d['total'] as num?)?.toInt() ?? 0,
      page: (d['page'] as num?)?.toInt() ?? 1,
    );
  }

  Future<List<NearbyVendorDto>> nearbyVendors({
    required double lat,
    required double lng,
    int radiusM = 5000,
  }) async {
    final d = await _send('GET', '/api/v1/search/nearby', auth: false, query: {
      'lat': '$lat',
      'lng': '$lng',
      'radius': '$radiusM',
    });
    return _items(d, NearbyVendorDto.fromJson);
  }

  Future<VendorPage> vendor(String id) async {
    final d = await _send('GET', '/api/v1/vendors/$id', auth: false);
    return VendorPage.fromJson(d);
  }

  Future<PageResult<ProductCard>> vendorProducts(String id, {String? cursor}) async {
    final d = await _send('GET', '/api/v1/vendors/$id/products',
        auth: false, query: {if (cursor != null) 'cursor': cursor});
    return PageResult(items: _items(d, ProductCard.fromJson), nextCursor: d['nextCursor'] as String?);
  }

  Future<void> addReview(String slug, {required int rating, String? title, String? body}) =>
      _send('POST', '/api/v1/catalog/products/$slug/reviews',
          body: {'rating': rating, if (title != null) 'title': title, if (body != null) 'body': body});

  Future<void> askQuestion(String slug, String body) =>
      _send('POST', '/api/v1/catalog/products/$slug/questions', body: {'body': body});

  // --- shopper engagement --------------------------------------

  Future<List<WishlistItemDto>> wishlist() async {
    final d = await _send('GET', '/api/v1/me/wishlist');
    return _items(d, WishlistItemDto.fromJson);
  }

  Future<bool> toggleWishlist(String productId, {required bool add}) async {
    final d = await _send(add ? 'POST' : 'DELETE', '/api/v1/me/wishlist', body: {'productId': productId});
    return d['wished'] == true;
  }

  Future<List<WishlistItemDto>> recentlyViewed() async {
    final d = await _send('GET', '/api/v1/me/recently-viewed');
    return _items(d, WishlistItemDto.fromJson);
  }

  // --- vendor authoring --------------------------------------

  Future<VendorStatus> vendorMe() async {
    final d = await _send('GET', '/api/v1/vendors/me');
    return VendorStatus.fromJson(d);
  }

  Future<VendorStatus> vendorOnboard({
    required String displayName,
    String? bio,
    required Map<String, dynamic> business,
  }) async {
    final d = await _send('POST', '/api/v1/vendors/onboarding', body: {
      'displayName': displayName,
      if (bio != null) 'bio': bio,
      'business': business,
    });
    return VendorStatus.fromJson({'onboarded': true, ...d});
  }

  Future<List<MyProduct>> myProducts({String? status}) async {
    final d = await _send('GET', '/api/v1/vendors/products',
        query: {if (status != null) 'status': status});
    return _items(d, MyProduct.fromJson);
  }

  Future<String> createProduct({
    required String title,
    required String description,
    required String categoryId,
    required int priceMinor,
    String? brand,
    List<String>? images,
  }) async {
    final d = await _send('POST', '/api/v1/vendors/products', body: {
      'title': title,
      'description': description,
      'categoryId': categoryId,
      'priceMinor': priceMinor,
      if (brand != null) 'brand': brand,
      if (images != null) 'images': images,
    });
    return d['id'] as String;
  }

  Future<void> updateProduct(
    String id, {
    String? title,
    String? description,
    int? priceMinor,
    List<String>? images,
    int? quantity,
  }) =>
      _send('PATCH', '/api/v1/vendors/products/$id', body: {
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (priceMinor != null) 'priceMinor': priceMinor,
        if (images != null) 'images': images,
        if (quantity != null) 'quantity': quantity,
      });

  Future<void> publishProduct(String id) =>
      _send('POST', '/api/v1/vendors/products/$id/publish');

  Future<VendorStats> vendorStats() async {
    final d = await _send('GET', '/api/v1/vendors/stats');
    return VendorStats.fromJson(d);
  }

  Future<List<BusinessDocumentDto>> businessDocuments() async {
    final d = await _send('GET', '/api/v1/vendors/business/documents');
    return _items(d, BusinessDocumentDto.fromJson);
  }

  Future<void> addBusinessDocument({required String type, required String fileKey}) =>
      _send('POST', '/api/v1/vendors/business/documents', body: {'type': type, 'fileKey': fileKey});
}
