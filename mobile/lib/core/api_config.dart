/// Runtime API configuration. Override with `--dart-define`:
///   flutter run --dart-define=STALL_API_URL=http://10.0.2.2:3000 \
///               --dart-define=STALL_REALTIME_URL=http://10.0.2.2:3001 \
///               --dart-define=STALL_PLATFORM=tizzi-gas
class ApiConfig {
  const ApiConfig({
    required this.baseUrl,
    required this.realtimeUrl,
    required this.platformSlug,
  });

  final String baseUrl;
  final String realtimeUrl;
  final String platformSlug;

  /// Human-facing tenant name for chrome that renders before `bootstrap`
  /// resolves (splash wordmark, app title) — mirrors the seeded `Platform.name`
  /// values so it matches once bootstrap does load.
  String get platformDisplayName => switch (platformSlug) {
    'grandprice' => 'GrandPrice',
    'tizzi-gas' => 'Tizzi Gas',
    _ => 'Stall',
  };

  static const ApiConfig fromEnv = ApiConfig(
    baseUrl: String.fromEnvironment(
      'STALL_API_URL',
      defaultValue: 'http://localhost:3000',
    ),
    // apps/realtime is a separate service/port from apps/api (see infra/docker/Caddyfile's
    // rt.$DOMAIN vs api.$DOMAIN split in prod).
    realtimeUrl: String.fromEnvironment(
      'STALL_REALTIME_URL',
      defaultValue: 'http://localhost:3001',
    ),
    platformSlug: String.fromEnvironment(
      'STALL_PLATFORM',
      defaultValue: 'grandprice',
    ),
  );
}

/// Public base for media object keys (product images/video, vendor logos …).
const String kMediaBaseUrl = String.fromEnvironment(
  'STALL_MEDIA_URL',
  defaultValue: 'http://localhost:9000/stall-media',
);

/// Resolve a stored object key to a fetchable URL. Absolute URLs pass through.
/// Legacy `seed/…` / `banners/…` placeholder keys (from before real uploads /
/// while MinIO isn't running) resolve to a stable stock photo so the UI never
/// shows a broken image.
String mediaUrl(String key) {
  if (key.isEmpty) return key;
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  if (key.startsWith('seed/') ||
      key.startsWith('banners/') ||
      key.startsWith('pod/')) {
    // picsum's /seed/:seed/:w/:h route 404s if :seed contains an encoded
    // slash (%2F) — flatten the key to a single path segment first.
    final seed = key.replaceAll('/', '-');
    return 'https://picsum.photos/seed/${Uri.encodeComponent(seed)}/800/800';
  }
  return '$kMediaBaseUrl/${key.replaceFirst(RegExp(r'^/+'), '')}';
}
