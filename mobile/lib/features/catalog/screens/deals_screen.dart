import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';

/// Screens 32–33, 39–40 — all running flash deals, grouped by promotion.
class DealsScreen extends ConsumerWidget {
  const DealsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(promotionsProvider('FLASH_DEAL'));

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Flash deals')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load deals',
          action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(promotionsProvider)),
        ),
        data: (promos) => promos.isEmpty
            ? const CenteredState(icon: Icons.bolt, title: 'No deals right now', body: 'Check back soon.')
            : ListView(
                padding: const EdgeInsets.all(AppSpace.s16),
                children: [
                  for (final promo in promos) _DealGroup(promo: promo),
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
            Icon(Icons.bolt, color: c.primary, size: 18),
            const SizedBox(width: AppSpace.s4),
            Expanded(child: Text(promo.title, style: context.text.titleMedium)),
          ],
        ),
        if (promo.subtitle != null)
          Text(promo.subtitle!, style: context.text.bodyMedium?.copyWith(color: c.textMed)),
        const SizedBox(height: AppSpace.s12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 220,
            mainAxisSpacing: AppSpace.s12,
            crossAxisSpacing: AppSpace.s12,
            childAspectRatio: 0.7,
          ),
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
