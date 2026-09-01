import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../social.dart';

/// Screen 13 — dedicated social sign-in options.
class SocialAuthScreen extends ConsumerWidget {
  const SocialAuthScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AuthScaffold(
      title: 'Continue with a social account',
      subtitle: 'Use an account you already have. We only read your name and email.',
      children: [
        for (final p in SocialProviderId.values) ...[
          SecondaryButton(
            label: p.label,
            onPressed: () => startSocialSignIn(context, ref, p),
          ),
          const SizedBox(height: AppSpace.s12),
        ],
      ],
    );
  }
}
