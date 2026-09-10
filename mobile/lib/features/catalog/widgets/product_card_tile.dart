import 'package:flutter/material.dart';

import '../../../api/catalog_models.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/icons.dart';

/// Placeholder thumbnail — there's no media server yet, so we render the brand
/// initial on a tinted tile keyed off the product id.
class ProductThumb extends StatelessWidget {
  const ProductThumb({super.key, required this.seed, this.label, this.size = 64, this.radius = AppRadius.md});
  final String seed;
  final String? label;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tints = [c.primaryContainer, c.successContainer, c.errorContainer, c.surfaceSunken];
    final tint = tints[seed.hashCode.abs() % tints.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(radius)),
      child: Text(
        (label ?? '?').characters.take(1).toString().toUpperCase(),
        style: context.text.titleLarge?.copyWith(color: c.textMed),
      ),
    );
  }
}

class ProductCardTile extends StatelessWidget {
  const ProductCardTile({super.key, required this.product, required this.onTap});
  final ProductCard product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Container(
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 1.3,
              child: ProductThumb(
                seed: product.id,
                label: product.brand ?? product.title,
                size: double.infinity,
                radius: AppRadius.lg,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpace.s10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleSmall),
                  const SizedBox(height: AppSpace.s4),
                  Text(formatMoney(product.fromPriceMinor, product.currency),
                      style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer)),
                  const SizedBox(height: AppSpace.s2),
                  Row(
                    children: [
                      if (product.ratingCount > 0) ...[
                        Icon(AppIcons.star, size: 12, color: c.rating),
                        Text(' ${product.ratingAvg.toStringAsFixed(1)} ',
                            style: context.text.labelSmall),
                      ],
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

/// A responsive 2-column product grid.
class ProductGrid extends StatelessWidget {
  const ProductGrid({super.key, required this.items, required this.onOpen, this.padding});
  final List<ProductCard> items;
  final void Function(ProductCard) onOpen;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: padding ?? const EdgeInsets.all(AppSpace.s16),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: AppSpace.s12,
        crossAxisSpacing: AppSpace.s12,
        childAspectRatio: 0.66,
      ),
      itemCount: items.length,
      itemBuilder: (context, i) => ProductCardTile(product: items[i], onTap: () => onOpen(items[i])),
    );
  }
}
