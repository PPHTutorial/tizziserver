import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/router.dart';
import 'auth_util.dart';

/// Providers offered on the welcome / social screens.
enum SocialProviderId { google, apple, facebook }

extension SocialProviderIdX on SocialProviderId {
  String get wire => switch (this) {
        SocialProviderId.google => 'GOOGLE',
        SocialProviderId.apple => 'APPLE',
        SocialProviderId.facebook => 'FACEBOOK',
      };
  String get label => switch (this) {
        SocialProviderId.google => 'Continue with Google',
        SocialProviderId.apple => 'Continue with Apple',
        SocialProviderId.facebook => 'Continue with Facebook',
      };
  IconData get icon => switch (this) {
        SocialProviderId.google => Icons.g_mobiledata,
        SocialProviderId.apple => Icons.apple,
        SocialProviderId.facebook => Icons.facebook,
      };
}

/// A pre-obtained ID token, injected for integration testing:
///   `--dart-define=STALL_SOCIAL_TEST_TOKEN=your-google-id-token`
const _testToken = String.fromEnvironment('STALL_SOCIAL_TEST_TOKEN');

/// Exchanges a provider ID token for a Stall session. The native provider SDKs
/// (google_sign_in / sign_in_with_apple / flutter_facebook_auth) are wired in a
/// follow-up; until then this uses an injected test token or explains that the
/// integration is pending.
Future<void> startSocialSignIn(
  BuildContext context,
  WidgetRef ref,
  SocialProviderId provider,
) async {
  if (_testToken.isEmpty) {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(provider.label),
        content: const Text(
          'Native social sign-in is being wired up. Use phone sign-in for now.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    return;
  }

  final err = await runCatching(() async {
    final api = ref.read(stallApiProvider);
    final result = await api.signInWithSocial(provider: provider.wire, token: _testToken);
    await ref.read(authControllerProvider.notifier).completeLogin(result);
  });

  if (context.mounted && err != null) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
  } else if (context.mounted) {
    context.go(RoutePaths.home);
  }
}
