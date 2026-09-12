import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

final recentlyViewedListProvider = FutureProvider.autoDispose<List<RecentlyViewedItemDto>>(
  (ref) => ref.watch(stallApiProvider).recentlyViewed(),
);

/// "View All" destination for the home feed's "Recently viewed" rail.
class RecentlyViewedScreen extends ConsumerWidget {
  const RecentlyViewedScreen({super.key});

  String _dayLabel(DateTime at) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(at.year, at.month, at.day);
    final diff = today.difference(day).inDays;
    if (diff == 0) return 'TODAY';
    if (diff == 1) return 'YESTERDAY';
    return '${at.day}/${at.month}/${at.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(recentlyViewedListProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              'Recently viewed',
              trailing: async.valueOrNull?.isEmpty ?? true
                  ? null
                  : TextButton(
                      onPressed: () async {
                        final ok = await confirmDialog(
                          context,
                          title: 'Clear viewing history?',
                          message: 'This removes every item from your '
                              'recently viewed history. This can\'t be undone.',
                          confirmLabel: 'Clear all',
                          destructive: true,
                        );
                        if (!ok) return;
                        await ref.read(stallApiProvider).clearRecentlyViewed();
                        ref.invalidate(recentlyViewedListProvider);
                      },
                      child: const Text('Clear All'),
                    ),
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load your recently viewed items',
                  action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(recentlyViewedListProvider)),
                ),
                data: (items) {
                  if (items.isEmpty) {
                    return const CenteredState(
                      icon: AppIcons.history,
                      title: 'Nothing viewed yet',
                      body: 'Products you look at will show up here.',
                    );
                  }
                  final groups = <String, List<RecentlyViewedItemDto>>{};
                  for (final w in items) {
                    groups.putIfAbsent(_dayLabel(w.viewedAt), () => []).add(w);
                  }
                  return ListView(
                    padding: const EdgeInsets.all(AppSpace.s16),
                    children: [
                      for (final entry in groups.entries) ...[
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpace.s8),
                          child: Text(
                            entry.key,
                            style: context.text.labelMedium?.copyWith(
                              color: c.textLow,
                            ),
                          ),
                        ),
                        for (final w in entry.value)
                          Padding(
                            padding: const EdgeInsets.only(
                              bottom: AppSpace.s12,
                            ),
                            child: AppCard(
                              onTap: () =>
                                  context.push(RoutePaths.product(w.slug)),
                              child: Row(
                                children: [
                                  ProductThumb(
                                    seed: w.productId,
                                    label: w.title,
                                    imageKey: w.image,
                                    size: 64,
                                  ),
                                  const SizedBox(width: AppSpace.s12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          w.title,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: context.text.titleSmall,
                                        ),
                                        Text(
                                          formatMoney(
                                            w.fromPriceMinor,
                                            w.currency,
                                          ),
                                          style: context.text.titleMedium
                                              ?.copyWith(color: c.primary),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Icon(
                                    AppIcons.chevron_right,
                                    color: c.textLow,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        const SizedBox(height: AppSpace.s8),
                      ],
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
