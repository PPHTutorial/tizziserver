import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../courier_providers.dart';
import '../../../design/icons.dart';

/// Courier home — online toggle, headline stats, the active job, a peek at
/// earnings, and a shortcut into the jobs board.
class CourierDashboardBody extends ConsumerWidget {
  const CourierDashboardBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final dash = ref.watch(courierDashboardProvider);
    // presence notifier drives the toggle + heartbeat; the DTO seeds the display
    final presence = ref.watch(courierPresenceProvider);
    final online = presence == 'OFFLINE'
        ? (dash.valueOrNull?.onlineStatus ?? 'OFFLINE')
        : presence;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(courierDashboardProvider);
        await ref.read(courierDashboardProvider.future);
      },
      child: dash.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [const SizedBox(height: 120), Center(child: Text('$e'))]),
        data: (d) {
          if (!d.onboarded || d.status != 'ACTIVE') {
            return ListView(
              padding: const EdgeInsets.all(AppSpace.s24),
              children: [
                const SizedBox(height: AppSpace.s24),
                Icon(AppIcons.delivery_dining, size: 56, color: c.primary),
                const SizedBox(height: AppSpace.s12),
                Text('Become a Stall courier', style: context.text.headlineSmall, textAlign: TextAlign.center),
                const SizedBox(height: AppSpace.s8),
                Text(
                  d.status == null
                      ? 'Register, add a vehicle and pass a quick ID check to start earning.'
                      : 'Your application is ${d.status}. We\'ll notify you once it\'s reviewed.',
                  textAlign: TextAlign.center,
                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                ),
                const SizedBox(height: AppSpace.s20),
                FilledButton(
                  onPressed: () => context.push(RoutePaths.courierOnboarding),
                  child: Text(d.status == null ? 'Get started' : 'Review my application'),
                ),
              ],
            );
          }

          return ListView(
            padding: const EdgeInsets.all(AppSpace.s16),
            children: [
              _OnlineCard(
                online: online != 'OFFLINE',
                busy: online == 'ON_JOB',
                onChanged: (v) async {
                  final p = ref.read(courierPresenceProvider.notifier);
                  v ? await p.goOnline() : await p.goOffline();
                },
              ),
              const SizedBox(height: AppSpace.s16),
              Row(
                children: [
                  StatTile(label: 'Today', value: formatMoney(d.today, d.currency)),
                  StatTile(label: 'This week', value: formatMoney(d.week, d.currency)),
                  StatTile(label: 'Rating', value: d.ratingAvg.toStringAsFixed(1)),
                ],
              ),
              const SizedBox(height: AppSpace.s16),
              if (d.activeDeliveryId != null)
                _DashRow(
                  icon: AppIcons.route,
                  title: 'Active delivery · ${d.activeDeliveryCode}',
                  subtitle: d.activeDeliveryStatus ?? '',
                  onTap: () => context.push(RoutePaths.courierDelivery(d.activeDeliveryId!)),
                )
              else
                _DashRow(
                  icon: AppIcons.list_alt,
                  title: 'Available jobs',
                  subtitle: online == 'OFFLINE' ? 'Go online to receive offers' : 'Tap to view offers',
                  onTap: () => context.push(RoutePaths.courierJobs),
                ),
              const SizedBox(height: AppSpace.s10),
              _DashRow(
                icon: AppIcons.savings_outlined,
                title: 'Balance ${formatMoney(d.balanceMinor, d.currency)}',
                subtitle: '${d.completedDeliveries} deliveries · ${(d.acceptanceRate).round()}% acceptance',
                onTap: () => context.push(RoutePaths.courierEarnings),
              ),
              const SizedBox(height: AppSpace.s10),
              _DashRow(
                icon: AppIcons.insights_outlined,
                title: 'Performance',
                onTap: () => context.push(RoutePaths.courierPerformance),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _OnlineCard extends StatelessWidget {
  const _OnlineCard({required this.online, required this.busy, required this.onChanged});
  final bool online;
  final bool busy;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpace.s16),
      decoration: BoxDecoration(
        color: online ? c.primary.withValues(alpha: 0.10) : c.surfaceSunken,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: online ? c.primary : c.border),
      ),
      child: Row(
        children: [
          Icon(online ? AppIcons.bolt : AppIcons.bedtime_outlined, color: online ? c.primary : c.textMed),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(busy ? 'On a job' : (online ? 'You\'re online' : 'You\'re offline'),
                    style: context.text.titleMedium),
                Text(online ? 'Receiving delivery offers' : 'Toggle on to start earning',
                    style: context.text.bodySmall?.copyWith(color: c.textMed)),
              ],
            ),
          ),
          Switch(value: online, onChanged: busy ? null : onChanged),
        ],
      ),
    );
  }
}

class _DashRow extends StatelessWidget {
  const _DashRow({required this.icon, required this.title, this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16, vertical: AppSpace.s14),
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: c.primaryContainer,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(icon, size: 16, color: c.onPrimaryContainer),
          ),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                if (subtitle != null && subtitle!.isNotEmpty)
                  Text(subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(color: c.textMed)),
              ],
            ),
          ),
          Icon(AppIcons.chevron_right, size: 16, color: c.textLow),
        ],
      ),
    );
  }
}

/// Standalone route wrapper for deep links / non-shell entry.
class CourierHubScreen extends StatelessWidget {
  const CourierHubScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.colors.bg,
        body: const SafeArea(
          child: Column(
            children: [
              AppScreenHeader('Courier'),
              Expanded(child: CourierDashboardBody()),
            ],
          ),
        ),
      );
}
