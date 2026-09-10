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
                Card(
                  child: ListTile(
                    leading: Icon(AppIcons.route, color: c.primary),
                    title: Text('Active delivery · ${d.activeDeliveryCode}'),
                    subtitle: Text(d.activeDeliveryStatus ?? ''),
                    trailing: const Icon(AppIcons.chevron_right),
                    onTap: () => context.push(RoutePaths.courierDelivery(d.activeDeliveryId!)),
                  ),
                )
              else
                Card(
                  child: ListTile(
                    leading: Icon(AppIcons.list_alt, color: c.primary),
                    title: const Text('Available jobs'),
                    subtitle: Text(online == 'OFFLINE' ? 'Go online to receive offers' : 'Tap to view offers'),
                    trailing: const Icon(AppIcons.chevron_right),
                    onTap: () => context.push(RoutePaths.courierJobs),
                  ),
                ),
              const SizedBox(height: AppSpace.s8),
              Card(
                child: ListTile(
                  leading: Icon(AppIcons.savings_outlined, color: c.primary),
                  title: Text('Balance ${formatMoney(d.balanceMinor, d.currency)}'),
                  subtitle: Text('${d.completedDeliveries} deliveries · ${(d.acceptanceRate).round()}% acceptance'),
                  trailing: const Icon(AppIcons.chevron_right),
                  onTap: () => context.push(RoutePaths.courierEarnings),
                ),
              ),
              Card(
                child: ListTile(
                  leading: Icon(AppIcons.insights_outlined, color: c.textMed),
                  title: const Text('Performance'),
                  trailing: const Icon(AppIcons.chevron_right),
                  onTap: () => context.push(RoutePaths.courierPerformance),
                ),
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

/// Standalone route wrapper for deep links / non-shell entry.
class CourierHubScreen extends StatelessWidget {
  const CourierHubScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Courier')),
        body: const SafeArea(child: CourierDashboardBody()),
      );
}
