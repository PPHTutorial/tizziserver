import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../auth/security_actions.dart';
import '../trust_providers.dart';

/// §24 (424–429) — account security at a glance, with the set-up actions inline.
class SecurityCentreScreen extends ConsumerWidget {
  const SecurityCentreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final data = ref.watch(securityCentreProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Security centre')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(securityCentreProvider),
          child: data.when(
            loading: () => const SkeletonList(rows: 6, rowHeight: 52),
            error: (e, _) =>
                AppErrorView(e, onRetry: () => ref.invalidate(securityCentreProvider)),
            data: (s) => ListView(
              padding: const EdgeInsets.all(AppSpace.s16),
              children: [
                _Row(
                  icon: AppIcons.shield,
                  label: 'Two-factor authentication',
                  value: s.twoFactorEnabled ? 'On' : 'Set up',
                  good: s.twoFactorEnabled,
                  onTap: s.twoFactorEnabled ? null : () => enrollTwoFactor(context, ref),
                ),
                _Row(
                  icon: AppIcons.pin,
                  label: 'Transaction PIN',
                  value: s.pinSet ? 'Set' : 'Set up',
                  good: s.pinSet,
                  onTap: () => setTransactionPin(context, ref),
                ),
                _Row(
                  icon: AppIcons.password,
                  label: 'Password',
                  value: s.passwordSet ? 'Set' : 'Set up',
                  good: s.passwordSet,
                  onTap: () => context.push(RoutePaths.createPassword),
                ),
                _Row(
                  icon: AppIcons.devices,
                  label: 'Active sessions',
                  value: '${s.activeSessions}',
                  good: true,
                  onTap: () => context.push(RoutePaths.sessions),
                ),
                _Row(
                  icon: AppIcons.block,
                  label: 'Blocked users',
                  value: '${s.blockedCount}',
                  good: true,
                ),
                _Row(
                  icon: AppIcons.flag,
                  label: 'Reports filed',
                  value: '${s.reportsFiled}',
                  good: true,
                  onTap: () => context.push(RoutePaths.myReports),
                ),
                const SizedBox(height: AppSpace.s20),
                Text('Recent sign-ins', style: context.text.titleMedium),
                const SizedBox(height: AppSpace.s8),
                ...s.recentLogins.map((l) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        l.result == 'SUCCESS' ? AppIcons.check_circle_outline : AppIcons.error_outline,
                        color: l.result == 'SUCCESS' ? c.success : c.error,
                      ),
                      title: Text(l.ip ?? 'Unknown IP', style: context.text.bodyMedium),
                      subtitle: Text(
                        '${l.ua ?? ''} · ${l.at.toLocal().toString().substring(0, 16)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.bodySmall?.copyWith(color: c.textMed),
                      ),
                    )),
                if (s.recentLogins.isEmpty)
                  Text('No sign-in activity recorded.',
                      style: context.text.bodyMedium?.copyWith(color: c.textMed)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.value,
    required this.good,
    this.onTap,
  });
  final IconData icon;
  final String label;
  final String value;
  final bool good;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: c.textMed),
      title: Text(label),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value, style: context.text.bodyMedium?.copyWith(color: good ? c.textHi : c.error)),
          if (onTap != null) const Icon(AppIcons.chevron_right),
        ],
      ),
      onTap: onTap,
    );
  }
}
