import 'dart:convert';

import 'package:dio/dio.dart';

import '../core/api_config.dart';
import '../core/token_store.dart';
import 'api_exception.dart';
import 'ads_models.dart';
import 'auction_models.dart';
import 'catalog_models.dart';
import 'commerce_models.dart';
import 'comms_models.dart';
import 'delivery_models.dart';
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
  }) : _cfg = config,
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
    Map<String, String>? extraHeaders,
  }) async {
    Response<dynamic> res;
    try {
      res = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(
          method: method,
          headers: {
            ..._headers(auth: auth),
            ...?extraHeaders,
          },
        ),
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
        return _send(
          method,
          path,
          body: body,
          query: query,
          auth: auth,
          canRetry: false,
          extraHeaders: extraHeaders,
        );
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
          await _tokens.save(
            TokenPair.fromJson((data['data'] as Map).cast<String, dynamic>()),
          );
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
    final d = await _send(
      'GET',
      '/api/v1/config/bootstrap',
      auth: true,
      query: region == null ? null : {'region': region},
    );
    return Bootstrap.fromJson(d);
  }

  Future<DateTime> requestOtp({
    String? phone,
    String? email,
    String purpose = 'LOGIN',
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/auth/otp',
      auth: false,
      body: {
        if (phone != null) 'phone': phone,
        if (email != null) 'email': email,
        'purpose': purpose,
      },
    );
    return DateTime.tryParse((d['expiresAt'] as String?) ?? '') ??
        DateTime.now();
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
    final d = await _send(
      'POST',
      '/api/v1/auth/verify',
      auth: false,
      body: {
        if (phone != null) 'phone': phone,
        if (email != null) 'email': email,
        'code': code,
        'purpose': purpose,
        if (totpCode != null) 'totpCode': totpCode,
        if (activeRole != null) 'activeRole': activeRole,
        if (device != null) 'device': device.toJson(),
      },
    );
    return LoginResult.fromJson(d);
  }

  Future<LoginResult> signInWithSocial({
    required String provider,
    required String token,
    DeviceInfo? device,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/auth/social',
      auth: false,
      body: {
        'provider': provider,
        'token': token,
        if (device != null) 'device': device.toJson(),
      },
    );
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

  /// "Edit Profile" in Settings.
  Future<PublicUser> updateProfile({
    String? firstName,
    String? lastName,
    String? avatar,
  }) async {
    final d = await _send(
      'PATCH',
      '/api/v1/me/profile',
      body: {
        if (firstName != null) 'firstName': firstName,
        if (lastName != null) 'lastName': lastName,
        if (avatar != null) 'avatar': avatar,
      },
    );
    return PublicUser.fromJson(d);
  }

  /// Uploads an image (avatar / vendor logo / vendor banner) and returns its
  /// storage key — pass that key to [updateProfile] / [updateVendorProfile].
  Future<String> uploadMedia({
    required List<int> bytes,
    required String filename,
    required String kind,
  }) async {
    final form = FormData.fromMap({
      'kind': kind,
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: MultipartFile.lookupMediaType(filename),
      ),
    });
    final d = await _send('POST', '/api/v1/media/upload', body: form);
    return d['key'] as String;
  }

  /// "Edit shop profile" — name/bio/logo/banner, separate from onboarding.
  /// Callers should invalidate [vendorStatusProvider] after this resolves.
  Future<void> updateVendorProfile({
    String? displayName,
    String? bio,
    String? logo,
    String? banner,
  }) =>
      _send(
        'PATCH',
        '/api/v1/vendors/me',
        body: {
          if (displayName != null) 'displayName': displayName,
          if (bio != null) 'bio': bio,
          if (logo != null) 'logo': logo,
          if (banner != null) 'banner': banner,
        },
      );

  Future<bool> revokeSession(String sessionId) async {
    final d = await _send(
      'DELETE',
      '/api/v1/auth/sessions',
      body: {'sessionId': sessionId},
    );
    return d['revoked'] == true;
  }

  Future<SwitchRoleResult> switchRole(String role) async {
    final d = await _send(
      'POST',
      '/api/v1/auth/switch-role',
      body: {'role': role},
    );
    return SwitchRoleResult.fromJson(d);
  }

  Future<void> setPassword(String password) =>
      _send('POST', '/api/v1/auth/password', body: {'password': password});

  Future<void> setPin(String pin) =>
      _send('POST', '/api/v1/auth/pin', body: {'pin': pin});

  Future<TwoFactorEnroll> enroll2fa() async {
    final d = await _send(
      'POST',
      '/api/v1/auth/2fa',
      body: {'action': 'enroll'},
    );
    return TwoFactorEnroll.fromJson(d);
  }

  Future<List<String>> confirm2fa(String code) async {
    final d = await _send(
      'POST',
      '/api/v1/auth/2fa',
      body: {'action': 'confirm', 'code': code},
    );
    return (d['recoveryCodes'] as List<dynamic>? ?? const []).cast<String>();
  }

  // --- catalog (Phase 2) -------------------------------------------

  List<T> _items<T>(
    Map<String, dynamic> d,
    T Function(Map<String, dynamic>) map,
  ) => (d['items'] as List<dynamic>? ?? const [])
      .map((e) => map((e as Map).cast<String, dynamic>()))
      .toList(growable: false);

  Future<List<CategoryDto>> categories({bool tree = false}) async {
    final d = await _send(
      'GET',
      '/api/v1/catalog/categories',
      auth: false,
      query: tree ? {'tree': '1'} : null,
    );
    final key = tree ? 'tree' : 'items';
    return (d[key] as List<dynamic>? ?? const [])
        .map((e) => CategoryDto.fromJson((e as Map).cast<String, dynamic>()))
        .toList(growable: false);
  }

  /// Top-level categories for the "Browse categories" grid. [filter] is
  /// 'all' (default sort order) or a real-data ranking: 'trending' (recent
  /// order volume), 'new' (recently published products), 'auction' (has a
  /// live Inverse Draw). Categories with a zero count are dropped server-side.
  Future<List<CategoryDto>> rootCategories({String filter = 'all'}) async {
    final d = await _send(
      'GET',
      '/api/v1/catalog/categories',
      auth: false,
      query: {'filter': filter},
    );
    return (d['roots'] as List<dynamic>? ?? const [])
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
    final d = await _send(
      'GET',
      '/api/v1/catalog/products',
      auth: false,
      query: {
        if (category != null) 'category': category,
        if (vendorId != null) 'vendorId': vendorId,
        if (sort != null) 'sort': sort,
        if (cursor != null) 'cursor': cursor,
        if (limit != null) 'limit': '$limit',
      },
    );
    return PageResult(
      items: _items(d, ProductCard.fromJson),
      nextCursor: d['nextCursor'] as String?,
    );
  }

  Future<ProductDetail> product(String slug) async {
    final d = await _send('GET', '/api/v1/catalog/products/$slug', auth: false);
    return ProductDetail.fromJson(d);
  }

  Future<List<ProductCard>> similar(String slug, {int limit = 8}) async {
    final d = await _send(
      'GET',
      '/api/v1/catalog/products/$slug/similar',
      auth: false,
      query: {'limit': '$limit'},
    );
    return _items(d, ProductCard.fromJson);
  }

  Future<HomeRails> home() async {
    final d = await _send('GET', '/api/v1/catalog/home', auth: false);
    return HomeRails.fromJson(d);
  }

  Future<List<PromotionView>> promotions({String? kind}) async {
    final d = await _send(
      'GET',
      '/api/v1/promotions',
      auth: false,
      query: {if (kind != null) 'kind': kind},
    );
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
    final d = await _send(
      'GET',
      '/api/v1/search',
      auth: false,
      query: {
        'q': q,
        if (category != null) 'category': category,
        if (minPrice != null) 'minPrice': '$minPrice',
        if (maxPrice != null) 'maxPrice': '$maxPrice',
        if (sort != null) 'sort': sort,
        'page': '$page',
      },
    );
    return (
      items: _items(d, ProductCard.fromJson),
      total: (d['total'] as num?)?.toInt() ?? 0,
      page: (d['page'] as num?)?.toInt() ?? 1,
    );
  }

  /// Barcode/SKU scan → product slug, or null if nothing matches.
  Future<String?> scanCode(String code) async {
    final d = await _send(
      'GET',
      '/api/v1/catalog/scan',
      auth: false,
      query: {'code': code},
    );
    return d['slug'] as String?;
  }

  Future<List<NearbyVendorDto>> nearbyVendors({
    required double lat,
    required double lng,
    int radiusM = 5000,
  }) async {
    final d = await _send(
      'GET',
      '/api/v1/search/nearby',
      auth: false,
      query: {'lat': '$lat', 'lng': '$lng', 'radius': '$radiusM'},
    );
    return _items(d, NearbyVendorDto.fromJson);
  }

  Future<VendorPage> vendor(String id) async {
    final d = await _send('GET', '/api/v1/vendors/$id', auth: false);
    return VendorPage.fromJson(d);
  }

  Future<PageResult<ProductCard>> vendorProducts(
    String id, {
    String? cursor,
  }) async {
    final d = await _send(
      'GET',
      '/api/v1/vendors/$id/products',
      auth: false,
      query: {if (cursor != null) 'cursor': cursor},
    );
    return PageResult(
      items: _items(d, ProductCard.fromJson),
      nextCursor: d['nextCursor'] as String?,
    );
  }

  Future<void> addReview(
    String slug, {
    required int rating,
    String? title,
    String? body,
  }) => _send(
    'POST',
    '/api/v1/catalog/products/$slug/reviews',
    body: {
      'rating': rating,
      if (title != null) 'title': title,
      if (body != null) 'body': body,
    },
  );

  Future<ReviewsPage> productReviews(String slug, {String? cursor}) async {
    final d = await _send(
      'GET',
      '/api/v1/catalog/products/$slug/reviews',
      query: {if (cursor != null) 'cursor': cursor},
    );
    return ReviewsPage.fromJson(d);
  }

  Future<void> askQuestion(String slug, String body) => _send(
    'POST',
    '/api/v1/catalog/products/$slug/questions',
    body: {'body': body},
  );

  // --- shopper engagement --------------------------------------

  Future<List<WishlistItemDto>> wishlist() async {
    final d = await _send('GET', '/api/v1/me/wishlist');
    return _items(d, WishlistItemDto.fromJson);
  }

  Future<bool> toggleWishlist(String productId, {required bool add}) async {
    final d = await _send(
      add ? 'POST' : 'DELETE',
      '/api/v1/me/wishlist',
      body: {'productId': productId},
    );
    return d['wished'] == true;
  }

  Future<List<RecentlyViewedItemDto>> recentlyViewed() async {
    final d = await _send('GET', '/api/v1/me/recently-viewed');
    return _items(d, RecentlyViewedItemDto.fromJson);
  }

  Future<void> clearRecentlyViewed() =>
      _send('DELETE', '/api/v1/me/recently-viewed');

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
    final d = await _send(
      'POST',
      '/api/v1/vendors/onboarding',
      body: {
        'displayName': displayName,
        if (bio != null) 'bio': bio,
        'business': business,
      },
    );
    return VendorStatus.fromJson({'onboarded': true, ...d});
  }

  Future<List<MyProduct>> myProducts({String? status}) async {
    final d = await _send(
      'GET',
      '/api/v1/vendors/products',
      query: {if (status != null) 'status': status},
    );
    return _items(d, MyProduct.fromJson);
  }

  Future<VendorProductDetail> myProduct(String id) async {
    final d = await _send('GET', '/api/v1/vendors/products/$id');
    return VendorProductDetail.fromJson(d);
  }

  Future<String> createProduct({
    required String title,
    required String description,
    required String categoryId,
    required int priceMinor,
    String? brand,
    String? condition,
    List<String>? images,
    Map<String, dynamic>? attributes,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/vendors/products',
      body: {
        'title': title,
        'description': description,
        'categoryId': categoryId,
        'priceMinor': priceMinor,
        if (brand != null) 'brand': brand,
        if (condition != null) 'condition': condition,
        if (images != null) 'images': images,
        if (attributes != null) 'attributes': attributes,
      },
    );
    return d['id'] as String;
  }

  Future<void> updateProduct(
    String id, {
    String? title,
    String? description,
    String? condition,
    int? priceMinor,
    List<String>? images,
    int? quantity,
    Map<String, dynamic>? attributes,
  }) => _send(
    'PATCH',
    '/api/v1/vendors/products/$id',
    body: {
      if (title != null) 'title': title,
      if (description != null) 'description': description,
      if (condition != null) 'condition': condition,
      if (priceMinor != null) 'priceMinor': priceMinor,
      if (images != null) 'images': images,
      if (quantity != null) 'quantity': quantity,
      if (attributes != null) 'attributes': attributes,
    },
  );

  Future<void> publishProduct(String id) =>
      _send('POST', '/api/v1/vendors/products/$id/publish');

  Future<void> setListingPaused(String id, bool paused) => _send(
    'POST',
    '/api/v1/vendors/products/$id/pause',
    body: {'paused': paused},
  );

  Future<void> archiveProduct(String id) =>
      _send('DELETE', '/api/v1/vendors/products/$id');

  Future<VendorStats> vendorStats() async {
    final d = await _send('GET', '/api/v1/vendors/stats');
    return VendorStats.fromJson(d);
  }

  Future<List<BusinessDocumentDto>> businessDocuments() async {
    final d = await _send('GET', '/api/v1/vendors/business/documents');
    return _items(d, BusinessDocumentDto.fromJson);
  }

  Future<void> addBusinessDocument({
    required String type,
    required String fileKey,
  }) => _send(
    'POST',
    '/api/v1/vendors/business/documents',
    body: {'type': type, 'fileKey': fileKey},
  );

  // --- Phase 3: addresses -------------------------------------------
  Future<List<AddressDto>> addresses() async {
    final d = await _send('GET', '/api/v1/me/addresses');
    return (d['items'] as List<dynamic>? ?? const [])
        .map((e) => AddressDto.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<AddressDto> saveAddress(
    Map<String, dynamic> body, {
    String? id,
  }) async {
    final d = id == null
        ? await _send('POST', '/api/v1/me/addresses', body: body)
        : await _send('PATCH', '/api/v1/me/addresses/$id', body: body);
    return AddressDto.fromJson(d);
  }

  Future<void> deleteAddress(String id) =>
      _send('DELETE', '/api/v1/me/addresses/$id');

  // --- Phase 3: payment methods ----------------------------------
  Future<List<PaymentMethodDto>> paymentMethods() async {
    final d = await _send('GET', '/api/v1/me/payment-methods');
    return _items(d, PaymentMethodDto.fromJson);
  }

  Future<PaymentMethodDto> addPaymentMethod({
    required String gateway,
    required String token,
    String? brand,
    String? last4,
    int? expMonth,
    int? expYear,
    bool makeDefault = false,
  }) async => PaymentMethodDto.fromJson(
    await _send(
      'POST',
      '/api/v1/me/payment-methods',
      body: {
        'gateway': gateway,
        'token': token,
        if (brand != null) 'brand': brand,
        if (last4 != null) 'last4': last4,
        if (expMonth != null) 'expMonth': expMonth,
        if (expYear != null) 'expYear': expYear,
        'makeDefault': makeDefault,
      },
    ),
  );

  Future<void> removePaymentMethod(String id) =>
      _send('DELETE', '/api/v1/me/payment-methods/$id');

  // --- Phase 3: cart -----------------------------------------------
  Future<CartDto> cart() async =>
      CartDto.fromJson(await _send('GET', '/api/v1/cart'));

  Future<CartDto> addToCart(
    String offerId, {
    String? variantId,
    int qty = 1,
  }) async => CartDto.fromJson(
    await _send(
      'POST',
      '/api/v1/cart/items',
      body: {
        'offerId': offerId,
        if (variantId != null) 'variantId': variantId,
        'qty': qty,
      },
    ),
  );

  Future<CartDto> updateCartItem(
    String itemId, {
    int? qty,
    bool? savedForLater,
  }) async => CartDto.fromJson(
    await _send(
      'PATCH',
      '/api/v1/cart/items/$itemId',
      body: {
        if (qty != null) 'qty': qty,
        if (savedForLater != null) 'savedForLater': savedForLater,
      },
    ),
  );

  Future<CartDto> removeCartItem(String itemId) async =>
      CartDto.fromJson(await _send('DELETE', '/api/v1/cart/items/$itemId'));

  Future<CartDto> clearCart() async =>
      CartDto.fromJson(await _send('DELETE', '/api/v1/cart'));

  Future<CartDto> applyCoupon(String code) async => CartDto.fromJson(
    await _send('POST', '/api/v1/cart/coupon', body: {'code': code}),
  );

  Future<CartDto> removeCoupon() async =>
      CartDto.fromJson(await _send('DELETE', '/api/v1/cart/coupon'));

  // --- Phase 3: coupons -----------------------------------------
  Future<List<CouponDto>> coupons() async {
    final d = await _send('GET', '/api/v1/coupons');
    return (d['items'] as List<dynamic>? ?? const [])
        .map((e) => CouponDto.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<CouponEvalDto> validateCoupon(String code) async =>
      CouponEvalDto.fromJson(
        await _send('POST', '/api/v1/coupons/validate', body: {'code': code}),
      );

  // --- Phase 3: checkout + orders -----------------------------
  Future<CheckoutQuoteDto> checkoutQuote({
    String? fulfilmentMethod,
    String? couponCode,
  }) async => CheckoutQuoteDto.fromJson(
    await _send(
      'POST',
      '/api/v1/checkout/quote',
      body: {
        if (fulfilmentMethod != null) 'fulfilmentMethod': fulfilmentMethod,
        if (couponCode != null) 'couponCode': couponCode,
      },
    ),
  );

  Future<OrderDto> placeOrder({
    required String paymentMethod, // "wallet" | "gateway"
    String? gateway,
    String? addressId,
    String fulfilmentMethod = 'DELIVERY',
    String? couponCode,
    required String idempotencyKey,
  }) async => OrderDto.fromJson(
    await _send(
      'POST',
      '/api/v1/checkout',
      extraHeaders: {'Idempotency-Key': idempotencyKey},
      body: {
        'fulfilmentMethod': fulfilmentMethod,
        if (addressId != null) 'addressId': addressId,
        if (couponCode != null) 'couponCode': couponCode,
        'payment': {
          'method': paymentMethod,
          if (gateway != null) 'gateway': gateway,
        },
      },
    ),
  );

  Future<List<OrderCardDto>> orders({String? status, String? cursor}) async {
    final d = await _send(
      'GET',
      '/api/v1/orders',
      query: {
        if (status != null) 'status': status,
        if (cursor != null) 'cursor': cursor,
      },
    );
    return (d['items'] as List<dynamic>? ?? const [])
        .map((e) => OrderCardDto.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<OrderDto> order(String id) async =>
      OrderDto.fromJson(await _send('GET', '/api/v1/orders/$id'));

  Future<OrderDto> cancelOrder(String id) async =>
      OrderDto.fromJson(await _send('POST', '/api/v1/orders/$id/cancel'));

  /// Request a return on specific items of a completed sub-order.
  Future<({String id, String status, int amountMinor})> requestReturn(
    String orderId,
    String vendorOrderId, {
    required String reason,
    required List<({String orderItemId, int qty})> items,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/orders/$orderId/return',
      body: {
        'vendorOrderId': vendorOrderId,
        'reason': reason,
        'items': items
            .map((it) => {'orderItemId': it.orderItemId, 'qty': it.qty})
            .toList(),
      },
    );
    return (
      id: (d['id'] as String?) ?? '',
      status: (d['status'] as String?) ?? '',
      amountMinor: (d['amountMinor'] as num?)?.toInt() ?? 0,
    );
  }

  /// Downloads the invoice PDF for a fulfilled order as raw bytes. Not a
  /// `{ok,data,error}` JSON envelope call like the rest of this client — the
  /// server route returns the file directly, so this bypasses `_send`.
  Future<List<int>> orderInvoiceBytes(String orderId) async {
    Response<List<int>> res;
    try {
      res = await _dio.get<List<int>>(
        '/api/v1/orders/$orderId/invoice',
        options: Options(headers: _headers(), responseType: ResponseType.bytes),
      );
    } on DioException catch (e) {
      throw StallApiException(
        code: 'NETWORK',
        message: e.message ?? 'Network error — check your connection.',
      );
    }
    if ((res.statusCode ?? 500) >= 400) {
      var message = 'Request failed';
      var code = 'UNKNOWN';
      try {
        final decoded = jsonDecode(utf8.decode(res.data ?? const []));
        if (decoded is Map && decoded['error'] is Map) {
          message = (decoded['error']['message'] as String?) ?? message;
          code = (decoded['error']['code'] as String?) ?? code;
        }
      } catch (_) {}
      throw StallApiException(
        code: code,
        message: message,
        status: res.statusCode,
      );
    }
    return res.data ?? const [];
  }

  // --- Phase 3: wallet ------------------------------------------
  Future<WalletDto> wallet() async =>
      WalletDto.fromJson(await _send('GET', '/api/v1/wallet'));

  Future<List<WalletTxnDto>> walletTransactions({String? cursor}) async {
    final d = await _send(
      'GET',
      '/api/v1/wallet/transactions',
      query: {if (cursor != null) 'cursor': cursor},
    );
    return (d['items'] as List<dynamic>? ?? const [])
        .map((e) => WalletTxnDto.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  /// Same endpoint as [walletTransactions], but also surfaces the pagination
  /// cursor — used by the full transaction-history screen's "load more".
  Future<({List<WalletTxnDto> items, String? nextCursor})> walletTransactionsPage({
    String? cursor,
  }) async {
    final d = await _send(
      'GET',
      '/api/v1/wallet/transactions',
      query: {if (cursor != null) 'cursor': cursor},
    );
    return (
      items: (d['items'] as List<dynamic>? ?? const [])
          .map((e) => WalletTxnDto.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
      nextCursor: d['nextCursor'] as String?,
    );
  }

  Future<WalletDto> walletTopUp(int amountMinor, {String? gateway}) async {
    final d = await _send(
      'POST',
      '/api/v1/wallet/topup',
      extraHeaders: {
        'Idempotency-Key': 'topup-${DateTime.now().microsecondsSinceEpoch}',
      },
      body: {
        'amountMinor': amountMinor,
        if (gateway != null) 'gateway': gateway,
      },
    );
    return WalletDto(
      currency: 'GHS',
      balanceMinor: (d['balanceMinor'] as num?)?.toInt() ?? 0,
      pinRequired: true,
    );
  }

  Future<int> walletWithdraw({
    required int amountMinor,
    required String pin,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/wallet/withdraw',
      body: {'amountMinor': amountMinor, 'pin': pin},
    );
    return (d['balanceMinor'] as num?)?.toInt() ?? 0;
  }

  // --- Phase 4: customer delivery + tracking -----------------------

  Future<List<DeliveryDto>> deliveries({
    bool active = false,
    String? cursor,
  }) async {
    final d = await _send(
      'GET',
      '/api/v1/deliveries',
      query: {if (active) 'active': '1', if (cursor != null) 'cursor': cursor},
    );
    return _items(d, DeliveryDto.fromJson);
  }

  Future<DeliveryDto> delivery(String id) async =>
      DeliveryDto.fromJson(await _send('GET', '/api/v1/deliveries/$id'));

  Future<DeliveryTrackDto> deliveryTrack(String id) async =>
      DeliveryTrackDto.fromJson(
        await _send('GET', '/api/v1/deliveries/$id/track'),
      );

  Future<DeliveryEstimateDto> deliveryEstimate({
    required double pickupLat,
    required double pickupLng,
    required double dropLat,
    required double dropLng,
    String? vehicleType,
  }) async => DeliveryEstimateDto.fromJson(
    await _send(
      'POST',
      '/api/v1/deliveries/estimate',
      body: {
        'pickup': {'lat': pickupLat, 'lng': pickupLng},
        'dropoff': {'lat': dropLat, 'lng': dropLng},
        if (vehicleType != null) 'vehicleType': vehicleType,
      },
    ),
  );

  Future<DeliveryDto> createDelivery(Map<String, dynamic> body) async =>
      DeliveryDto.fromJson(
        await _send(
          'POST',
          '/api/v1/deliveries',
          extraHeaders: {
            'Idempotency-Key': 'dlv-${DateTime.now().microsecondsSinceEpoch}',
          },
          body: body,
        ),
      );

  Future<DeliveryDto> cancelDelivery(String id, {String? reason}) async =>
      DeliveryDto.fromJson(
        await _send(
          'POST',
          '/api/v1/deliveries/$id/cancel',
          body: {if (reason != null) 'reason': reason},
        ),
      );

  Future<void> rateDelivery(
    String id, {
    required int stars,
    List<String>? tags,
    String? comment,
  }) => _send(
    'POST',
    '/api/v1/deliveries/$id/rate',
    body: {
      'stars': stars,
      if (tags != null) 'tags': tags,
      if (comment != null) 'comment': comment,
    },
  );

  Future<void> disputeDelivery(
    String id, {
    required String category,
    required String body,
  }) => _send(
    'POST',
    '/api/v1/deliveries/$id/dispute',
    body: {'category': category, 'body': body},
  );

  // --- Phase 4: courier ------------------------------------------

  Future<CourierMeDto> courierMe() async =>
      CourierMeDto.fromJson(await _send('GET', '/api/v1/courier/me'));

  Future<Map<String, dynamic>> courierOnboard({
    String? firstName,
    String? lastName,
    bool agreementAccepted = false,
  }) => _send(
    'POST',
    '/api/v1/courier/onboarding',
    body: {
      if (firstName != null) 'firstName': firstName,
      if (lastName != null) 'lastName': lastName,
      'agreementAccepted': agreementAccepted,
    },
  );

  Future<void> courierSubmitKyc({
    required List<Map<String, String>> documents,
    String? selfieKey,
  }) => _send(
    'POST',
    '/api/v1/courier/kyc',
    body: {
      'documents': documents,
      if (selfieKey != null) 'selfieKey': selfieKey,
    },
  );

  Future<Map<String, dynamic>> courierAddVehicle({
    required String type,
    String? make,
    String? model,
    String? color,
    String? plate,
    int? year,
  }) => _send(
    'POST',
    '/api/v1/courier/vehicles',
    body: {
      'type': type,
      if (make != null) 'make': make,
      if (model != null) 'model': model,
      if (color != null) 'color': color,
      if (plate != null) 'plate': plate,
      if (year != null) 'year': year,
    },
  );

  Future<void> courierUpdateVehicle(
    String id, {
    String? type,
    String? make,
    String? model,
    String? color,
    String? plate,
    int? year,
  }) => _send(
    'PATCH',
    '/api/v1/courier/vehicles/$id',
    body: {
      if (type != null) 'type': type,
      if (make != null) 'make': make,
      if (model != null) 'model': model,
      if (color != null) 'color': color,
      if (plate != null) 'plate': plate,
      if (year != null) 'year': year,
    },
  );

  Future<void> courierRemoveVehicle(String id) =>
      _send('DELETE', '/api/v1/courier/vehicles/$id');

  Future<void> courierSetActiveVehicle(String id) =>
      _send('POST', '/api/v1/courier/vehicles/$id/active');

  Future<void> courierAddVehicleDocument(
    String id, {
    required String type,
    required String fileKey,
    String? expiresAt,
  }) => _send(
    'POST',
    '/api/v1/courier/vehicles/$id/documents',
    body: {
      'type': type,
      'fileKey': fileKey,
      if (expiresAt != null) 'expiresAt': expiresAt,
    },
  );

  Future<void> courierUpsertServiceArea({
    String? id,
    required String name,
    required double centerLat,
    required double centerLng,
    required int radiusM,
    bool? enabled,
  }) => _send(
    'POST',
    '/api/v1/courier/service-areas',
    body: {
      if (id != null) 'id': id,
      'name': name,
      'centerLat': centerLat,
      'centerLng': centerLng,
      'radiusM': radiusM,
      if (enabled != null) 'enabled': enabled,
    },
  );

  Future<void> courierRemoveServiceArea(String id) =>
      _send('DELETE', '/api/v1/courier/service-areas/$id');

  Future<void> courierSetAvailability(List<Map<String, dynamic>> slots) =>
      _send('PATCH', '/api/v1/courier/availability', body: {'slots': slots});

  Future<CourierDashboardDto> courierDashboard() async =>
      CourierDashboardDto.fromJson(
        await _send('GET', '/api/v1/courier/dashboard'),
      );

  Future<Map<String, dynamic>> courierPerformance() =>
      _send('GET', '/api/v1/courier/performance');

  Future<String> courierGoOnline(double lat, double lng) async {
    final d = await _send(
      'POST',
      '/api/v1/courier/online',
      body: {'lat': lat, 'lng': lng},
    );
    return d['onlineStatus'] as String? ?? 'ONLINE';
  }

  Future<String> courierGoOffline() async {
    final d = await _send('POST', '/api/v1/courier/offline');
    return d['onlineStatus'] as String? ?? 'OFFLINE';
  }

  Future<void> courierHeartbeat(
    double lat,
    double lng, {
    double? heading,
    double? speed,
  }) => _send(
    'POST',
    '/api/v1/courier/heartbeat',
    body: {
      'lat': lat,
      'lng': lng,
      if (heading != null) 'heading': heading,
      if (speed != null) 'speed': speed,
    },
  );

  Future<List<JobCardDto>> courierJobs({double? lat, double? lng}) async {
    final d = await _send(
      'GET',
      '/api/v1/courier/jobs',
      query: {if (lat != null) 'lat': '$lat', if (lng != null) 'lng': '$lng'},
    );
    return _items(d, JobCardDto.fromJson);
  }

  Future<Map<String, dynamic>> courierJob(String offerId) =>
      _send('GET', '/api/v1/courier/jobs/$offerId');

  Future<Map<String, dynamic>> respondToOffer(
    String offerId, {
    required bool accept,
    String? reason,
  }) => _send(
    'POST',
    '/api/v1/courier/offers/$offerId/respond',
    body: {
      'response': accept ? 'ACCEPTED' : 'DECLINED',
      if (reason != null) 'reason': reason,
    },
  );

  Future<List<DeliveryDto>> courierDeliveries({bool active = false}) async {
    final d = await _send(
      'GET',
      '/api/v1/courier/deliveries',
      query: {if (active) 'active': '1'},
    );
    return _items(d, DeliveryDto.fromJson);
  }

  Future<DeliveryDto> courierDelivery(String id) async => DeliveryDto.fromJson(
    await _send('GET', '/api/v1/courier/deliveries/$id'),
  );

  Future<DeliveryDto> advanceDelivery(
    String id,
    String to, {
    double? lat,
    double? lng,
  }) async => DeliveryDto.fromJson(
    await _send(
      'POST',
      '/api/v1/courier/deliveries/$id/advance',
      body: {
        'to': to,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      },
    ),
  );

  Future<DeliveryDto> verifyPickup(
    String id, {
    String? code,
    int? packageCount,
    String? conditionNote,
  }) async => DeliveryDto.fromJson(
    await _send(
      'POST',
      '/api/v1/courier/deliveries/$id/verify-pickup',
      body: {
        if (code != null) 'code': code,
        if (packageCount != null) 'packageCount': packageCount,
        if (conditionNote != null) 'conditionNote': conditionNote,
      },
    ),
  );

  Future<DeliveryDto> verifyDropoff(
    String id, {
    String? code,
    String? recipientName,
    String? signatureKey,
  }) async => DeliveryDto.fromJson(
    await _send(
      'POST',
      '/api/v1/courier/deliveries/$id/verify-dropoff',
      body: {
        if (code != null) 'code': code,
        if (recipientName != null) 'recipientName': recipientName,
        if (signatureKey != null) 'signatureKey': signatureKey,
      },
    ),
  );

  Future<DeliveryDto> submitPod(
    String id, {
    required List<String> photoKeys,
    String? notes,
  }) async => DeliveryDto.fromJson(
    await _send(
      'POST',
      '/api/v1/courier/deliveries/$id/pod',
      body: {'photoKeys': photoKeys, if (notes != null) 'notes': notes},
    ),
  );

  Future<DeliveryDto> failDelivery(String id, {required String reason}) async =>
      DeliveryDto.fromJson(
        await _send(
          'POST',
          '/api/v1/courier/deliveries/$id/fail',
          body: {'reason': reason},
        ),
      );

  Future<void> courierBreadcrumb(
    String id,
    double lat,
    double lng, {
    double? heading,
    double? speed,
  }) => _send(
    'POST',
    '/api/v1/courier/deliveries/$id/breadcrumb',
    body: {
      'lat': lat,
      'lng': lng,
      if (heading != null) 'heading': heading,
      if (speed != null) 'speed': speed,
    },
  );

  Future<void> courierRateCustomer(
    String id, {
    required int stars,
    String? comment,
  }) => _send(
    'POST',
    '/api/v1/courier/deliveries/$id/rate',
    body: {'stars': stars, if (comment != null) 'comment': comment},
  );

  Future<EarningsSummaryDto> courierEarnings() async =>
      EarningsSummaryDto.fromJson(
        await _send('GET', '/api/v1/courier/earnings'),
      );

  Future<List<EarningTxnDto>> courierEarningTxns({String? cursor}) async {
    final d = await _send(
      'GET',
      '/api/v1/courier/earnings/transactions',
      query: {if (cursor != null) 'cursor': cursor},
    );
    return _items(d, EarningTxnDto.fromJson);
  }

  Future<int> courierRequestPayout({
    required int amountMinor,
    required String pin,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/courier/payouts',
      body: {'amountMinor': amountMinor, 'pin': pin},
    );
    return (d['balanceMinor'] as num?)?.toInt() ?? 0;
  }

  // --- Phase 4: vendor order fulfilment + pickup handoff -------

  Future<List<SellerOrderDto>> sellerOrders({String? status}) async {
    final d = await _send(
      'GET',
      '/api/v1/vendors/orders',
      query: {if (status != null) 'status': status},
    );
    return _items(d, SellerOrderDto.fromJson);
  }

  Future<SellerOrderDetailDto> sellerOrder(String id) async =>
      SellerOrderDetailDto.fromJson(
        await _send('GET', '/api/v1/vendors/orders/$id'),
      );

  /// Advance a sub-order (`ACCEPTED` → … → `HANDED_OVER`). Returns the new status
  /// and, once a delivery is spawned, its id.
  Future<({String status, String? deliveryId})> advanceSellerOrder(
    String id,
    String status,
  ) async {
    final d = await _send(
      'PATCH',
      '/api/v1/vendors/orders/$id',
      body: {'status': status},
    );
    return (
      status: (d['status'] as String?) ?? status,
      deliveryId: d['deliveryId'] as String?,
    );
  }

  /// Mark the sub-order COMPLETED — releases the seller payout from escrow.
  Future<void> completeSellerOrder(String id) =>
      _send('POST', '/api/v1/vendors/orders/$id/complete');

  /// The seller's return queue.
  Future<List<VendorReturnDto>> sellerReturns({String? status}) async {
    final d = await _send(
      'GET',
      '/api/v1/vendors/returns',
      query: {if (status != null) 'status': status},
    );
    return _items(d, VendorReturnDto.fromJson);
  }

  /// Approve (refunds the customer) or reject a return.
  Future<({String status, int? refundAmountMinor, String? refundMethod})>
  reviewReturn(
    String returnId, {
    required String decision,
    String? note,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/vendors/returns/$returnId/review',
      body: {'decision': decision, if (note != null) 'note': note},
    );
    final refund = d['refund'] as Map?;
    return (
      status: (d['status'] as String?) ?? decision,
      refundAmountMinor: (refund?['amountMinor'] as num?)?.toInt(),
      refundMethod: refund?['method'] as String?,
    );
  }

  /// PIN-gated: cash out the vendor's accrued payout balance.
  Future<int> vendorRequestPayout({
    required int amountMinor,
    required String pin,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/vendors/payouts',
      body: {'amountMinor': amountMinor, 'pin': pin},
    );
    return (d['balanceMinor'] as num?)?.toInt() ?? 0;
  }

  Future<List<PayoutDto>> vendorPayouts() async {
    final d = await _send('GET', '/api/v1/vendors/payouts');
    return _items(d, PayoutDto.fromJson);
  }

  Future<DeliveryDto> vendorDelivery(String id) async => DeliveryDto.fromJson(
    await _send('GET', '/api/v1/vendors/deliveries/$id'),
  );

  // --- Phase 5: Inverse Draws / auctions ----------------------

  Future<List<AuctionCardDto>> auctions({String? status}) async {
    final d = await _send(
      'GET',
      '/api/v1/auctions',
      auth: false,
      query: {if (status != null) 'status': status},
    );
    return _items(d, AuctionCardDto.fromJson);
  }

  Future<AuctionDetailDto> auction(String slug) async =>
      AuctionDetailDto.fromJson(
        await _send('GET', '/api/v1/auctions/$slug', auth: true),
      );

  Future<List<({int rank, String name, int ticketCount, double score})>>
  auctionLeaderboard(String slug, {int limit = 20}) async {
    final d = await _send(
      'GET',
      '/api/v1/auctions/$slug/leaderboard',
      auth: false,
      query: {'limit': '$limit'},
    );
    return (d['items'] as List<dynamic>? ?? const [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .map(
          (m) => (
            rank: (m['rank'] as num?)?.toInt() ?? 0,
            name: (m['name'] as String?) ?? 'Participant',
            ticketCount: (m['ticketCount'] as num?)?.toInt() ?? 0,
            score: (m['qualificationScore'] as num?)?.toDouble() ?? 0,
          ),
        )
        .toList();
  }

  Future<QualificationDto> auctionQualification(String slug) async =>
      QualificationDto.fromJson(
        await _send('GET', '/api/v1/auctions/$slug/qualification'),
      );

  Future<double> auctionQualify(
    String slug, {
    required String factor,
    String? key,
    double? points,
  }) async {
    final d = await _send(
      'POST',
      '/api/v1/auctions/$slug/qualify',
      body: {
        'factor': factor,
        if (key != null) 'key': key,
        if (points != null) 'points': points,
      },
    );
    return (d['qualificationScore'] as num?)?.toDouble() ?? 0;
  }

  Future<Map<String, dynamic>> buyTickets(
    String slug, {
    String? packageId,
    int? count,
    required String paymentMethod,
    String? gateway,
  }) => _send(
    'POST',
    '/api/v1/auctions/$slug/tickets',
    extraHeaders: {
      'Idempotency-Key': 'seats-${DateTime.now().microsecondsSinceEpoch}',
    },
    body: {
      if (packageId != null) 'packageId': packageId,
      if (count != null) 'count': count,
      'payment': {
        'method': paymentMethod,
        if (gateway != null) 'gateway': gateway,
      },
    },
  );

  Future<List<TicketWalletDto>> myTicketWallets() async {
    final d = await _send('GET', '/api/v1/me/tickets');
    return _items(d, TicketWalletDto.fromJson);
  }

  Future<
    ({int totalTickets, int activeEntries, int amountWonMinor, String currency})
  >
  myTicketStats() async {
    final d = await _send('GET', '/api/v1/me/tickets/stats');
    return (
      totalTickets: d['totalTickets'] as int? ?? 0,
      activeEntries: d['activeEntries'] as int? ?? 0,
      amountWonMinor: d['amountWonMinor'] as int? ?? 0,
      currency: d['currency'] as String? ?? 'GHS',
    );
  }

  Future<List<({String serial, int? seatNo, String source, String status})>>
  myTicketsFor(String slug) async {
    final d = await _send('GET', '/api/v1/me/tickets/$slug');
    return (d['items'] as List<dynamic>? ?? const [])
        .map((e) => (e as Map).cast<String, dynamic>())
        .map(
          (m) => (
            serial: (m['serial'] as String?) ?? '',
            seatNo: (m['seatNo'] as num?)?.toInt(),
            source: (m['source'] as String?) ?? 'PURCHASE',
            status: (m['status'] as String?) ?? 'ACTIVE',
          ),
        )
        .toList();
  }

  Future<MyWinDto> auctionMyWin(String slug) async =>
      MyWinDto.fromJson(await _send('GET', '/api/v1/auctions/$slug/me/win'));

  Future<void> disputeAuction(String slug, {required String body}) =>
      _send('POST', '/api/v1/auctions/$slug/dispute', body: {'body': body});

  // --- Phase 6: chat ----------------------------------------------

  Future<List<ConversationCardDto>> conversations() async {
    final d = await _send('GET', '/api/v1/conversations');
    return _items(d, ConversationCardDto.fromJson);
  }

  Future<String> conversationForOrder(String orderId) async {
    final d = await _send(
      'POST',
      '/api/v1/conversations/for-order',
      body: {'orderId': orderId},
    );
    return d['conversationId'] as String;
  }

  Future<String> conversationForDelivery(String deliveryId) async {
    final d = await _send(
      'POST',
      '/api/v1/conversations/for-delivery',
      body: {'deliveryId': deliveryId},
    );
    return d['conversationId'] as String;
  }

  Future<String> conversationForVendor(String vendorId) async {
    final d = await _send(
      'POST',
      '/api/v1/conversations/for-vendor',
      body: {'vendorId': vendorId},
    );
    return d['conversationId'] as String;
  }

  Future<({List<ChatMessageDto> items, String? nextCursor})> messages(
    String conversationId, {
    String? cursor,
  }) async {
    final d = await _send(
      'GET',
      '/api/v1/conversations/$conversationId/messages',
      query: {if (cursor != null) 'cursor': cursor},
    );
    return (
      items: _items(d, ChatMessageDto.fromJson),
      nextCursor: d['nextCursor'] as String?,
    );
  }

  Future<void> sendMessage(
    String conversationId, {
    String? body,
    Object? attachments,
    String? kind,
  }) => _send(
    'POST',
    '/api/v1/conversations/$conversationId/messages',
    body: {
      if (kind != null) 'kind': kind,
      if (body != null) 'body': body,
      if (attachments != null) 'attachments': attachments,
    },
  );

  Future<void> markConversationRead(String conversationId) =>
      _send('POST', '/api/v1/conversations/$conversationId/read');

  Future<void> blockUser(String targetUserId) =>
      _send('POST', '/api/v1/me/blocks', body: {'targetUserId': targetUserId});

  // --- Phase 6: notifications ------------------------------------

  Future<NotificationFeedDto> notifications({
    bool unreadOnly = false,
    String? cursor,
  }) async => NotificationFeedDto.fromJson(
    await _send(
      'GET',
      '/api/v1/notifications',
      query: {
        if (unreadOnly) 'unread': '1',
        if (cursor != null) 'cursor': cursor,
      },
    ),
  );

  Future<void> markNotificationRead(String id) =>
      _send('POST', '/api/v1/notifications/$id/read');
  Future<void> markAllNotificationsRead() =>
      _send('POST', '/api/v1/notifications/read-all');

  Future<List<NotificationPrefDto>> notificationPreferences() async {
    final d = await _send('GET', '/api/v1/notifications/preferences');
    return _items(d, NotificationPrefDto.fromJson);
  }

  Future<List<NotificationPrefDto>> setNotificationPreference(
    String category, {
    bool? push,
    bool? email,
    bool? sms,
    bool? inApp,
  }) async {
    final d = await _send(
      'PATCH',
      '/api/v1/notifications/preferences',
      body: {
        'category': category,
        if (push != null) 'push': push,
        if (email != null) 'email': email,
        if (sms != null) 'sms': sms,
        if (inApp != null) 'inApp': inApp,
      },
    );
    return _items(d, NotificationPrefDto.fromJson);
  }

  // --- Phase 6: disputes + reports + security ------------------

  Future<List<DisputeDto>> disputes() async {
    final d = await _send('GET', '/api/v1/disputes');
    return _items(d, DisputeDto.fromJson);
  }

  Future<DisputeDto> dispute(String id) async =>
      DisputeDto.fromJson(await _send('GET', '/api/v1/disputes/$id'));

  Future<Map<String, dynamic>> openDispute({
    required String kind,
    required String refId,
    required String category,
    required String body,
  }) => _send(
    'POST',
    '/api/v1/disputes',
    body: {'kind': kind, 'refId': refId, 'category': category, 'body': body},
  );

  Future<void> addDisputeEvidence(
    String id, {
    String? fileKey,
    String? body,
    String? kind,
  }) => _send(
    'POST',
    '/api/v1/disputes/$id/evidence',
    body: {
      if (kind != null) 'kind': kind,
      if (fileKey != null) 'fileKey': fileKey,
      if (body != null) 'body': body,
    },
  );

  Future<void> sendDisputeMessage(String id, String body) =>
      _send('POST', '/api/v1/disputes/$id/messages', body: {'body': body});

  Future<void> appealDispute(String id, String body) =>
      _send('POST', '/api/v1/disputes/$id/appeal', body: {'body': body});

  Future<void> submitReport({
    required String targetType,
    required String targetId,
    required String category,
    required String body,
  }) => _send(
    'POST',
    '/api/v1/reports',
    body: {
      'targetType': targetType,
      'targetId': targetId,
      'category': category,
      'body': body,
    },
  );

  Future<List<ReportDto>> myReports() async {
    final d = await _send('GET', '/api/v1/me/reports');
    return _items(d, ReportDto.fromJson);
  }

  Future<SecurityCentreDto> securityCentre() async =>
      SecurityCentreDto.fromJson(await _send('GET', '/api/v1/me/security'));

  // --- Phase 6: support ----------------------------------------

  Future<HelpCenterDto> helpCenter() async => HelpCenterDto.fromJson(
    await _send('GET', '/api/v1/support/help', auth: false),
  );

  Future<List<SupportTicketDto>> supportTickets() async {
    final d = await _send('GET', '/api/v1/support/tickets');
    return _items(d, SupportTicketDto.fromJson);
  }

  Future<SupportTicketDto> supportTicket(String id) async =>
      SupportTicketDto.fromJson(
        await _send('GET', '/api/v1/support/tickets/$id'),
      );

  Future<Map<String, dynamic>> createSupportTicket({
    required String category,
    required String subject,
    required String body,
    String? priority,
  }) => _send(
    'POST',
    '/api/v1/support/tickets',
    body: {
      'category': category,
      'subject': subject,
      'body': body,
      if (priority != null) 'priority': priority,
    },
  );

  Future<String> auctionStartClaim(String slug) async {
    final d = await _send('POST', '/api/v1/auctions/$slug/claim');
    return d['claimId'] as String? ?? '';
  }

  Future<void> auctionSubmitClaimKyc(
    String claimId, {
    required List<Map<String, String>> documents,
  }) => _send(
    'POST',
    '/api/v1/auctions/claims/$claimId/kyc',
    body: {'documents': documents},
  );

  Future<Map<String, dynamic>> auctionWinPurchase(
    String slug, {
    required String paymentMethod,
    String? gateway,
  }) => _send(
    'POST',
    '/api/v1/auctions/$slug/win-purchase',
    extraHeaders: {
      'Idempotency-Key': 'winbuy-${DateTime.now().microsecondsSinceEpoch}',
    },
    body: {
      'payment': {
        'method': paymentMethod,
        if (gateway != null) 'gateway': gateway,
      },
    },
  );

  // --- Phase 7: advertising / boosting -------------------------------

  Future<List<BoostTierDto>> boostTiers() async {
    final d = await _send('GET', '/api/v1/ads/tiers');
    return _items(d, BoostTierDto.fromJson);
  }

  Future<List<SponsoredCardDto>> sponsored({
    required String slot,
    String? categoryId,
    int? limit,
  }) async {
    final d = await _send(
      'GET',
      '/api/v1/ads/sponsored',
      auth: false,
      query: {
        'slot': slot,
        if (categoryId != null) 'categoryId': categoryId,
        if (limit != null) 'limit': '$limit',
      },
    );
    return _items(d, SponsoredCardDto.fromJson);
  }

  Future<void> logAdEvent({
    required String campaignId,
    String? adId,
    required String kind,
    String? placement,
  }) => _send(
    'POST',
    '/api/v1/ads/events',
    auth: false,
    body: {
      'campaignId': campaignId,
      if (adId != null) 'adId': adId,
      'kind': kind,
      if (placement != null) 'placement': placement,
    },
  );

  Future<List<CampaignDto>> campaigns({String? status}) async {
    final d = await _send(
      'GET',
      '/api/v1/vendors/campaigns',
      query: {if (status != null) 'status': status},
    );
    return _items(d, CampaignDto.fromJson);
  }

  Future<CampaignDetailDto> campaign(String id) async =>
      CampaignDetailDto.fromJson(
        await _send('GET', '/api/v1/vendors/campaigns/$id'),
      );

  Future<CampaignDto> createCampaign({
    required String name,
    String? objective,
    String? boostTierKey,
    required int budgetMinor,
    int? dailyCapMinor,
    List<String>? productIds,
    Map<String, dynamic>? targeting,
  }) async => CampaignDto.fromJson(
    await _send(
      'POST',
      '/api/v1/vendors/campaigns',
      body: {
        'name': name,
        if (objective != null) 'objective': objective,
        if (boostTierKey != null) 'boostTierKey': boostTierKey,
        'budgetMinor': budgetMinor,
        if (dailyCapMinor != null) 'dailyCapMinor': dailyCapMinor,
        if (productIds != null) 'productIds': productIds,
        if (targeting != null) 'targeting': targeting,
      },
    ),
  );

  Future<void> setCampaignProducts(String id, List<String> productIds) => _send(
    'POST',
    '/api/v1/vendors/campaigns/$id/products',
    body: {'productIds': productIds},
  );

  Future<void> addCampaignCreative(
    String id, {
    required String slot,
    String? creativeKind,
    String? headline,
    String? subtext,
    String? productId,
    String? imageKey,
    String? destinationRoute,
    int? weight,
  }) => _send(
    'POST',
    '/api/v1/vendors/campaigns/$id/creatives',
    body: {
      'slot': slot,
      if (creativeKind != null) 'creativeKind': creativeKind,
      if (headline != null) 'headline': headline,
      if (subtext != null) 'subtext': subtext,
      if (productId != null) 'productId': productId,
      if (imageKey != null) 'imageKey': imageKey,
      if (destinationRoute != null) 'destinationRoute': destinationRoute,
      if (weight != null) 'weight': weight,
    },
  );

  Future<void> updateCampaignCreative(
    String id,
    String adId, {
    String? slot,
    String? headline,
    String? subtext,
    String? productId,
    String? imageKey,
    String? destinationRoute,
    int? weight,
    bool? isActive,
  }) => _send(
    'PATCH',
    '/api/v1/vendors/campaigns/$id/creatives/$adId',
    body: {
      if (slot != null) 'slot': slot,
      if (headline != null) 'headline': headline,
      if (subtext != null) 'subtext': subtext,
      if (productId != null) 'productId': productId,
      if (imageKey != null) 'imageKey': imageKey,
      if (destinationRoute != null) 'destinationRoute': destinationRoute,
      if (weight != null) 'weight': weight,
      if (isActive != null) 'isActive': isActive,
    },
  );

  Future<void> removeCampaignCreative(String id, String adId) =>
      _send('DELETE', '/api/v1/vendors/campaigns/$id/creatives/$adId');

  Future<CampaignDto> submitCampaign(
    String id, {
    required String paymentMethod,
    String? gateway,
  }) async => CampaignDto.fromJson(
    await _send(
      'POST',
      '/api/v1/vendors/campaigns/$id/submit',
      extraHeaders: {'Idempotency-Key': 'camp-sub-$id'},
      body: {
        'payment': {
          'method': paymentMethod,
          if (gateway != null) 'gateway': gateway,
        },
      },
    ),
  );

  Future<CampaignDto> pauseCampaign(String id) async => CampaignDto.fromJson(
    await _send('POST', '/api/v1/vendors/campaigns/$id/pause'),
  );
  Future<CampaignDto> resumeCampaign(String id) async => CampaignDto.fromJson(
    await _send('POST', '/api/v1/vendors/campaigns/$id/resume'),
  );
  Future<CampaignDto> cancelCampaign(String id) async => CampaignDto.fromJson(
    await _send('POST', '/api/v1/vendors/campaigns/$id/cancel'),
  );

  // --- Phase 7: analytics ------------------------------------------

  Future<VendorAnalyticsDto> vendorAnalytics({int days = 30}) async =>
      VendorAnalyticsDto.fromJson(
        await _send(
          'GET',
          '/api/v1/vendors/analytics',
          query: {'days': '$days'},
        ),
      );

  Future<CourierAnalyticsDto> courierAnalytics({int days = 30}) async =>
      CourierAnalyticsDto.fromJson(
        await _send(
          'GET',
          '/api/v1/courier/analytics',
          query: {'days': '$days'},
        ),
      );

  // --- Phase 7: referrals ----------------------------------------

  Future<ReferralSummaryDto> referralSummary() async =>
      ReferralSummaryDto.fromJson(await _send('GET', '/api/v1/me/referrals'));

  Future<void> applyReferralCode(String code, {String? channel}) => _send(
    'POST',
    '/api/v1/me/referrals/apply',
    body: {'code': code, if (channel != null) 'channel': channel},
  );
}
