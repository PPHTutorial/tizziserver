import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../social.dart';

/// Screens 4–5 — Welcome / Login-Sign-up landing with social options.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text('Welcome to Stall', style: context.text.displayLarge),
              const SizedBox(height: AppSpace.s8),
              Text(
                'Sign in or create an account to start shopping and tracking deliveries.',
                style: context.text.bodyLarge?.copyWith(color: c.textMed),
              ),
              const Spacer(),
              PrimaryButton(
                label: 'Continue with phone',
                icon: Icons.smartphone,
                onPressed: () => context.push(RoutePaths.phone),
              ),
              const SizedBox(height: AppSpace.s12),
              SecondaryButton(
                label: 'Use email instead',
                onPressed: () => context.push(RoutePaths.email),
              ),
              const SizedBox(height: AppSpace.s20),
              Row(
                children: [
                  Expanded(child: Divider(color: c.border)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12),
                    child: Text('or', style: context.text.bodyMedium?.copyWith(color: c.textLow)),
                  ),
                  Expanded(child: Divider(color: c.border)),
                ],
              ),
              const SizedBox(height: AppSpace.s20),
              for (final p in SocialProviderId.values) ...[
                SecondaryButton(
                  label: p.label,
                  onPressed: () => startSocialSignIn(context, ref, p),
                ),
                const SizedBox(height: AppSpace.s12),
              ],
              const SizedBox(height: AppSpace.s8),
              Center(
                child: TextButton(
                  onPressed: () => context.push(RoutePaths.recovery),
                  child: const Text('Trouble signing in?'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
