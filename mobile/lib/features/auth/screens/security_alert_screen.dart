import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';

/// Screen 19 — Security alert (e.g. "new sign-in detected"). Reached from a
/// push notification; lets the user confirm or lock the account down.
class SecurityAlertScreen extends ConsumerWidget {
  const SecurityAlertScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Security alert')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: AppSpace.s8),
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: c.errorContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.shield_outlined, color: c.error, size: 30),
              ),
              const SizedBox(height: AppSpace.s16),
              Text('New sign-in to your account', style: context.text.titleLarge),
              const SizedBox(height: AppSpace.s8),
              Text(
                'We noticed a sign-in from a device we didn\'t recognise. If this was you, no action is needed.',
                style: context.text.bodyLarge?.copyWith(color: c.textMed),
              ),
              const Spacer(),
              PrimaryButton(
                label: 'This was me',
                onPressed: () => context.canPop() ? context.pop() : context.go(RoutePaths.home),
              ),
              const SizedBox(height: AppSpace.s12),
              SecondaryButton(
                label: 'Secure my account — sign out everywhere',
                onPressed: () async {
                  await ref.read(authControllerProvider.notifier).logout(everywhere: true);
                  if (context.mounted) context.go(RoutePaths.welcome);
                },
              ),
              const SizedBox(height: AppSpace.s8),
              TextButton(
                onPressed: () => context.go(RoutePaths.sessions),
                child: const Text('Review signed-in devices'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
