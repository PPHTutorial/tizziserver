import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../design/components.dart';
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
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Performance'),
            Expanded(
              child: perf.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (p) {
                  if (p['onboarded'] != true) {
                    return Center(
                      child: Text(
                        'Complete onboarding first',
                        style: context.text.bodyMedium,
                      ),
                    );
                  }
                  final breakdown =
                      (p['ratingBreakdown'] as List<dynamic>? ?? const []);
                  final maxCount = breakdown.fold<int>(
                    1,
                    (m, e) => ((e as Map)['count'] as num).toInt() > m
                        ? ((e)['count'] as num).toInt()
                        : m,
                  );
                  return ListView(
                    padding: const EdgeInsets.all(AppSpace.s16),
                    children: [
                      Row(
                        children: [
                          StatTile(
                            label: 'Rating',
                            value: (p['ratingAvg'] as num? ?? 0)
                                .toStringAsFixed(1),
                          ),
                          StatTile(
                            label: 'Deliveries',
                            value: '${p['completedDeliveries'] ?? 0}',
                          ),
                          StatTile(
                            label: 'Acceptance',
                            value: '${p['acceptanceRate'] ?? 0}%',
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpace.s8),
                      Row(
                        children: [
                          StatTile(
                            label: 'Avg time',
                            value: '${p['avgDeliveryMinutes'] ?? 0} min',
                          ),
                          StatTile(
                            label: 'Distance',
                            value: '${p['totalDistanceKm'] ?? 0} km',
                          ),
                          StatTile(
                            label: 'Declines',
                            value: '${p['declineCount'] ?? 0}',
                          ),
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
                              SizedBox(
                                width: 28,
                                child: Text(
                                  '$stars★',
                                  style: context.text.bodySmall,
                                ),
                              ),
                              Expanded(
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(
                                    AppRadius.pill,
                                  ),
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
          ],
        ),
      ),
    );
  }
}
