import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/widgets.dart';

/// Screen 20 — Account suspended (temporary; support can lift it).
class AccountSuspendedScreen extends ConsumerWidget {
  const AccountSuspendedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CenteredState.error(
      title: 'Your account is suspended',
      body:
          'Access is paused while we review recent activity. Contact support@stall.example if you think this is a mistake.',
      action: SecondaryButton(
        label: 'Sign out',
        onPressed: () async {
          await ref.read(authControllerProvider.notifier).logout();
          if (context.mounted) context.go(RoutePaths.welcome);
        },
      ),
    );
  }
}

/// Screen 19 — Account disabled / banned (terminal).
class AccountDisabledScreen extends ConsumerWidget {
  const AccountDisabledScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CenteredState.error(
      title: 'This account has been disabled',
      body: 'You can no longer sign in. Contact support@stall.example for more information.',
      action: SecondaryButton(
        label: 'Sign out',
        onPressed: () async {
          await ref.read(authControllerProvider.notifier).logout();
          if (context.mounted) context.go(RoutePaths.welcome);
        },
      ),
    );
  }
}
