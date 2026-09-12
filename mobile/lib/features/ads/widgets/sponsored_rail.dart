import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/ads_models.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../catalog/widgets/product_card_tile.dart';
import '../ads_providers.dart';

/// A horizontal strip of sponsored product cards for a placement [slot]
/// (e.g. `HOME_RAIL`, `SEARCH_TOP`). Renders nothing while loading, empty, or
/// errored — `sponsoredProvider` already swallows its own errors — so it
/// never blocks or reflows a shopper feed around an ad call. Logs one
/// IMPRESSION per card the first time a given set of ads renders, and a
/// CLICK when a card is tapped, both best-effort (never blocks navigation).
class SponsoredRail extends ConsumerStatefulWidget {
  const SponsoredRail({super.key, required this.slot, this.title = 'Sponsored'});
  final String slot;
  final String title;

  @override
  ConsumerState<SponsoredRail> createState() => _SponsoredRailState();
}

class _SponsoredRailState extends ConsumerState<SponsoredRail> {
  String? _loggedForKey;

  void _logImpressionsOnce(List<SponsoredCardDto> items) {
    final key = items.map((i) => i.adId ?? i.campaignId).join(',');
    if (key.isEmpty || key == _loggedForKey) return;
    _loggedForKey = key;
    final api = ref.read(stallApiProvider);
    for (final item in items) {
      api
          .logAdEvent(campaignId: item.campaignId, adId: item.adId, kind: 'IMPRESSION', placement: widget.slot)
          .catchError((_) {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(sponsoredProvider(widget.slot)).valueOrNull ?? const [];
    if (items.isEmpty) return const SizedBox.shrink();

    WidgetsBinding.instance.addPostFrameCallback((_) => _logImpressionsOnce(items));

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            child: Text(widget.title, style: context.text.titleMedium),
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
                child: _SponsoredCard(item: items[i], slot: widget.slot),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SponsoredCard extends ConsumerWidget {
  const _SponsoredCard({required this.item, required this.slot});
  final SponsoredCardDto item;
  final String slot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final title = item.productTitle ?? item.headline ?? 'Sponsored';

    return AppCard(
      padding: EdgeInsets.zero,
      onTap: () {
        ref
            .read(stallApiProvider)
            .logAdEvent(campaignId: item.campaignId, adId: item.adId, kind: 'CLICK', placement: slot)
            .catchError((_) {});
        if (item.productSlug != null) {
          context.push(RoutePaths.product(item.productSlug!));
        } else if (item.destinationRoute != null) {
          context.push(item.destinationRoute!);
        }
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              AspectRatio(
                aspectRatio: 1.2,
                child: ProductThumb(
                  seed: item.adId ?? item.campaignId,
                  label: item.productTitle ?? item.headline,
                  imageKey: item.imageKey ?? item.productImage,
                  size: double.infinity,
                  radius: AppRadius.lg,
                ),
              ),
              Positioned(
                top: AppSpace.s6,
                left: AppSpace.s6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.s6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Text(
                    item.badge ?? 'Sponsored',
                    style: context.text.labelSmall?.copyWith(color: Colors.white),
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
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelMedium),
                if (item.subtext != null) ...[
                  const SizedBox(height: AppSpace.s2),
                  Text(
                    item.subtext!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.labelSmall?.copyWith(color: c.textLow),
                  ),
                ],
                if (item.fromPriceMinor != null) ...[
                  const SizedBox(height: AppSpace.s2),
                  Text(
                    formatMoney(item.fromPriceMinor!, item.currency),
                    style: context.text.titleSmall?.copyWith(color: c.onPrimaryContainer),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
