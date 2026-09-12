import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../trust_providers.dart';

IconData reportTargetIcon(String targetType) => switch (targetType) {
  'PRODUCT' => AppIcons.shopping_bag_outlined,
  'VENDOR' => AppIcons.storefront_outlined,
  'COURIER' => AppIcons.delivery_dining,
  'ORDER' => AppIcons.receipt_long_outlined,
  'DELIVERY' => AppIcons.local_shipping_outlined,
  'CONVERSATION' => AppIcons.forum_outlined,
  _ => AppIcons.person,
};

BadgeTone _tone(String status) => switch (status) {
  'ACTIONED' || 'RESOLVED' => BadgeTone.success,
  'DISMISSED' => BadgeTone.neutral,
  _ => BadgeTone.info,
};

/// §24 — the reports the user has filed and where they stand.
class MyReportsScreen extends ConsumerWidget {
  const MyReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myReportsProvider);
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('My reports'),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async => ref.invalidate(myReportsProvider),
                child: async.when(
                  loading: () => const SkeletonList(rows: 4, rowHeight: 64),
                  error: (e, _) => AppErrorView(
                    e,
                    onRetry: () => ref.invalidate(myReportsProvider),
                  ),
                  data: (list) => list.isEmpty
                      ? const EmptyState(
                          icon: AppIcons.flag,
                          title: 'No reports filed',
                          message:
                              'If something on Stall seems wrong, report it and we\'ll look into it.',
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(AppSpace.s16),
                          itemCount: list.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: AppSpace.s8),
                          itemBuilder: (context, i) {
                            final r = list[i];
                            return AppCard(
                              child: Row(
                                children: [
                                  Icon(
                                    reportTargetIcon(r.targetType),
                                    color: context.colors.textMed,
                                  ),
                                  const SizedBox(width: AppSpace.s12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          r.category,
                                          style: context.text.bodyLarge,
                                        ),
                                        Text(
                                          '${r.targetType.toLowerCase()} · ${r.at.toLocal().toString().substring(0, 16)}',
                                          style: context.text.labelSmall
                                              ?.copyWith(
                                                color: context.colors.textMed,
                                              ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: AppSpace.s8),
                                  StatusBadge(r.status, tone: _tone(r.status)),
                                ],
                              ),
                            );
                          },
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
