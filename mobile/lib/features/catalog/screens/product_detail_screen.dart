import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../core/api_config.dart';
import '../../commerce/commerce_providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';
import '../../trust/report_sheet.dart';

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
  bool _addingToCart = false;
  int _gallery = 0;

  ProductDetail get p => widget.product;

  Future<void> _addToCart() async {
    final offer = [...p.offers]..sort((a, b) => a.priceMinor.compareTo(b.priceMinor));
    if (offer.isEmpty) return;
    setState(() => _addingToCart = true);
    try {
      await ref.read(cartControllerProvider.notifier).add(offer.first.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Added to cart'),
            action: SnackBarAction(label: 'View', onPressed: () => context.push(RoutePaths.cart)),
          ),
        );
      }
    } on StallApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _addingToCart = false);
    }
  }

  Future<void> _toggleWish() async {
    setState(() => _wished = !_wished);
    try {
      await ref.read(stallApiProvider).toggleWishlist(p.id, add: _wished);
      ref.invalidate(wishlistProvider);
    } catch (_) {
      if (mounted) setState(() => _wished = !_wished);
    }
  }

  /// Tablet/desktop-width viewports get a side-by-side gallery|info layout
  /// instead of the collapsing phone header — there's enough width to show
  /// both without scrolling the gallery out of view.
  static const _wideBreakpoint = 840.0;

  List<Widget> _actions(BuildContext context) {
    final c = context.colors;
    return [
      IconButton(
        icon: Icon(_wished ? AppIcons.favorite : AppIcons.favorite_border,
            color: _wished ? c.error : null),
        onPressed: _toggleWish,
      ),
      IconButton(icon: const Icon(AppIcons.share_outlined), onPressed: () {}),
      PopupMenuButton<String>(
        onSelected: (v) {
          if (v == 'report') {
            showReportSheet(context, ref,
                targetType: 'PRODUCT', targetId: p.id, targetLabel: 'product');
          }
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'report', child: Text('Report product')),
        ],
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final images = p.images.isEmpty ? <String>[''] : p.images;
    final isWide = MediaQuery.sizeOf(context).width >= _wideBreakpoint;
    return isWide ? _buildWide(context, images) : _buildNarrow(context, images);
  }

  Widget _buildNarrow(BuildContext context, List<String> images) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 320,
          actions: _actions(context),
          flexibleSpace: FlexibleSpaceBar(
            background: _Gallery(
              images: images,
              index: _gallery,
              productId: p.id,
              label: p.brand ?? p.title,
              onPageChanged: (i) => setState(() => _gallery = i),
              onOpen: (i) => _openGallery(context, i, images.length),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.s16),
            child: _InfoSection(
              product: p,
              slug: widget.slug,
              addingToCart: _addingToCart,
              onAddToCart: _addToCart,
              onAskQuestion: () => _askQuestion(context),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildWide(BuildContext context, List<String> images) {
    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s8, vertical: AppSpace.s4),
            child: Row(
              children: [
                const BackButton(),
                Expanded(
                  child: Text(p.title,
                      style: context.text.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ),
                ..._actions(context),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpace.s16, 0, AppSpace.s16, AppSpace.s16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 4,
                    child: AspectRatio(
                      aspectRatio: 4 / 5,
                      child: _Gallery(
                        images: images,
                        index: _gallery,
                        productId: p.id,
                        label: p.brand ?? p.title,
                        onPageChanged: (i) => setState(() => _gallery = i),
                        onOpen: (i) => _openGallery(context, i, images.length),
                        borderRadius: AppRadius.lg,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpace.s24),
                  Expanded(
                    flex: 5,
                    child: SingleChildScrollView(
                      child: _InfoSection(
                        product: p,
                        slug: widget.slug,
                        addingToCart: _addingToCart,
                        onAddToCart: _addToCart,
                        onAskQuestion: () => _askQuestion(context),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
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
                icon: const Icon(AppIcons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The swipeable image carousel with a dot-page indicator, shared between the
/// phone (edge-to-edge, inside a collapsing app bar) and tablet (rounded,
/// fixed aspect ratio) layouts.
class _Gallery extends StatelessWidget {
  const _Gallery({
    required this.images,
    required this.index,
    required this.productId,
    required this.label,
    required this.onPageChanged,
    required this.onOpen,
    this.borderRadius = 0,
  });

  final List<String> images;
  final int index;
  final String productId;
  final String label;
  final ValueChanged<int> onPageChanged;
  final void Function(int start) onOpen;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(borderRadius),
            child: PageView.builder(
              onPageChanged: onPageChanged,
              itemCount: images.length,
              itemBuilder: (context, i) => GestureDetector(
                onTap: () => onOpen(i),
                child: ProductThumb(
                  seed: '$productId$i',
                  label: label,
                  size: double.infinity,
                  radius: 0,
                ),
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
                  width: i == index ? 18 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: i == index ? c.primary : c.border,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Title through add-to-cart — the scrollable info column, shared between the
/// phone (below the gallery) and tablet (beside the gallery) layouts.
class _InfoSection extends StatelessWidget {
  const _InfoSection({
    required this.product,
    required this.slug,
    required this.addingToCart,
    required this.onAddToCart,
    required this.onAskQuestion,
  });

  final ProductDetail product;
  final String slug;
  final bool addingToCart;
  final VoidCallback onAddToCart;
  final VoidCallback onAskQuestion;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = product;
    return Column(
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
            Icon(AppIcons.star, size: 16, color: c.rating),
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
        if (p.videos.isNotEmpty) ...[
          const SizedBox(height: AppSpace.s24),
          Text('Video', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s8),
          _ProductVideo(url: mediaUrl(p.videos.first)),
        ],
        const SizedBox(height: AppSpace.s24),
        _ReviewsBlock(product: p, slug: slug),
        const SizedBox(height: AppSpace.s24),
        _SimilarRail(slug: slug),
        const SizedBox(height: AppSpace.s16),
        Row(
          children: [
            Expanded(
              child: SecondaryButton(
                label: 'Ask a question',
                onPressed: onAskQuestion,
              ),
            ),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: PrimaryButton(
                label: 'Add to cart',
                loading: addingToCart,
                onPressed: p.offers.isEmpty || addingToCart ? null : onAddToCart,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Inline product video with tap-to-play/pause. Falls back to a static poster
/// tile if the stream can't be initialised.
class _ProductVideo extends StatefulWidget {
  const _ProductVideo({required this.url});
  final String url;

  @override
  State<_ProductVideo> createState() => _ProductVideoState();
}

class _ProductVideoState extends State<_ProductVideo> {
  VideoPlayerController? _ctrl;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    final ctrl = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _ctrl = ctrl;
    ctrl.initialize().then((_) {
      if (mounted) setState(() {});
    }).catchError((_) {
      if (mounted) setState(() => _failed = true);
    });
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final ctrl = _ctrl;
    final ready = ctrl != null && ctrl.value.isInitialized;

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: AspectRatio(
        aspectRatio: ready ? ctrl.value.aspectRatio : 16 / 9,
        child: GestureDetector(
          onTap: !ready
              ? null
              : () => setState(() => ctrl.value.isPlaying ? ctrl.pause() : ctrl.play()),
          child: Stack(
            alignment: Alignment.center,
            fit: StackFit.expand,
            children: [
              if (ready)
                VideoPlayer(ctrl)
              else
                Container(color: c.surfaceSunken),
              if (!ready && !_failed) const Center(child: CircularProgressIndicator()),
              if (_failed)
                Center(
                  child: Text('Video unavailable',
                      style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                ),
              if (ready && !ctrl.value.isPlaying)
                Container(
                  decoration: const BoxDecoration(color: Colors.black38, shape: BoxShape.circle),
                  padding: const EdgeInsets.all(AppSpace.s12),
                  child: const Icon(AppIcons.play_arrow, color: Colors.white, size: 36),
                ),
            ],
          ),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s8),
      child: AppCard(
        onTap: () => context.push(RoutePaths.vendor(offer.vendorId)),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(offer.vendorName,
                      style: context.text.titleSmall?.copyWith(color: c.onPrimaryContainer)),
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
                      Icon(i < r.rating ? AppIcons.star : AppIcons.star_border, size: 14, color: c.rating),
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
                    icon: Icon(i < rating ? AppIcons.star : AppIcons.star_border),
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
