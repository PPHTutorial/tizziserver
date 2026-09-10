import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';

final _perfProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref.watch(stallApiProvider).courierPerformance(),
);

class CourierPerformanceScreen extends ConsumerWidget {
  const CourierPerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final perf = ref.watch(_perfProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Performance')),
      body: SafeArea(
        child: perf.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (p) {
            if (p['onboarded'] != true) {
              return Center(child: Text('Complete onboarding first', style: context.text.bodyMedium));
            }
            final breakdown = (p['ratingBreakdown'] as List<dynamic>? ?? const []);
            final maxCount = breakdown.fold<int>(1, (m, e) => ((e as Map)['count'] as num).toInt() > m ? ((e)['count'] as num).toInt() : m);
            return ListView(
              padding: const EdgeInsets.all(AppSpace.s16),
              children: [
                Row(
                  children: [
                    _tile(context, 'Rating', (p['ratingAvg'] as num? ?? 0).toStringAsFixed(1)),
                    _tile(context, 'Deliveries', '${p['completedDeliveries'] ?? 0}'),
                    _tile(context, 'Acceptance', '${p['acceptanceRate'] ?? 0}%'),
                  ],
                ),
                const SizedBox(height: AppSpace.s8),
                Row(
                  children: [
                    _tile(context, 'Avg time', '${p['avgDeliveryMinutes'] ?? 0} min'),
                    _tile(context, 'Distance', '${p['totalDistanceKm'] ?? 0} km'),
                    _tile(context, 'Declines', '${p['declineCount'] ?? 0}'),
                  ],
                ),
                const SizedBox(height: AppSpace.s24),
                Text('Rating breakdown', style: context.text.titleMedium),
                const SizedBox(height: AppSpace.s8),
                ...breakdown.reversed.map((e) {
                  final m = e as Map;
                  final stars = (m['stars'] as num).toInt();
                  final count = (m['count'] as num).toInt();
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        SizedBox(width: 28, child: Text('$stars★', style: context.text.bodySmall)),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(AppRadius.pill),
                            child: LinearProgressIndicator(
                              value: count / maxCount,
                              minHeight: 8,
                              backgroundColor: c.surfaceSunken,
                              color: c.rating,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.s8),
                        Text('$count', style: context.text.bodySmall),
                      ],
                    ),
                  );
                }),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, String label, String value) => Expanded(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(vertical: AppSpace.s16),
          decoration: BoxDecoration(color: context.colors.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
          child: Column(
            children: [
              Text(value, style: context.text.titleMedium),
              const SizedBox(height: 2),
              Text(label, style: context.text.bodySmall?.copyWith(color: context.colors.textMed)),
            ],
          ),
        ),
      );
}
