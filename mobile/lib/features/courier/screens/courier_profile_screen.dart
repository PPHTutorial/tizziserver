import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/responsive.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../courier_providers.dart';

/// §16 — the courier's profile & settings hub. Also the COURIER "Profile" tab.
class CourierProfileBody extends ConsumerWidget {
  const CourierProfileBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final auth = ref.watch(authControllerProvider);
    final me = ref.watch(courierMeProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(courierMeProvider);
        await ref.read(courierMeProvider.future);
      },
      child: MaxWidth(
        child: ListView(
        padding: const EdgeInsets.all(AppSpace.s16),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: c.primaryContainer,
                child: Text(
                  (auth.user?.displayName ?? 'C').characters.first.toUpperCase(),
                  style: context.text.titleLarge?.copyWith(color: c.onPrimaryContainer),
                ),
              ),
              const SizedBox(width: AppSpace.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(auth.user?.displayName ?? 'Courier', style: context.text.titleMedium),
                    me.when(
                      loading: () => Text('Loading…',
                          style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (m) => Row(
                        children: [
                          StatusBadge(m.status ?? 'PENDING',
                              tone: m.isApproved ? BadgeTone.success : BadgeTone.neutral),
                          const SizedBox(width: AppSpace.s8),
                          if (m.ratingCount > 0)
                            Text('★ ${m.ratingAvg.toStringAsFixed(1)}',
                                style: context.text.labelSmall?.copyWith(color: c.textMed)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s16),
          me.maybeWhen(
            data: (m) => AppCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _stat(context, 'Trips', '${m.completedDeliveries}'),
                  _stat(context, 'Accept', '${m.acceptanceRate.round()}%'),
                  _stat(context, 'Cancel', '${m.cancellationRate.round()}%'),
                  _stat(context, 'Vehicles', '${m.vehicles.length}'),
                ],
              ),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
          const SizedBox(height: AppSpace.s16),

          me.maybeWhen(
            data: (m) => _KycTile(status: m.kycStatus),
            orElse: () => const SizedBox.shrink(),
          ),
          _tile(context, AppIcons.two_wheeler, 'Vehicles', () => context.push(RoutePaths.courierVehicles)),
          _tile(context, AppIcons.near_me, 'Areas & availability',
              () => context.push(RoutePaths.courierAreas)),
          _tile(context, AppIcons.insights_outlined, 'Performance',
              () => context.push(RoutePaths.courierPerformance)),
          _tile(context, AppIcons.timeline_outlined, 'Performance history',
              () => context.push(RoutePaths.courierHistory)),
          _tile(context, AppIcons.savings_outlined, 'Earnings & payouts',
              () => context.push(RoutePaths.courierEarnings)),
          const Divider(height: AppSpace.s24),
          _tile(context, AppIcons.security, 'Security centre',
              () => context.push(RoutePaths.securityCentre)),
          _tile(context, AppIcons.devices, 'Signed-in devices', () => context.push(RoutePaths.sessions)),
          _tile(context, AppIcons.support_agent_outlined, 'Help & support',
              () => context.push(RoutePaths.support)),
          const SizedBox(height: AppSpace.s20),
          SecondaryButton(
            label: 'Sign out',
            onPressed: () async {
              await ref.read(authControllerProvider.notifier).logout();
              if (context.mounted) context.go(RoutePaths.welcome);
            },
          ),
        ],
      ),
      ),
    );
  }

  Widget _stat(BuildContext context, String label, String value) => Column(
        children: [
          Text(value, style: context.text.titleLarge),
          Text(label, style: context.text.labelSmall?.copyWith(color: context.colors.textMed)),
        ],
      );

  Widget _tile(BuildContext context, IconData icon, String label, VoidCallback onTap) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon, color: context.colors.textMed),
        title: Text(label, style: context.text.bodyLarge),
        trailing: Icon(AppIcons.chevron_right, color: context.colors.textLow),
        onTap: onTap,
      );
}

class _KycTile extends StatelessWidget {
  const _KycTile({required this.status});
  final String? status;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (BadgeTone tone, String hint) = switch (status) {
      'APPROVED' => (BadgeTone.success, 'Verified'),
      'REJECTED' => (BadgeTone.danger, 'Rejected — resubmit'),
      'PENDING' || 'IN_REVIEW' => (BadgeTone.neutral, 'Under review'),
      _ => (BadgeTone.warning, 'Not started'),
    };
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(AppIcons.verified_user, color: c.textMed),
      title: Text('Identity verification', style: context.text.bodyLarge),
      subtitle: Text(hint, style: context.text.labelSmall?.copyWith(color: c.textMed)),
      trailing: StatusBadge(status ?? 'NONE', tone: tone),
      onTap: () => context.push(RoutePaths.courierOnboarding),
    );
  }
}

class CourierProfileScreen extends StatelessWidget {
  const CourierProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Profile')),
        body: const SafeArea(child: CourierProfileBody()),
      );
}
