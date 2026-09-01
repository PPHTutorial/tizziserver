/// A normalised error from the Stall API `{ ok:false, error:{ code, message } }`
/// envelope, or a transport failure.
class StallApiException implements Exception {
  const StallApiException({
    required this.code,
    required this.message,
    this.status,
    this.details,
  });

  /// Server error code (e.g. `INVALID_OTP`, `FEATURE_DISABLED`), or `NETWORK`
  /// / `UNKNOWN` for client-side failures.
  final String code;
  final String message;
  final int? status;
  final Object? details;

  bool get isNetwork => code == 'NETWORK';
  bool get isRateLimited => code == 'RATE_LIMITED' || status == 429;
  bool get isUnauthenticated => status == 401;

  @override
  String toString() => 'StallApiException($code, $status): $message';
}
