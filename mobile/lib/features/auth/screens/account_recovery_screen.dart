import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../../design/components.dart';
import '../../../design/icons.dart';

/// Screen 14 — Account recovery options for a user who can't complete the
/// normal sign-in (lost number / lost authenticator).
class AccountRecoveryScreen extends ConsumerWidget {
  const AccountRecoveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return AuthScaffold(
      title: 'Recover your account',
      subtitle: 'Pick the option that matches your situation.',
      children: [
        _RecoveryTile(
          icon: AppIcons.sms_outlined,
          title: 'I still have my number',
          body: 'Go back and request a fresh sign-in code.',
          onTap: () => context.go(RoutePaths.phone),
        ),
        _RecoveryTile(
          icon: AppIcons.vpn_key_outlined,
          title: 'Use a 2FA recovery code',
          body:
              'On the code screen, enter one of the recovery codes you saved when enabling two-factor.',
          onTap: () => context.go(RoutePaths.phone),
        ),
        _RecoveryTile(
          icon: AppIcons.support_agent_outlined,
          title: 'I lost access to my number',
          body: 'Contact support to verify your identity. Response within 1 business day.',
          onTap: () => ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Email support@stall.example with your account details.')),
          ),
        ),
        const SizedBox(height: AppSpace.s16),
        Text(
          'For your security, recovery may take longer if two-factor is enabled and no recovery code is available.',
          style: context.text.bodyMedium?.copyWith(color: c.textMed),
        ),
      ],
    );
  }
}

class _RecoveryTile extends StatelessWidget {
  const _RecoveryTile({
    required this.icon,
    required this.title,
    required this.body,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s12),
      child: AppCard(
        padding: const EdgeInsets.all(AppSpace.s16),
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: c.primary),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall),
                  const SizedBox(height: AppSpace.s4),
                  Text(body,
                      style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
