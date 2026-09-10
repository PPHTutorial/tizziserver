import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/delivery_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../courier_providers.dart';
import '../../../design/components.dart';
import '../../../design/icons.dart';

/// Available jobs board — pending dispatch offers, PII-masked (area labels only),
/// each with a countdown and accept / decline.
class CourierJobsBody extends ConsumerWidget {
  const CourierJobsBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobs = ref.watch(courierJobsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(courierJobsProvider);
        await ref.read(courierJobsProvider.future);
      },
      child: jobs.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [const SizedBox(height: 120), Center(child: Text('$e'))]),
        data: (list) {
          if (list.isEmpty) {
            return ListView(
              children: [
                const SizedBox(height: 140),
                Icon(AppIcons.inbox_outlined, size: 48, color: context.colors.textLow),
                const SizedBox(height: AppSpace.s8),
                Center(child: Text('No offers right now', style: context.text.bodyMedium)),
                const SizedBox(height: AppSpace.s4),
                Center(
                  child: Text('Stay online — new jobs appear here',
                      style: context.text.bodySmall?.copyWith(color: context.colors.textMed)),
                ),
              ],
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpace.s16),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
            itemBuilder: (_, i) => _JobCard(job: list[i]),
          );
        },
      ),
    );
  }
}

class _JobCard extends ConsumerStatefulWidget {
  const _JobCard({required this.job});
  final JobCardDto job;

  @override
  ConsumerState<_JobCard> createState() => _JobCardState();
}

class _JobCardState extends ConsumerState<_JobCard> {
  Timer? _t;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  Future<void> _respond(bool accept) async {
    setState(() => _busy = true);
    try {
      final res = await ref.read(stallApiProvider).respondToOffer(widget.job.offerId, accept: accept);
      ref.invalidate(courierJobsProvider);
      ref.invalidate(courierDashboardProvider);
      if (!mounted) return;
      if (accept && res['deliveryId'] != null) {
        context.push(RoutePaths.courierDelivery(res['deliveryId'] as String));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final j = widget.job;
    final secs = j.remaining.inSeconds;
    final expired = secs <= 0;

    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(formatMoney(j.payoutMinor, j.currency), style: context.text.titleLarge?.copyWith(color: c.primary)),
              const Spacer(),
              StatusBadge(
                expired ? 'expired' : '${secs}s',
                tone: expired ? BadgeTone.danger : BadgeTone.warning,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s8),
          _leg(context, AppIcons.store_mall_directory_outlined, 'Pickup', j.pickupArea),
          _leg(context, AppIcons.location_on_outlined, 'Drop-off', j.dropoffArea),
          const SizedBox(height: AppSpace.s4),
          Text('${(j.distanceM / 1000).toStringAsFixed(1)} km · ~${(j.durationS / 60).round()} min · ${j.itemCount} item(s)',
              style: context.text.bodySmall?.copyWith(color: c.textMed)),
          const SizedBox(height: AppSpace.s12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy || expired ? null : () => _respond(false),
                  child: const Text('Decline'),
                ),
              ),
              const SizedBox(width: AppSpace.s12),
              Expanded(
                child: FilledButton(
                  onPressed: _busy || expired ? null : () => _respond(true),
                  child: _busy
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Accept'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _leg(BuildContext context, IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            Icon(icon, size: 16, color: context.colors.textMed),
            const SizedBox(width: AppSpace.s8),
            Text('$label: ', style: context.text.bodySmall?.copyWith(color: context.colors.textMed)),
            Expanded(child: Text(value, style: context.text.bodyMedium)),
          ],
        ),
      );
}

class CourierJobsScreen extends StatelessWidget {
  const CourierJobsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Available jobs')),
        body: const SafeArea(child: CourierJobsBody()),
      );
}
