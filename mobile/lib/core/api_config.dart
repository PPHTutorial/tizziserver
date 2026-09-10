/// Runtime API configuration. Override with `--dart-define`:
///   flutter run --dart-define=STALL_API_URL=http://10.0.2.2:3000 \
///               --dart-define=STALL_REALTIME_URL=http://10.0.2.2:3001 \
///               --dart-define=STALL_PLATFORM=tizzi-gas
class ApiConfig {
  const ApiConfig({required this.baseUrl, required this.realtimeUrl, required this.platformSlug});

  final String baseUrl;
  final String realtimeUrl;
  final String platformSlug;

  static const ApiConfig fromEnv = ApiConfig(
    baseUrl: String.fromEnvironment('STALL_API_URL', defaultValue: 'http://localhost:3000'),
    // apps/realtime is a separate service/port from apps/api (see infra/docker/Caddyfile's
    // rt.$DOMAIN vs api.$DOMAIN split in prod).
    realtimeUrl: String.fromEnvironment('STALL_REALTIME_URL', defaultValue: 'http://localhost:3001'),
    platformSlug: String.fromEnvironment('STALL_PLATFORM', defaultValue: 'grandprice'),
  );
}

/// Public base for media object keys (product images/video, vendor logos …).
const String kMediaBaseUrl =
    String.fromEnvironment('STALL_MEDIA_URL', defaultValue: 'http://localhost:9000/stall-media');

/// Resolve a stored object key to a fetchable URL. Absolute URLs pass through.
String mediaUrl(String key) {
  if (key.isEmpty) return key;
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  return '$kMediaBaseUrl/${key.replaceFirst(RegExp(r'^/+'), '')}';
}
