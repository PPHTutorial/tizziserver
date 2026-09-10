import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../ads/widgets/sponsored_rail.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

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
              padding: const EdgeInsets.all(AppSpace.s16),
              child: AppCard(
                padding: const EdgeInsets.all(AppSpace.s14),
                onTap: () => context.push(RoutePaths.search),
                child: Row(
                  children: [
                    Icon(AppIcons.search, color: c.textLow, size: 20),
                    const SizedBox(width: AppSpace.s8),
                    Text(
                      'Search $platformName',
                      style: context.text.bodyLarge?.copyWith(color: c.textLow),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s16,
                0,
                AppSpace.s16,
                AppSpace.s12,
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
                      icon: AppIcons.near_me,
                      label: 'Nearby',
                      onTap: () => context.push(RoutePaths.nearby),
                    ),
                  ),
                ],
              ),
            ),
            for (final banner in rails.banners) _BannerCard(promo: banner),
            for (final deal in rails.flashDeals) _FlashDealRail(promo: deal),
            if (rails.campaigns.isNotEmpty)
              for (final campaign in rails.campaigns)
                _ProductRail(
                  title: campaign.title,
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
              _ProductRail(title: 'Fresh arrivals', items: rails.newArrivals),
            if (rails.topRated.isNotEmpty)
              _ProductRail(title: 'Top rated', items: rails.topRated),
            if (rails.recentlyViewed.isNotEmpty)
              _ProductRail(
                title: 'Recently viewed',
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
        AppSpace.s12,
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
  const _FlashDealRail({required this.promo});
  final PromotionView promo;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            child: Row(
              children: [
                Icon(AppIcons.bolt, color: c.primary, size: 18),
                const SizedBox(width: AppSpace.s4),
                Text(promo.title, style: context.text.titleMedium),
                const Spacer(),
                if (promo.endsAtDate != null)
                  _Countdown(until: promo.endsAtDate!),
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

class _Countdown extends StatefulWidget {
  const _Countdown({required this.until});
  final DateTime until;

  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  late Duration _left = widget.until.difference(DateTime.now());

  @override
  void initState() {
    super.initState();
    _tick();
  }

  void _tick() {
    if (!mounted) return;
    setState(() => _left = widget.until.difference(DateTime.now()));
    if (_left > Duration.zero) {
      Future.delayed(const Duration(seconds: 30), _tick);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_left <= Duration.zero) return const SizedBox.shrink();
    final h = _left.inHours;
    final m = _left.inMinutes % 60;
    return Text(
      'ends in ${h}h ${m}m',
      style: context.text.labelSmall?.copyWith(color: context.colors.error),
    );
  }
}

class _ProductRail extends StatelessWidget {
  const _ProductRail({required this.title, required this.items});
  final String title;
  final List<ProductCard> items;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.s4, bottom: AppSpace.s12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            child: Text(title, style: context.text.titleMedium),
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
class CatalogExploreBody extends ConsumerWidget {
  const CatalogExploreBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(categoriesProvider);
    final c = context.colors;
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => CenteredState.error(
        title: 'Couldn\'t load categories',
        action: PrimaryButton(
          label: 'Retry',
          onPressed: () => ref.invalidate(categoriesProvider),
        ),
      ),
      data: (roots) => ListView(
        padding: const EdgeInsets.all(AppSpace.s12),
        children: [
          for (final root in roots)
            Card(
              elevation: 0,
              color: c.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.lg),
                side: BorderSide(color: c.border),
              ),
              child: ExpansionTile(
                shape: const Border(),
                leading: Icon(AppIcons.category_outlined, color: c.primary),
                title: Text(root.name, style: context.text.titleMedium),
                children: [
                  ListTile(
                    dense: true,
                    title: Text('All ${root.name}'),
                    trailing: const Icon(AppIcons.chevron_right),
                    onTap: () => context.push(RoutePaths.category(root.slug)),
                  ),
                  for (final child in root.children)
                    ListTile(
                      dense: true,
                      title: Text(child.name),
                      trailing: const Icon(AppIcons.chevron_right),
                      onTap: () =>
                          context.push(RoutePaths.category(child.slug)),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
