import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/models.dart';
import '../api/stall_api.dart';
import '../core/api_config.dart';
import '../core/token_store.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/auth_state.dart';

final apiConfigProvider = Provider<ApiConfig>((_) => ApiConfig.fromEnv);

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (_) => const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  ),
);

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(ref.watch(secureStorageProvider)),
);

final stallApiProvider = Provider<StallApi>((ref) {
  return StallApi(
    config: ref.watch(apiConfigProvider),
    tokens: ref.watch(tokenStoreProvider),
    onSessionExpired: () {
      // Fire-and-forget; the notifier flips router redirects to /welcome.
      Future.microtask(() => ref.read(authControllerProvider.notifier).forceLogout());
    },
  );
});

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Per-tenant capability + nav payload. Refetches when the session changes.
final bootstrapProvider = FutureProvider<Bootstrap>((ref) async {
  ref.watch(authControllerProvider);
  return ref.watch(stallApiProvider).bootstrap();
});
