import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

/// Screens 32–33, 39–40 — all running promotions of one [kind], grouped by
/// promotion. Defaults to flash deals; also reused as the "View All"
/// destination for the home feed's campaign rails (`kind: 'CAMPAIGN'`).
class DealsScreen extends ConsumerWidget {
  const DealsScreen({
    super.key,
    this.kind = 'FLASH_DEAL',
    this.title = 'Flash deals',
  });
  final String kind;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(promotionsProvider(kind));

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(title),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load deals',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(promotionsProvider),
                  ),
                ),
                data: (promos) => promos.isEmpty
                    ? const CenteredState(
                        icon: AppIcons.bolt,
                        title: 'No deals right now',
                        body: 'Check back soon.',
                      )
                    : ListView(
                        padding: const EdgeInsets.all(AppSpace.s16),
                        children: [
                          for (final promo in promos) _DealGroup(promo: promo),
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

class _DealGroup extends StatelessWidget {
  const _DealGroup({required this.promo});
  final PromotionView promo;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(AppIcons.bolt, color: c.primary, size: 18),
            const SizedBox(width: AppSpace.s4),
            Expanded(child: Text(promo.title, style: context.text.titleMedium)),
          ],
        ),
        if (promo.subtitle != null)
          Text(
            promo.subtitle!,
            style: context.text.bodyMedium?.copyWith(color: c.textMed),
          ),
        if (promo.endsAtDate != null) ...[
          const SizedBox(height: AppSpace.s4),
          CountdownText(
            until: promo.endsAtDate!,
            showSeconds: true,
            prefix: 'Ending soon: ',
            style: context.text.labelMedium?.copyWith(color: c.error),
          ),
        ],
        const SizedBox(height: AppSpace.s12),
        MasonryGridView.extent(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          maxCrossAxisExtent: 220,
          mainAxisSpacing: AppSpace.s12,
          crossAxisSpacing: AppSpace.s12,
          itemCount: promo.items.length,
          itemBuilder: (context, i) {
            final it = promo.items[i];
            return ProductCardTile(
              product: ProductCard(
                id: it.productId,
                slug: it.slug,
                title: it.title,
                brand: it.brand,
                image: it.image,
                fromPriceMinor: it.effectivePriceMinor,
                currency: it.currency,
              ),
              onTap: () => context.push(RoutePaths.product(it.slug)),
            );
          },
        ),
        const SizedBox(height: AppSpace.s20),
      ],
    );
  }
}
