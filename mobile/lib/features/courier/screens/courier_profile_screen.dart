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
                    (auth.user?.displayName ?? 'C').characters.first
                        .toUpperCase(),
                    style: context.text.titleLarge?.copyWith(
                      color: c.onPrimaryContainer,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.s12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        auth.user?.displayName ?? 'Courier',
                        style: context.text.titleMedium,
                      ),
                      me.when(
                        loading: () => Text(
                          'Loading…',
                          style: context.text.bodyMedium?.copyWith(
                            color: c.textMed,
                          ),
                        ),
                        error: (_, __) => const SizedBox.shrink(),
                        data: (m) => Row(
                          children: [
                            StatusBadge(
                              m.status ?? 'PENDING',
                              tone: m.isApproved
                                  ? BadgeTone.success
                                  : BadgeTone.neutral,
                            ),
                            const SizedBox(width: AppSpace.s8),
                            if (m.ratingCount > 0)
                              Text(
                                '★ ${m.ratingAvg.toStringAsFixed(1)}',
                                style: context.text.labelSmall?.copyWith(
                                  color: c.textMed,
                                ),
                              ),
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

            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  me.maybeWhen(
                    data: (m) => _KycRow(status: m.kycStatus),
                    orElse: () => const SizedBox.shrink(),
                  ),
                  AppListRow(
                    icon: AppIcons.two_wheeler,
                    label: 'Vehicles',
                    onTap: () => context.push(RoutePaths.courierVehicles),
                  ),
                  AppListRow(
                    icon: AppIcons.near_me,
                    label: 'Areas & availability',
                    onTap: () => context.push(RoutePaths.courierAreas),
                  ),
                  AppListRow(
                    icon: AppIcons.insights_outlined,
                    label: 'Performance',
                    onTap: () => context.push(RoutePaths.courierPerformance),
                  ),
                  AppListRow(
                    icon: AppIcons.timeline_outlined,
                    label: 'Performance history',
                    onTap: () => context.push(RoutePaths.courierHistory),
                  ),
                  AppListRow(
                    icon: AppIcons.savings_outlined,
                    label: 'Earnings & payouts',
                    onTap: () => context.push(RoutePaths.courierEarnings),
                    showChevron: false,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.s16),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  AppListRow(
                    icon: AppIcons.security,
                    label: 'Security centre',
                    onTap: () => context.push(RoutePaths.securityCentre),
                  ),
                  AppListRow(
                    icon: AppIcons.devices,
                    label: 'Signed-in devices',
                    onTap: () => context.push(RoutePaths.sessions),
                  ),
                  AppListRow(
                    icon: AppIcons.support_agent_outlined,
                    label: 'Help & support',
                    onTap: () => context.push(RoutePaths.support),
                    showChevron: false,
                  ),
                ],
              ),
            ),
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
      Text(
        label,
        style: context.text.labelSmall?.copyWith(color: context.colors.textMed),
      ),
    ],
  );
}

class _KycRow extends StatelessWidget {
  const _KycRow({required this.status});
  final String? status;

  @override
  Widget build(BuildContext context) {
    final (BadgeTone tone, String hint) = switch (status) {
      'APPROVED' => (BadgeTone.success, 'Verified'),
      'REJECTED' => (BadgeTone.danger, 'Rejected — resubmit'),
      'PENDING' || 'IN_REVIEW' => (BadgeTone.neutral, 'Under review'),
      _ => (BadgeTone.warning, 'Not started'),
    };
    return AppListRow(
      icon: AppIcons.verified_user,
      label: 'Identity verification',
      trailing: StatusBadge(status ?? 'NONE', tone: tone),
      onTap: () => context.push(RoutePaths.courierOnboarding),
    );
  }
}

class CourierProfileScreen extends StatelessWidget {
  const CourierProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.colors.bg,
    body: const SafeArea(
      child: Column(
        children: [
          AppScreenHeader('Profile'),
          Expanded(child: CourierProfileBody()),
        ],
      ),
    ),
  );
}
