/// Runtime API configuration. Override with `--dart-define`:
///   flutter run --dart-define=STALL_API_URL=http://10.0.2.2:3000 \
///               --dart-define=STALL_PLATFORM=tizzi-gas
class ApiConfig {
  const ApiConfig({required this.baseUrl, required this.platformSlug});

  final String baseUrl;
  final String platformSlug;

  static const ApiConfig fromEnv = ApiConfig(
    baseUrl: String.fromEnvironment('STALL_API_URL', defaultValue: 'http://localhost:3000'),
    platformSlug: String.fromEnvironment('STALL_PLATFORM', defaultValue: 'grandprice'),
  );
}
