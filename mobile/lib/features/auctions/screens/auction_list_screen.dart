import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/auction_models.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../auction_providers.dart';
import '../../../design/icons.dart';

/// Inverse Draw marketplace. Gated `auction` — only rendered where the tenant
/// has the feature (GrandPrice).
class AuctionsBody extends ConsumerWidget {
  const AuctionsBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(auctionsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(auctionsProvider);
        await ref.read(auctionsProvider.future);
      },
      child: list.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [const SizedBox(height: 120), Center(child: Text('$e'))]),
        data: (items) {
          if (items.isEmpty) {
            return ListView(children: [
              const SizedBox(height: 140),
              Icon(AppIcons.emoji_events_outlined, size: 48, color: context.colors.textLow),
              const SizedBox(height: AppSpace.s8),
              Center(child: Text('No live draws right now', style: context.text.bodyMedium)),
            ]);
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpace.s16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s16),
            itemBuilder: (_, i) => _AuctionCard(a: items[i]),
          );
        },
      ),
    );
  }
}

class _AuctionCard extends StatelessWidget {
  const _AuctionCard({required this.a});
  final AuctionCardDto a;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      padding: EdgeInsets.zero,
      onTap: () => context.push(RoutePaths.auction(a.slug)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 130,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [c.primary, c.onPrimaryContainer]),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
            ),
            alignment: Alignment.bottomLeft,
            padding: const EdgeInsets.all(AppSpace.s12),
            child: Text('LIVE INVERSE DRAW',
                style: context.text.labelSmall?.copyWith(color: Colors.white, letterSpacing: 1.5)),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpace.s16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(a.title, style: context.text.titleMedium),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(formatMoney(a.winTargetMinor, a.currency),
                        style: context.text.titleSmall?.copyWith(color: c.primary)),
                    const SizedBox(width: AppSpace.s8),
                    Text(formatMoney(a.retailValueMinor, a.currency),
                        style: context.text.bodySmall?.copyWith(color: c.textLow, decoration: TextDecoration.lineThrough)),
                  ],
                ),
                const SizedBox(height: AppSpace.s12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  child: LinearProgressIndicator(
                    value: a.seatsTotal == 0 ? 0 : a.seatsSold / a.seatsTotal,
                    minHeight: 8,
                    backgroundColor: c.surfaceSunken,
                    color: c.primary,
                  ),
                ),
                const SizedBox(height: 4),
                Text('${a.seatsSold} of ${a.seatsTotal} seats · ${auctionStatusLabel(a.status)}',
                    style: context.text.bodySmall?.copyWith(color: c.textMed)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AuctionListScreen extends StatelessWidget {
  const AuctionListScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Inverse Draws')),
        body: const SafeArea(child: AuctionsBody()),
      );
}
