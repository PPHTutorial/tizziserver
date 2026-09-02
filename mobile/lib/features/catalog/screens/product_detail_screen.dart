import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';

/// Screens 60–80 — product experience: gallery, price, multi-vendor offers,
/// variants, description, reviews, wishlist, ask-a-question.
class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(productDetailProvider(slug));
    final c = context.colors;

    return Scaffold(
      backgroundColor: c.bg,
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load this product',
          action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(productDetailProvider(slug))),
        ),
        data: (p) => _Detail(product: p, slug: slug),
      ),
    );
  }
}

class _Detail extends ConsumerStatefulWidget {
  const _Detail({required this.product, required this.slug});
  final ProductDetail product;
  final String slug;

  @override
  ConsumerState<_Detail> createState() => _DetailState();
}

class _DetailState extends ConsumerState<_Detail> {
  bool _wished = false;
  int _gallery = 0;

  ProductDetail get p => widget.product;

  Future<void> _toggleWish() async {
    setState(() => _wished = !_wished);
    try {
      await ref.read(stallApiProvider).toggleWishlist(p.id, add: _wished);
      ref.invalidate(wishlistProvider);
    } catch (_) {
      if (mounted) setState(() => _wished = !_wished);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final images = p.images.isEmpty ? <String>[''] : p.images;

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 320,
          actions: [
            IconButton(
              icon: Icon(_wished ? Icons.favorite : Icons.favorite_border,
                  color: _wished ? c.error : null),
              onPressed: _toggleWish,
            ),
            IconButton(icon: const Icon(Icons.share_outlined), onPressed: () {}),
          ],
          flexibleSpace: FlexibleSpaceBar(
            background: Column(
              children: [
                Expanded(
                  child: PageView.builder(
                    onPageChanged: (i) => setState(() => _gallery = i),
                    itemCount: images.length,
                    itemBuilder: (context, i) => GestureDetector(
                      onTap: () => _openGallery(context, i, images.length),
                      child: ProductThumb(
                        seed: '${p.id}$i',
                        label: p.brand ?? p.title,
                        size: double.infinity,
                        radius: 0,
                      ),
                    ),
                  ),
                ),
                if (images.length > 1)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpace.s8, top: AppSpace.s4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        images.length,
                        (i) => Container(
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          width: i == _gallery ? 18 : 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: i == _gallery ? c.primary : c.border,
                            borderRadius: BorderRadius.circular(AppRadius.pill),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.s16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (p.brand != null)
                  Text(p.brand!.toUpperCase(),
                      style: context.text.labelSmall?.copyWith(color: c.textLow)),
                const SizedBox(height: AppSpace.s4),
                Text(p.title, style: context.text.headlineMedium),
                const SizedBox(height: AppSpace.s8),
                Row(
                  children: [
                    Text(formatMoney(p.fromPriceMinor, p.currency),
                        style: context.text.titleLarge?.copyWith(color: c.onPrimaryContainer)),
                    const SizedBox(width: AppSpace.s8),
                    if (p.offers.length > 1)
                      Text('from ${p.offers.length} sellers',
                          style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                  ],
                ),
                if (p.ratingCount > 0) ...[
                  const SizedBox(height: AppSpace.s6),
                  Row(children: [
                    Icon(Icons.star, size: 16, color: c.rating),
                    Text(' ${p.ratingAvg.toStringAsFixed(1)} · ${p.ratingCount} reviews',
                        style: context.text.bodyMedium),
                  ]),
                ],
                if (p.variants.length > 1) ...[
                  const SizedBox(height: AppSpace.s16),
                  Text('Options', style: context.text.titleSmall),
                  const SizedBox(height: AppSpace.s8),
                  Wrap(
                    spacing: AppSpace.s8,
                    children: [
                      for (final v in p.variants)
                        Chip(label: Text('${v.name} · ${formatMoney(v.priceMinor, p.currency)}')),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpace.s20),
                Text('Sellers', style: context.text.titleMedium),
                const SizedBox(height: AppSpace.s8),
                for (final o in p.offers) _OfferRow(offer: o, currency: p.currency),
                const SizedBox(height: AppSpace.s20),
                Text('Description', style: context.text.titleMedium),
                const SizedBox(height: AppSpace.s8),
                Text(p.description, style: context.text.bodyLarge?.copyWith(color: c.textMed)),
                const SizedBox(height: AppSpace.s24),
                _ReviewsBlock(product: p, slug: widget.slug),
                const SizedBox(height: AppSpace.s24),
                _SimilarRail(slug: widget.slug),
                const SizedBox(height: AppSpace.s16),
                Row(
                  children: [
                    Expanded(
                      child: SecondaryButton(
                        label: 'Ask a question',
                        onPressed: () => _askQuestion(context),
                      ),
                    ),
                    const SizedBox(width: AppSpace.s12),
                    Expanded(
                      child: PrimaryButton(
                        label: 'Add to cart',
                        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Cart & checkout arrive in Phase 3.')),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _askQuestion(BuildContext context) async {
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ask about this product'),
        content: AppField(label: 'Your question', controller: controller),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send')),
        ],
      ),
    );
    if (ok != true || controller.text.trim().isEmpty) return;
    try {
      await ref.read(stallApiProvider).askQuestion(widget.slug, controller.text.trim());
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Question sent.')));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Couldn\'t send your question.')));
      }
    }
  }

  void _openGallery(BuildContext context, int start, int count) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            PageView.builder(
              controller: PageController(initialPage: start),
              itemCount: count,
              itemBuilder: (context, i) => InteractiveViewer(
                child: Center(
                  child: ProductThumb(seed: '${p.id}$i', label: p.brand ?? p.title, size: 320),
                ),
              ),
            ),
            Positioned(
              top: AppSpace.s8,
              right: AppSpace.s8,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SimilarRail extends ConsumerWidget {
  const _SimilarRail({required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(similarProvider(slug));
    return async.maybeWhen(
      orElse: () => const SizedBox.shrink(),
      data: (items) {
        if (items.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('You might also like', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            SizedBox(
              height: 250,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s12),
                itemBuilder: (context, i) => SizedBox(
                  width: 160,
                  child: ProductCardTile(
                    product: items[i],
                    onTap: () => context.push(RoutePaths.product(items[i].slug)),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _OfferRow extends StatelessWidget {
  const _OfferRow({required this.offer, required this.currency});
  final OfferView offer;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpace.s8),
      padding: const EdgeInsets.all(AppSpace.s12),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                InkWell(
                  onTap: () => context.push(RoutePaths.vendor(offer.vendorId)),
                  child: Text(offer.vendorName,
                      style: context.text.titleSmall?.copyWith(color: c.onPrimaryContainer)),
                ),
                Text(
                  offer.gas != null
                      ? '${offer.gas!.weightKg} kg · ${offer.gas!.requiresExchange ? "exchange" : "with deposit"}'
                      : offer.condition,
                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                ),
              ],
            ),
          ),
          Text(formatMoney(offer.priceMinor, offer.currency), style: context.text.titleMedium),
        ],
      ),
    );
  }
}

class _ReviewsBlock extends ConsumerWidget {
  const _ReviewsBlock({required this.product, required this.slug});
  final ProductDetail product;
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Reviews (${product.reviewCount})', style: context.text.titleMedium),
            TextButton(onPressed: () => _writeReview(context, ref), child: const Text('Write one')),
          ],
        ),
        if (product.reviews.isEmpty)
          Text('No reviews yet.', style: context.text.bodyMedium?.copyWith(color: c.textMed))
        else
          for (final r in product.reviews.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.s12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    for (var i = 0; i < 5; i++)
                      Icon(i < r.rating ? Icons.star : Icons.star_border, size: 14, color: c.rating),
                    const SizedBox(width: AppSpace.s8),
                    Text(r.author, style: context.text.labelSmall),
                  ]),
                  if ((r.title ?? '').isNotEmpty)
                    Text(r.title!, style: context.text.titleSmall),
                  if ((r.body ?? '').isNotEmpty)
                    Text(r.body!, style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                ],
              ),
            ),
      ],
    );
  }

  Future<void> _writeReview(BuildContext context, WidgetRef ref) async {
    var rating = 5;
    final body = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Write a review'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (i) => IconButton(
                    icon: Icon(i < rating ? Icons.star : Icons.star_border),
                    color: context.colors.rating,
                    onPressed: () => setLocal(() => rating = i + 1),
                  ),
                ),
              ),
              AppField(label: 'Your review', controller: body),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Submit')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(stallApiProvider).addReview(slug, rating: rating, body: body.text.trim());
      ref.invalidate(productDetailProvider(slug));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Thanks for your review!')));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Couldn\'t submit your review.')));
      }
    }
  }
}
