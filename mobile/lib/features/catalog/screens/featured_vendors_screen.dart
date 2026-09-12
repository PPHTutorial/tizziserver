import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

/// The home feed's "Featured vendors" rail opens here — top-rated active
/// vendors with at least one live listing, ranked the same way as the rail.
class FeaturedVendorsScreen extends ConsumerWidget {
  const FeaturedVendorsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(featuredVendorsProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Featured vendors'),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load featured vendors',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(featuredVendorsProvider),
                  ),
                ),
                data: (vendors) => vendors.isEmpty
                    ? const CenteredState(
                        icon: AppIcons.storefront_outlined,
                        title: 'No featured vendors yet',
                        body: 'Check back soon.',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppSpace.s16),
                        itemCount: vendors.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpace.s12),
                        itemBuilder: (context, i) {
                          final v = vendors[i];
                          return AppCard(
                            onTap: () => context.push(RoutePaths.vendor(v.id)),
                            child: Row(
                              children: [
                                ProductThumb(
                                  seed: v.id,
                                  label: v.displayName,
                                  imageKey: v.logo,
                                  size: 52,
                                ),
                                const SizedBox(width: AppSpace.s12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        v.displayName,
                                        style: context.text.titleSmall,
                                      ),
                                      Text(
                                        [
                                          if (v.ratingCount > 0)
                                            '★ ${v.ratingAvg.toStringAsFixed(1)} (${v.ratingCount})',
                                          '${v.productCount} product${v.productCount == 1 ? '' : 's'}',
                                        ].join(' · '),
                                        style: context.text.bodyMedium
                                            ?.copyWith(color: c.textMed),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(AppIcons.chevron_right),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
