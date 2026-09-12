import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/ads_models.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../ads/ads_providers.dart';

class CourierPerformanceHistoryScreen extends ConsumerStatefulWidget {
  const CourierPerformanceHistoryScreen({super.key});
  @override
  ConsumerState<CourierPerformanceHistoryScreen> createState() => _State();
}

class _State extends ConsumerState<CourierPerformanceHistoryScreen> {
  int _days = 30;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = ref.watch(courierAnalyticsProvider(_days));
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Performance history'),
            SizedBox(
              height: 48,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
                itemCount: 3,
                separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s8),
                itemBuilder: (_, i) {
                  final d = [7, 30, 90][i];
                  return AppChip('${d}d', selected: _days == d, onTap: () => setState(() => _days = d));
                },
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            Expanded(
              child: a.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (d) => ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpace.s16, 0, AppSpace.s16, AppSpace.s16),
                  children: [
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            StatTile(label: 'Completed', value: '${d.completed}'),
                            StatTile(label: 'Cancelled', value: '${d.cancelled}'),
                            StatTile(label: 'Lifetime', value: '${d.lifetimeCompleted}'),
                          ]),
                          const SizedBox(height: AppSpace.s8),
                          Row(children: [
                            StatTile(label: 'Acceptance', value: '${d.acceptanceRate}%'),
                            StatTile(label: 'On-time', value: '${d.onTimeRate}%'),
                            StatTile(label: 'Distance', value: '${d.distanceKm} km'),
                          ]),
                          const SizedBox(height: AppSpace.s16),
                          Text('Deliveries per day', style: context.text.titleSmall),
                          const SizedBox(height: 6),
                          _Spark(points: d.completedSeries, color: c.primary),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            StatTile(label: 'Earned', value: formatMoney(d.netMinor, 'GHS')),
                            StatTile(label: 'Per drop', value: formatMoney(d.perDeliveryMinor, 'GHS')),
                            StatTile(label: 'Rating', value: d.ratingAvg.toStringAsFixed(1)),
                          ]),
                          const SizedBox(height: AppSpace.s16),
                          Text('Earnings per day', style: context.text.titleSmall),
                          const SizedBox(height: 6),
                          _Spark(points: d.earningsSeries, color: c.rating),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Spark extends StatelessWidget {
  const _Spark({required this.points, required this.color});
  final List<SeriesPoint> points;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final max = points.fold<double>(1, (m, p) => p.value > m ? p.value : m);
    return SizedBox(
      height: 84,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: points
            .map((p) => Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    height: (p.value / max) * 78 + 2,
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.75), borderRadius: BorderRadius.circular(2)),
                  ),
                ))
            .toList(),
      ),
    );
  }
}
