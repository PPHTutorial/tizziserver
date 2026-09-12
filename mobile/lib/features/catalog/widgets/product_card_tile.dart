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
    final src = (imageKey == null || imageKey!.isEmpty)
        ? null
        : mediaUrl(imageKey!);
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
  const ProductCardTile({
    super.key,
    required this.product,
    required this.onTap,
    this.imageAspectRatio,
  });
  final ProductCard product;
  final VoidCallback onTap;

  /// Fixed ratio to use instead of sizing to the photo's own aspect ratio.
  /// Required in a horizontal rail — every card there shares one row height
  /// (via a `SizedBox(height: …)` around the `ListView`), so a card can't
  /// grow taller for a portrait photo without overflowing that fixed box.
  /// Leave null in a vertical (masonry) grid, where each card is free to
  /// take its own height.
  final double? imageAspectRatio;

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
              child: Stack(
                children: [
                  imageAspectRatio == null
                      ? _AdaptiveProductImage(
                          seed: product.id,
                          label: product.brand ?? product.title,
                          imageKey: product.image,
                        )
                      : AspectRatio(
                          aspectRatio: imageAspectRatio!,
                          child: ProductThumb(
                            seed: product.id,
                            label: product.brand ?? product.title,
                            imageKey: product.image,
                            size: double.infinity,
                            radius: AppRadius.xl,
                          ),
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
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s12,
                0,
                AppSpace.s12,
                AppSpace.s12,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    product.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.titleSmall,
                  ),
                  if (product.description != null &&
                      product.description!.isNotEmpty) ...[
                    const SizedBox(height: AppSpace.s2),
                    Text(
                      product.description!,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(
                        color: c.textMed,
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpace.s6),
                  Text(
                    formatMoney(product.fromPriceMinor, product.currency),
                    style: context.text.titleMedium?.copyWith(color: c.primary),
                  ),
                  if (product.activeAuction != null) ...[
                    const SizedBox(height: AppSpace.s4),
                    _AuctionSpotRow(auction: product.activeAuction!),
                  ],
                  if (product.ratingCount > 0 || product.vendorCount > 1) ...[
                    const SizedBox(height: AppSpace.s4),
                    Row(
                      children: [
                        if (product.ratingCount > 0) ...[
                          Icon(AppIcons.star, size: 12, color: c.rating),
                          const SizedBox(width: 3),
                          Text(
                            product.ratingAvg.toStringAsFixed(1),
                            style: context.text.labelSmall,
                          ),
                          Text(
                            ' (${product.ratingCount})',
                            style: context.text.labelSmall?.copyWith(
                              color: c.textLow,
                            ),
                          ),
                          const Spacer(),
                        ] else
                          const Spacer(),
                        if (product.vendorCount > 1)
                          Text(
                            '${product.vendorCount} sellers',
                            style: context.text.labelSmall?.copyWith(
                              color: c.textLow,
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A green "Spot ¤X" line shown on a card whose product also has a live
/// Inverse Draw — an `(i)` icon explains what "spot" means on long-press/tap
/// so it doesn't read as a second, confusing price.
class _AuctionSpotRow extends StatelessWidget {
  const _AuctionSpotRow({required this.auction});
  final ProductActiveAuction auction;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(AppIcons.bolt, size: 12, color: c.success),
        const SizedBox(width: 3),
        Flexible(
          child: Text(
            'Spot ${formatMoney(auction.ticketPriceMinor, auction.currency)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: context.text.labelMedium?.copyWith(
              color: c.success,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 3),
        Tooltip(
          message:
              'This item can also be won in an Inverse Draw: pay the spot '
              'amount for a seat instead of the full price for a chance to '
              'win it outright.',
          triggerMode: TooltipTriggerMode.tap,
          child: Icon(AppIcons.info_outline, size: 12, color: c.success),
        ),
      ],
    );
  }
}

/// Sizes a product image to its own aspect ratio (clamped to a reasonable
/// portrait↔landscape range) instead of forcing every photo into one fixed
/// box — a portrait shot gets a taller card, a landscape one stays close to
/// the previous default, a square one lands in between. Width always fills
/// the card; only the height adapts.
class _AdaptiveProductImage extends StatefulWidget {
  const _AdaptiveProductImage({
    required this.imageKey,
    required this.seed,
    this.label,
  });
  final String? imageKey;
  final String seed;
  final String? label;

  @override
  State<_AdaptiveProductImage> createState() => _AdaptiveProductImageState();
}

class _AdaptiveProductImageState extends State<_AdaptiveProductImage> {
  static const _defaultRatio =
      1.15; // matches the prior fixed box until resolved
  static const _minRatio = 0.72; // tall portrait cap
  static const _maxRatio = 1.4; // wide landscape cap

  double _ratio = _defaultRatio;
  ImageStream? _stream;
  late final _listener = ImageStreamListener(_onImage);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  @override
  void didUpdateWidget(covariant _AdaptiveProductImage old) {
    super.didUpdateWidget(old);
    if (old.imageKey != widget.imageKey) _resolve();
  }

  void _resolve() {
    final key = widget.imageKey;
    _stream?.removeListener(_listener);
    _stream = null;
    if (key == null || key.isEmpty) return;
    final stream = NetworkImage(
      mediaUrl(key),
    ).resolve(createLocalImageConfiguration(context));
    stream.addListener(_listener);
    _stream = stream;
  }

  void _onImage(ImageInfo info, bool _) {
    final raw = info.image.width / info.image.height;
    final clamped = raw.clamp(_minRatio, _maxRatio);
    if (mounted && (clamped - _ratio).abs() > 0.01) {
      setState(() => _ratio = clamped);
    }
  }

  @override
  void dispose() {
    _stream?.removeListener(_listener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: _ratio,
      child: ProductThumb(
        seed: widget.seed,
        label: widget.label,
        imageKey: widget.imageKey,
        size: double.infinity,
        radius: AppRadius.xl,
      ),
    );
  }
}

/// A responsive product grid. Masonry (not a fixed aspect ratio), so a card
/// with a short title/no rating row doesn't get stretched to match its
/// taller neighbour — each tile sizes to its own content.
class ProductGrid extends StatelessWidget {
  const ProductGrid({
    super.key,
    required this.items,
    required this.onOpen,
    this.padding,
  });
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
      itemBuilder: (context, i) =>
          ProductCardTile(product: items[i], onTap: () => onOpen(items[i])),
    );
  }
}
