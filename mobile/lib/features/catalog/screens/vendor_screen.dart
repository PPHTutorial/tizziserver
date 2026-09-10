import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';
import '../../trust/report_sheet.dart';

/// Screens 60–80 (seller page) / §25 — public vendor storefront.
class VendorScreen extends ConsumerWidget {
  const VendorScreen({super.key, required this.vendorId});
  final String vendorId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final vendor = ref.watch(vendorPageProvider(vendorId));
    final products = ref.watch(vendorProductsProvider(vendorId));

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        title: Text(vendor.valueOrNull?.displayName ?? 'Vendor'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'report') {
                showReportSheet(context, ref,
                    targetType: 'VENDOR', targetId: vendorId, targetLabel: 'seller');
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'report', child: Text('Report seller')),
            ],
          ),
        ],
      ),
      body: vendor.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load this vendor',
          action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(vendorPageProvider(vendorId))),
        ),
        data: (v) => CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(AppSpace.s16),
                child: Row(
                  children: [
                    ProductThumb(seed: v.id, label: v.displayName, size: 64),
                    const SizedBox(width: AppSpace.s12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Flexible(child: Text(v.displayName, style: context.text.titleLarge)),
                            if (v.verified) ...[
                              const SizedBox(width: AppSpace.s6),
                              Icon(AppIcons.verified, size: 16, color: c.primary),
                            ],
                          ]),
                          const SizedBox(height: AppSpace.s2),
                          Text(
                            [
                              if (v.ratingCount > 0) '★ ${v.ratingAvg.toStringAsFixed(1)}',
                              '${v.productCount} products',
                              if (v.location != null) v.location,
                            ].join(' · '),
                            style: context.text.bodyMedium?.copyWith(color: c.textMed),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (v.bio != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
                  child: Text(v.bio!, style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                ),
              ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s20, AppSpace.s16, AppSpace.s8),
                child: Text('Products', style: context.text.titleMedium),
              ),
            ),
            products.when(
              loading: () => const SliverToBoxAdapter(
                child: Padding(padding: EdgeInsets.all(AppSpace.s32), child: Center(child: CircularProgressIndicator())),
              ),
              error: (e, _) => const SliverToBoxAdapter(
                child: Padding(padding: EdgeInsets.all(AppSpace.s16), child: Text('Couldn\'t load products.')),
              ),
              data: (page) => page.items.isEmpty
                  ? const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.all(AppSpace.s24),
                        child: Center(child: Text('No published products yet.')),
                      ),
                    )
                  : SliverPadding(
                      padding: const EdgeInsets.all(AppSpace.s16),
                      sliver: SliverGrid.builder(
                        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 220,
                          mainAxisSpacing: AppSpace.s12,
                          crossAxisSpacing: AppSpace.s12,
                          childAspectRatio: 0.66,
                        ),
                        itemCount: page.items.length,
                        itemBuilder: (context, i) => ProductCardTile(
                          product: page.items[i],
                          onTap: () => context.push(RoutePaths.product(page.items[i].slug)),
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
