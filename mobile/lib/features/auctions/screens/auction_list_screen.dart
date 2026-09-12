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
const _kLive = {'OPEN', 'FILLING', 'CLOSING'};
const _kUpcoming = {'ANNOUNCED'};
const _kEnded = {'DRAW_PENDING', 'DRAWING', 'COMPLETED', 'UNSOLD'};

class AuctionsBody extends ConsumerStatefulWidget {
  const AuctionsBody({super.key});

  @override
  ConsumerState<AuctionsBody> createState() => _AuctionsBodyState();
}

class _AuctionsBodyState extends ConsumerState<AuctionsBody> {
  String _filter = 'live';

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(auctionsProvider);
    return Column(
      children: [
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            children: [
              AppChip(
                'Live Draws',
                selected: _filter == 'live',
                onTap: () => setState(() => _filter = 'live'),
              ),
              const SizedBox(width: AppSpace.s8),
              AppChip(
                'Upcoming',
                selected: _filter == 'upcoming',
                onTap: () => setState(() => _filter = 'upcoming'),
              ),
              const SizedBox(width: AppSpace.s8),
              AppChip(
                'My Tickets',
                selected: false,
                onTap: () => context.push(RoutePaths.myTickets),
              ),
              const SizedBox(width: AppSpace.s8),
              AppChip(
                'Ended',
                selected: _filter == 'ended',
                onTap: () => setState(() => _filter = 'ended'),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.s8),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(auctionsProvider);
              await ref.read(auctionsProvider.future);
            },
            child: list.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ListView(
                children: [
                  const SizedBox(height: 120),
                  Center(child: Text('$e')),
                ],
              ),
              data: (all) {
                final wanted = switch (_filter) {
                  'upcoming' => _kUpcoming,
                  'ended' => _kEnded,
                  _ => _kLive,
                };
                final items = all.where((a) => wanted.contains(a.status)).toList();
                if (items.isEmpty) {
                  return ListView(
                    children: [
                      const SizedBox(height: 140),
                      Icon(
                        AppIcons.emoji_events_outlined,
                        size: 48,
                        color: context.colors.textLow,
                      ),
                      const SizedBox(height: AppSpace.s8),
                      Center(
                        child: Text(
                          'Nothing here right now',
                          style: context.text.bodyMedium,
                        ),
                      ),
                    ],
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(AppSpace.s16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s16),
                  itemBuilder: (_, i) => _AuctionCard(a: items[i]),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

String _timeLeft(DateTime? drawAt) {
  if (drawAt == null) return '';
  final d = drawAt.difference(DateTime.now());
  if (d.isNegative) return 'Closing soon';
  if (d.inDays > 0) return '${d.inDays}d ${d.inHours % 24}h left';
  if (d.inHours > 0) return '${d.inHours}h ${d.inMinutes % 60}m left';
  return '${d.inMinutes}m left';
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
              gradient: LinearGradient(
                colors: [c.primary, c.onPrimaryContainer],
              ),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppRadius.lg),
              ),
            ),
            alignment: Alignment.bottomLeft,
            padding: const EdgeInsets.all(AppSpace.s12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'LIVE INVERSE DRAW',
                  style: context.text.labelSmall?.copyWith(
                    color: Colors.white,
                    letterSpacing: 1.5,
                  ),
                ),
                if (a.drawAt != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.s8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.22),
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Text(
                      _timeLeft(a.drawAt),
                      style: context.text.labelSmall?.copyWith(color: Colors.white),
                    ),
                  ),
              ],
            ),
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
                    Text(
                      formatMoney(a.winTargetMinor, a.currency),
                      style: context.text.titleSmall?.copyWith(
                        color: c.primary,
                      ),
                    ),
                    const SizedBox(width: AppSpace.s8),
                    Text(
                      formatMoney(a.retailValueMinor, a.currency),
                      style: context.text.bodySmall?.copyWith(
                        color: c.textLow,
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${formatMoney(a.ticketPriceMinor, a.currency)} / ticket',
                      style: context.text.bodySmall?.copyWith(color: c.textMed),
                    ),
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
                Text(
                  '${auctionDemandLabel(a.fillPct)} · ${auctionStatusLabel(a.status)}',
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
                const SizedBox(height: AppSpace.s12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => context.push(RoutePaths.auction(a.slug)),
                    style: FilledButton.styleFrom(
                      shape: const StadiumBorder(),
                      minimumSize: const Size(0, 44),
                    ),
                    child: Text('Buy Ticket (${formatMoney(a.ticketPriceMinor, a.currency)})'),
                  ),
                ),
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
    backgroundColor: context.colors.bg,
    body: const SafeArea(
      child: Column(
        children: [
          AppScreenHeader('Inverse Draws'),
          Expanded(child: AuctionsBody()),
        ],
      ),
    ),
  );
}
