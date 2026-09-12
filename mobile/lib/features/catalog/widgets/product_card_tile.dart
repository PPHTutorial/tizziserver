import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../core/api_config.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/icons.dart';
import '../catalog_providers.dart';

/// Product image tile — loads the real image ([imageKey], which may be an
/// object key or an absolute URL); falls back to a tinted brand-initial tile
/// keyed off [seed] while it loads or if it fails.
class ProductThumb extends StatelessWidget {
  const ProductThumb({
    super.key,
    required this.seed,
    this.label,
    this.imageKey,
    this.size = 64,
    this.radius = AppRadius.md,
  });
  final String seed;
  final String? label;
  final String? imageKey;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tints = [c.primaryContainer, c.successContainer, c.surfaceSunken];
    final tint = tints[seed.hashCode.abs() % tints.length];
    final placeholder = Container(
      width: size == double.infinity ? null : size,
      height: size == double.infinity ? null : size,
      alignment: Alignment.center,
      color: tint,
      child: Text(
        (label ?? '?').characters.take(1).toString().toUpperCase(),
        style: context.text.headlineMedium?.copyWith(color: c.textMed),
      ),
    );
    final src = (imageKey == null || imageKey!.isEmpty) ? null : mediaUrl(imageKey!);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: src == null
          ? placeholder
          : Image.network(
              src,
              width: size == double.infinity ? null : size,
              height: size == double.infinity ? null : size,
              fit: BoxFit.cover,
              loadingBuilder: (_, child, p) => p == null ? child : placeholder,
              errorBuilder: (_, __, ___) => placeholder,
            ),
    );
  }
}

class ProductCardTile extends ConsumerWidget {
  const ProductCardTile({super.key, required this.product, required this.onTap});
  final ProductCard product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final wished = ref
        .watch(wishlistProvider)
        .maybeWhen(
          data: (items) => items.any((w) => w.productId == product.id),
          orElse: () => false,
        );
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.r2xl),
      child: Container(
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(AppRadius.r2xl),
          border: Border.all(color: c.border.withValues(alpha: 0.5)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF111111).withValues(alpha: 0.05),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(AppSpace.s8),
              child: AspectRatio(
                aspectRatio: 1.15,
                child: Stack(
                  children: [
                    ProductThumb(
                      seed: product.id,
                      label: product.brand ?? product.title,
                      imageKey: product.image,
                      size: double.infinity,
                      radius: AppRadius.xl,
                    ),
                    Positioned(
                      top: AppSpace.s6,
                      right: AppSpace.s6,
                      child: Material(
                        color: Colors.white,
                        shape: const CircleBorder(),
                        elevation: 1,
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () async {
                            try {
                              await ref
                                  .read(stallApiProvider)
                                  .toggleWishlist(product.id, add: !wished);
                              ref.invalidate(wishlistProvider);
                            } catch (_) {
                              // Best-effort — the heart just won't flip.
                            }
                          },
                          child: Padding(
                            padding: const EdgeInsets.all(6),
                            child: Icon(
                              wished
                                  ? AppIcons.favorite
                                  : AppIcons.favorite_border,
                              size: 16,
                              color: wished ? c.error : Colors.black54,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.s12, 0, AppSpace.s12, AppSpace.s12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleSmall),
                  const SizedBox(height: AppSpace.s6),
                  Text(formatMoney(product.fromPriceMinor, product.currency),
                      style: context.text.titleMedium?.copyWith(color: c.primary)),
                  const SizedBox(height: AppSpace.s4),
                  Row(
                    children: [
                      if (product.ratingCount > 0) ...[
                        Icon(AppIcons.star, size: 12, color: c.rating),
                        const SizedBox(width: 3),
                        Text(product.ratingAvg.toStringAsFixed(1),
                            style: context.text.labelSmall),
                        Text(' (${product.ratingCount})',
                            style: context.text.labelSmall?.copyWith(color: c.textLow)),
                        const Spacer(),
                      ] else
                        const Spacer(),
                      if (product.vendorCount > 1)
                        Text('${product.vendorCount} sellers',
                            style: context.text.labelSmall?.copyWith(color: c.textLow)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A responsive product grid. Masonry (not a fixed aspect ratio), so a card
/// with a short title/no rating row doesn't get stretched to match its
/// taller neighbour — each tile sizes to its own content.
class ProductGrid extends StatelessWidget {
  const ProductGrid({super.key, required this.items, required this.onOpen, this.padding});
  final List<ProductCard> items;
  final void Function(ProductCard) onOpen;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return MasonryGridView.extent(
      padding: padding ?? const EdgeInsets.all(AppSpace.s16),
      maxCrossAxisExtent: 220,
      mainAxisSpacing: AppSpace.s12,
      crossAxisSpacing: AppSpace.s12,
      itemCount: items.length,
      itemBuilder: (context, i) => ProductCardTile(product: items[i], onTap: () => onOpen(items[i])),
    );
  }
}
