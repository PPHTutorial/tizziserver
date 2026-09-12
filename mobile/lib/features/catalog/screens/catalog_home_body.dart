import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/auction_models.dart';
import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../core/api_config.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../ads/widgets/sponsored_rail.dart';
import '../../auctions/auction_providers.dart';
import '../catalog_providers.dart';
import '../category_images.dart';
import '../widgets/product_card_tile.dart';
import '../widgets/category_browser.dart';
import '../widgets/voice_search_dialog.dart';
import '../../../design/icons.dart';

Future<void> _openVoiceSearch(BuildContext context) async {
  final query = await showAppDialog<String>(
    context,
    builder: (_) => const VoiceSearchDialog(),
  );
  if (query != null && query.trim().isNotEmpty && context.mounted) {
    context.push(RoutePaths.search, extra: query.trim());
  }
}

/// Screens 21–22, 26–31, 39–40 — the customer home feed (no Scaffold; hosted by
/// HomeShell). Driven by `GET /api/v1/catalog/home`.
class CatalogHomeBody extends ConsumerWidget {
  const CatalogHomeBody({super.key, required this.platformName});
  final String platformName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(homeRailsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(homeRailsProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [
            const SizedBox(height: 120),
            CenteredState.error(
              title: 'Couldn\'t load the home feed',
              action: PrimaryButton(
                label: 'Retry',
                onPressed: () => ref.invalidate(homeRailsProvider),
              ),
            ),
          ],
        ),
        data: (rails) => ListView(
          padding: const EdgeInsets.only(bottom: AppSpace.s24),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s16,
                AppSpace.s8,
                AppSpace.s16,
                AppSpace.s16,
              ),
              child: Material(
                color: c.surface,
                shape: StadiumBorder(
                  side: BorderSide(color: c.border.withValues(alpha: 0.5)),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => context.push(RoutePaths.search),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.s16,
                      vertical: AppSpace.s14,
                    ),
                    child: Row(
                      children: [
                        Icon(AppIcons.search, color: c.textLow, size: 18),
                        const SizedBox(width: AppSpace.s10),
                        Expanded(
                          child: Text(
                            'Search $platformName',
                            style: context.text.bodyLarge?.copyWith(
                              color: c.textLow,
                            ),
                          ),
                        ),
                        _SearchBarAction(
                          icon: AppIcons.mic,
                          color: c.textLow,
                          onTap: () => _openVoiceSearch(context),
                        ),
                        const SizedBox(width: AppSpace.s4),
                        _SearchBarAction(
                          icon: AppIcons.camera,
                          color: c.textLow,
                          onTap: () => context.push(RoutePaths.barcodeScan),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const _CategoryRail(),
            const _InverseDrawBanner(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s16,
                0,
                AppSpace.s16,
                AppSpace.s20,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _QuickAction(
                      icon: AppIcons.bolt,
                      label: 'Flash deals',
                      onTap: () => context.push(RoutePaths.deals),
                    ),
                  ),
                  const SizedBox(width: AppSpace.s12),
                  Expanded(
                    child: _QuickAction(
                      icon: AppIcons.category_outlined,
                      label: 'Categories',
                      onTap: () => context.push(RoutePaths.categories),
                    ),
                  ),
                  const SizedBox(width: AppSpace.s12),
                  Expanded(
                    child: _QuickAction(
                      icon: AppIcons.near_me,
                      label: 'Nearby',
                      onTap: () => context.push(RoutePaths.nearby),
                    ),
                  ),
                ],
              ),
            ),
            for (final banner in rails.banners) _BannerCard(promo: banner),
            for (final deal in rails.flashDeals)
              _FlashDealRail(
                promo: deal,
                onViewAll: () => context.push(RoutePaths.deals),
              ),
            if (rails.campaigns.isNotEmpty)
              for (final campaign in rails.campaigns)
                _ProductRail(
                  title: campaign.title,
                  onViewAll: () => context.push(RoutePaths.campaigns),
                  items: campaign.items
                      .map(
                        (i) => ProductCard(
                          id: i.productId,
                          slug: i.slug,
                          title: i.title,
                          brand: i.brand,
                          image: i.image,
                          fromPriceMinor: i.priceMinor,
                          currency: i.currency,
                        ),
                      )
                      .toList(),
                ),
            const SponsoredRail(slot: 'HOME_RAIL'),
            if (rails.newArrivals.isNotEmpty)
              _ProductRail(
                title: 'Fresh arrivals',
                items: rails.newArrivals,
                onViewAll: () => context.push(RoutePaths.newArrivals),
              ),
            if (rails.topRated.isNotEmpty)
              _ProductRail(
                title: 'Top rated',
                items: rails.topRated,
                onViewAll: () => context.push(RoutePaths.topRated),
              ),
            if (rails.recentlyViewed.isNotEmpty)
              _ProductRail(
                title: 'Recently viewed',
                onViewAll: () => context.push(RoutePaths.recentlyViewed),
                items: rails.recentlyViewed
                    .map(
                      (w) => ProductCard(
                        id: w.productId,
                        slug: w.slug,
                        title: w.title,
                        image: w.image,
                        fromPriceMinor: w.fromPriceMinor,
                        currency: w.currency,
                      ),
                    )
                    .toList(),
              ),
          ],
        ),
      ),
    );
  }
}

/// Circular category thumbnails right under the search bar — matches
/// Figma's `home-discover` frame exactly (photo + label row of top-level
/// categories, before anything else on the page).
class _CategoryRail extends ConsumerWidget {
  const _CategoryRail();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(rootCategoriesProvider('all'));
    return async.maybeWhen(
      data: (roots) => roots.isEmpty
          ? const SizedBox.shrink()
          : SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.s16,
                  0,
                  AppSpace.s16,
                  AppSpace.s16,
                ),
                itemCount: roots.length + 1,
                separatorBuilder: (_, __) =>
                    const SizedBox(width: AppSpace.s16),
                itemBuilder: (context, i) {
                  if (i == roots.length) {
                    final c = context.colors;
                    return InkWell(
                      onTap: () => context.push(RoutePaths.categories),
                      borderRadius: BorderRadius.circular(40),
                      child: SizedBox(
                        width: 64,
                        child: Column(
                          children: [
                            CircleAvatar(
                              radius: 28,
                              backgroundColor: c.primaryContainer,
                              child: Icon(
                                AppIcons.category_outlined,
                                color: c.onPrimaryContainer,
                                size: 22,
                              ),
                            ),
                            const SizedBox(height: AppSpace.s6),
                            Text(
                              'See all',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: context.text.labelMedium,
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  final cat = roots[i];
                  return InkWell(
                    onTap: () => context.push(RoutePaths.category(cat.slug)),
                    borderRadius: BorderRadius.circular(40),
                    child: SizedBox(
                      width: 64,
                      child: Column(
                        children: [
                          ClipOval(
                            child: Image.network(
                              categoryImage(cat.slug),
                              width: 56,
                              height: 56,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                width: 56,
                                height: 56,
                                color: context.colors.surfaceSunken,
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpace.s6),
                          Text(
                            cat.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: context.text.labelMedium,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

/// The "LIVE INVERSE DRAW" hero — the primary home entry point into
/// auctions per Figma, upgraded into a swipeable carousel over every
/// currently-live draw (not just the first one) with the prize's own photo
/// blended into the card via a colour-wash gradient, rather than a flat
/// orange block. Gated on the platform actually having the feature and at
/// least one currently sellable draw; a no-op (not an error state) either
/// way since most tenants (e.g. Tizzi Gas) never have this feature.
class _InverseDrawBanner extends ConsumerStatefulWidget {
  const _InverseDrawBanner();

  @override
  ConsumerState<_InverseDrawBanner> createState() => _InverseDrawBannerState();
}

class _InverseDrawBannerState extends ConsumerState<_InverseDrawBanner> {
  final _controller = PageController(viewportFraction: 1);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final boot = ref.watch(bootstrapProvider).valueOrNull;
    if (boot == null || !boot.hasFeature('auction')) {
      return const SizedBox.shrink();
    }
    final auctions = ref.watch(auctionsProvider);
    return auctions.maybeWhen(
      data: (list) {
        if (list.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpace.s16),
          child: Column(
            children: [
              SizedBox(
                height: 190,
                child: PageView.builder(
                  controller: _controller,
                  itemCount: list.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, i) => Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.s16,
                    ),
                    child: _InverseDrawCard(auction: list[i]),
                  ),
                ),
              ),
              if (list.length > 1) ...[
                const SizedBox(height: AppSpace.s8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < list.length; i++)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: i == _page ? 18 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: i == _page
                              ? context.colors.primary
                              : context.colors.border,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _InverseDrawCard extends StatelessWidget {
  const _InverseDrawCard({required this.auction});
  final AuctionCardDto auction;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: () => context.push('/auctions/${auction.slug}'),
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // The prize's own photo, so the card is never just a flat
            // colour block.
            Image.network(
              mediaUrl(auction.image ?? 'seed/${auction.id}'),
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) =>
                  Container(color: c.onPrimaryContainer),
            ),
            // A light brand-colour wash — the photo blends into the card's
            // own colours instead of disappearing under them. Kept low-alpha
            // so the photo actually shows through (a near-opaque wash here
            // previously hid the photo entirely).
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    c.primary.withValues(alpha: 0.5),
                    c.onPrimaryContainer.withValues(alpha: 0.35),
                  ],
                  begin: Alignment.bottomLeft,
                  end: Alignment.topRight,
                ),
              ),
            ),
            // A separate top/bottom dark scrim, independent of the colour
            // wash above, so the title and seats-sold text stay legible
            // over a bright photo without having to darken the whole card.
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Color.fromRGBO(0, 0, 0, 0.45),
                    Colors.transparent,
                    Color.fromRGBO(0, 0, 0, 0.5),
                  ],
                  stops: [0, 0.5, 1],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpace.s16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.s10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.22),
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Text(
                      'LIVE INVERSE DRAW',
                      style: context.text.labelSmall?.copyWith(
                        color: Colors.white,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpace.s12),
                  Text(
                    auction.title,
                    style: context.text.titleLarge?.copyWith(
                      color: Colors.white,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const Spacer(),
                  Text(
                    auctionDemandLabel(auction.fillPct),
                    style: context.text.bodyMedium?.copyWith(
                      color: Colors.white.withValues(alpha: 0.9),
                    ),
                  ),
                  const SizedBox(height: AppSpace.s6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                    child: LinearProgressIndicator(
                      value: auction.seatsTotal == 0
                          ? 0
                          : auction.seatsSold / auction.seatsTotal,
                      minHeight: 6,
                      backgroundColor: Colors.white.withValues(alpha: 0.25),
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: AppSpace.s12),
                  Row(
                    children: [
                      Text(
                        'Join Draw now',
                        style: context.text.titleSmall?.copyWith(
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(width: AppSpace.s4),
                      const Icon(
                        AppIcons.chevron_right,
                        size: 14,
                        color: Colors.white,
                      ),
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

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.s12),
      onTap: onTap,
      child: Column(
        children: [
          Icon(icon, color: c.primary),
          const SizedBox(height: AppSpace.s4),
          Text(label, style: context.text.labelMedium),
        ],
      ),
    );
  }
}

/// A small tappable icon inside the search bar (mic/camera). Its own [InkWell]
/// so tapping it doesn't also trigger the search bar's outer "open search" tap.
class _SearchBarAction extends StatelessWidget {
  const _SearchBarAction({
    required this.icon,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    shape: const CircleBorder(),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(icon, color: color, size: 16),
      ),
    ),
  );
}

class _BannerCard extends StatelessWidget {
  const _BannerCard({required this.promo});
  final PromotionView promo;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.s16,
        0,
        AppSpace.s16,
        AppSpace.s20,
      ),
      child: InkWell(
        onTap: promo.ctaRoute == null
            ? null
            : () => context.push(promo.ctaRoute!),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Container(
          height: 120,
          padding: const EdgeInsets.all(AppSpace.s16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [c.primary, c.onPrimaryContainer],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                promo.title,
                style: context.text.titleLarge?.copyWith(color: c.onPrimary),
              ),
              if (promo.subtitle != null) ...[
                const SizedBox(height: AppSpace.s4),
                Text(
                  promo.subtitle!,
                  style: context.text.bodyMedium?.copyWith(
                    color: c.onPrimary.withValues(alpha: 0.9),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _FlashDealRail extends StatelessWidget {
  const _FlashDealRail({required this.promo, this.onViewAll});
  final PromotionView promo;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            child: Row(
              children: [
                Icon(AppIcons.bolt, color: c.primary, size: 18),
                const SizedBox(width: AppSpace.s4),
                Expanded(
                  child: Text(
                    promo.title,
                    style: context.text.titleMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (promo.endsAtDate != null) ...[
                  CountdownText(until: promo.endsAtDate!),
                  const SizedBox(width: AppSpace.s8),
                ],
                if (onViewAll != null)
                  GestureDetector(
                    onTap: onViewAll,
                    child: Text(
                      'View All',
                      style: context.text.labelLarge?.copyWith(
                        color: c.primary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.s8),
          SizedBox(
            height: 210,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
              itemCount: promo.items.length,
              separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s12),
              itemBuilder: (context, i) {
                final it = promo.items[i];
                return SizedBox(
                  width: 150,
                  child: AppCard(
                    padding: EdgeInsets.zero,
                    onTap: () => context.push(RoutePaths.product(it.slug)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Stack(
                          children: [
                            AspectRatio(
                              aspectRatio: 1.2,
                              child: ProductThumb(
                                seed: it.productId,
                                label: it.brand ?? it.title,
                                imageKey: it.image,
                                size: double.infinity,
                                radius: AppRadius.lg,
                              ),
                            ),
                            if (it.discountBps != null)
                              Positioned(
                                top: AppSpace.s6,
                                left: AppSpace.s6,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: AppSpace.s6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: c.error,
                                    borderRadius: BorderRadius.circular(
                                      AppRadius.sm,
                                    ),
                                  ),
                                  child: Text(
                                    '-${it.discountPct!.toStringAsFixed(0)}%',
                                    style: context.text.labelSmall?.copyWith(
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.all(AppSpace.s8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                it.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.labelMedium,
                              ),
                              const SizedBox(height: AppSpace.s2),
                              Text(
                                formatMoney(
                                  it.effectivePriceMinor,
                                  it.currency,
                                ),
                                style: context.text.titleSmall?.copyWith(
                                  color: c.onPrimaryContainer,
                                ),
                              ),
                              if (it.dealPriceMinor != null)
                                Text(
                                  formatMoney(it.priceMinor, it.currency),
                                  style: context.text.labelSmall?.copyWith(
                                    color: c.textLow,
                                    decoration: TextDecoration.lineThrough,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductRail extends StatelessWidget {
  const _ProductRail({
    required this.title,
    required this.items,
    this.onViewAll,
  });
  final String title;
  final List<ProductCard> items;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.s8, bottom: AppSpace.s20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            child: Row(
              children: [
                Expanded(child: Text(title, style: context.text.titleMedium)),
                if (onViewAll != null)
                  GestureDetector(
                    onTap: onViewAll,
                    child: Text(
                      'View All',
                      style: context.text.labelLarge?.copyWith(
                        color: context.colors.primary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.s8),
          SizedBox(
            height: 250,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
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
      ),
    );
  }
}

/// Explore tab body — the category tree, inline.
/// The Explore tab's body — the same category filter/grid as `/categories`
/// ([CategoryBrowser]), not a separate design. Previously a plain stock
/// `Card`+`ExpansionTile` accordion that predated the real category-grid
/// rebuild and never got swept along with it.
class CatalogExploreBody extends StatelessWidget {
  const CatalogExploreBody({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.only(top: AppSpace.s8),
    child: CategoryBrowser(),
  );
}
