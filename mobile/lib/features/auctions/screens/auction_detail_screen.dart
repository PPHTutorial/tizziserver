import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/auction_models.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auction_providers.dart';
import '../../../design/components.dart';
import '../../../design/icons.dart';
import '../../../design/responsive.dart';

class AuctionDetailScreen extends ConsumerWidget {
  const AuctionDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(auctionDetailProvider(slug));
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              'Inverse Draw',
              trailing: PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'dispute') _disputeDialog(context, ref, slug);
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'dispute',
                    child: Text('Dispute this draw'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: detail.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (a) => _Detail(a: a),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _disputeDialog(
  BuildContext context,
  WidgetRef ref,
  String slug,
) async {
  final body = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Dispute this draw'),
      content: AppField(
        label: 'What\'s wrong?',
        controller: body,
        hintText: 'Describe the problem with this draw or its outcome',
        maxLines: 4,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Submit'),
        ),
      ],
    ),
  );
  if (ok != true || body.text.trim().length < 3) return;
  try {
    await ref
        .read(stallApiProvider)
        .disputeAuction(slug, body: body.text.trim());
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Dispute submitted — our team will review it.'),
        ),
      );
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

class _Detail extends ConsumerWidget {
  const _Detail({required this.a});
  final AuctionDetailDto a;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return MaxWidth(
      child: ListView(
        padding: const EdgeInsets.all(AppSpace.s16),
        children: [
          Container(
            height: 150,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [c.primary, c.onPrimaryContainer],
              ),
              borderRadius: BorderRadius.circular(AppRadius.xl),
            ),
            alignment: Alignment.bottomLeft,
            padding: const EdgeInsets.all(AppSpace.s16),
            child: Text(
              'LIVE INVERSE DRAW',
              style: context.text.labelMedium?.copyWith(
                color: Colors.white,
                letterSpacing: 1.5,
              ),
            ),
          ),
          const SizedBox(height: AppSpace.s16),
          Text(a.title, style: context.text.headlineSmall),
          if (a.description != null) ...[
            const SizedBox(height: 4),
            Text(
              a.description!,
              style: context.text.bodyMedium?.copyWith(color: c.textMed),
            ),
          ],
          const SizedBox(height: AppSpace.s12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatMoney(a.winTargetMinor, a.currency),
                style: context.text.headlineMedium?.copyWith(color: c.primary),
              ),
              const SizedBox(width: AppSpace.s8),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  formatMoney(a.retailValueMinor, a.currency),
                  style: context.text.bodyMedium?.copyWith(
                    color: c.textLow,
                    decoration: TextDecoration.lineThrough,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s16),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: LinearProgressIndicator(
              value: a.seatsTotal == 0 ? 0 : a.seatsSold / a.seatsTotal,
              minHeight: 10,
              backgroundColor: c.surfaceSunken,
              color: c.primary,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${auctionDemandLabel(a.fillPct)} · ${auctionStatusLabel(a.status)}',
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
              ),
              if (a.drawAt != null && !a.isDrawn)
                Countdown(
                  target: a.drawAt!,
                  prefix: 'Draw in',
                  icon: AppIcons.clock,
                  imminentLabel: 'imminent',
                ),
            ],
          ),
          const SizedBox(height: AppSpace.s20),

          if (a.myTicketCount > 0) _MineCard(a: a),

          if (a.isOpen) ...[
            const SizedBox(height: AppSpace.s16),
            PrimaryButton(
              label:
                  'Join Draw · ${formatMoney(a.ticketPriceMinor, a.currency)} / seat',
              onPressed: () => _showBuySheet(context, ref, a),
            ),
            if (a.productId != null) ...[
              const SizedBox(height: AppSpace.s8),
              SecondaryButton(
                label: 'Buy retail instead',
                // The product route matches by slug or id, so the raw
                // productId works directly — no slug lookup needed.
                onPressed: () => context.push(RoutePaths.product(a.productId!)),
              ),
            ],
            const SizedBox(height: AppSpace.s4),
            Text(
              'Buying seats weights your odds in the draw. It does not guarantee a win.',
              style: context.text.bodySmall?.copyWith(color: c.textLow),
            ),
          ],

          if (a.isDrawn) ...[
            const SizedBox(height: AppSpace.s16),
            _DrawResultCard(a: a),
          ],

          const SizedBox(height: AppSpace.s20),
          if (a.assetSpecs != null && a.assetSpecs!.isNotEmpty) ...[
            Text('The prize', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            ...a.assetSpecs!.entries.map(
              (e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Text(
                      '${e.key}: ',
                      style: context.text.bodySmall?.copyWith(color: c.textMed),
                    ),
                    Text('${e.value}', style: context.text.bodyMedium),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpace.s16),
          ],
          AppCard(
            onTap: () => context.push(RoutePaths.auctionQualification(a.slug)),
            child: Row(
              children: [
                Icon(AppIcons.leaderboard_outlined, color: c.primary),
                const SizedBox(width: AppSpace.s12),
                const Expanded(child: Text('My qualification & ranking')),
                const Icon(AppIcons.chevron_right),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showBuySheet(
    BuildContext context,
    WidgetRef ref,
    AuctionDetailDto a,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
      ),
      builder: (_) => _BuySheet(a: a),
    );
    ref.invalidate(auctionDetailProvider(a.slug));
  }
}

class _MineCard extends StatelessWidget {
  const _MineCard({required this.a});
  final AuctionDetailDto a;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpace.s16),
      decoration: BoxDecoration(
        color: c.primaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Row(
        children: [
          Icon(AppIcons.confirmation_number, color: c.onPrimaryContainer),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${a.myTicketCount} seat${a.myTicketCount == 1 ? '' : 's'} held',
                  style: context.text.titleSmall?.copyWith(
                    color: c.onPrimaryContainer,
                  ),
                ),
                Text(
                  'Score ${a.myScore.toStringAsFixed(1)}${a.myRank != null ? ' · rank #${a.myRank}' : ''}',
                  style: context.text.bodySmall?.copyWith(
                    color: c.onPrimaryContainer,
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

class _DrawResultCard extends ConsumerWidget {
  const _DrawResultCard({required this.a});
  final AuctionDetailDto a;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    if (a.status == 'UNSOLD') {
      return Container(
        padding: const EdgeInsets.all(AppSpace.s16),
        decoration: BoxDecoration(
          color: c.surfaceSunken,
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Row(
          children: [
            Icon(AppIcons.replay, color: c.textMed),
            const SizedBox(width: AppSpace.s12),
            const Expanded(
              child: Text(
                'The pool didn\'t fill — every seat was refunded to your wallet.',
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(AppSpace.s16),
      decoration: BoxDecoration(
        color: a.winnerIsMe ? c.successContainer : c.surfaceSunken,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                a.winnerIsMe
                    ? AppIcons.emoji_events
                    : AppIcons.verified_outlined,
                color: a.winnerIsMe ? c.success : c.textMed,
              ),
              const SizedBox(width: AppSpace.s8),
              Text(
                a.winnerIsMe ? 'You won the draw!' : 'Draw complete',
                style: context.text.titleMedium,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s4),
          if (a.drawResultHash != null)
            Text(
              'Result proof: ${a.drawResultHash!.substring(0, 16)}…',
              style: context.text.bodySmall?.copyWith(
                color: c.textMed,
                fontFamily: 'monospace',
              ),
            ),
          if (a.drawSeedReveal != null)
            Text(
              'Seed: ${a.drawSeedReveal!.substring(0, 12)}… (commit ${a.drawSeedCommitHash?.substring(0, 8)}…)',
              style: context.text.bodySmall?.copyWith(
                color: c.textLow,
                fontFamily: 'monospace',
              ),
            ),
          if (a.winnerIsMe) ...[
            const SizedBox(height: AppSpace.s12),
            PrimaryButton(
              label: 'Claim your prize',
              onPressed: () => context.push(RoutePaths.auctionWin(a.slug)),
            ),
          ],
        ],
      ),
    );
  }
}

class _BuySheet extends ConsumerStatefulWidget {
  const _BuySheet({required this.a});
  final AuctionDetailDto a;
  @override
  ConsumerState<_BuySheet> createState() => _BuySheetState();
}

class _BuySheetState extends ConsumerState<_BuySheet> {
  String? _packageId;
  int _count = 1;
  String _method = 'wallet';
  bool _busy = false;

  AuctionDetailDto get a => widget.a;
  int get _amount => _packageId != null
      ? a.packages.firstWhere((p) => p.id == _packageId).priceMinor
      : _count * a.ticketPriceMinor;

  Future<void> _buy() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(stallApiProvider)
          .buyTickets(
            a.slug,
            packageId: _packageId,
            count: _packageId == null ? _count : null,
            paymentMethod: _method,
          );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Seats secured. Good luck!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpace.s16,
        right: AppSpace.s16,
        top: AppSpace.s16,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Join the draw', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s12),
          ...a.packages.map(
            (p) => RadioListTile<String>(
              contentPadding: EdgeInsets.zero,
              value: p.id,
              groupValue: _packageId,
              onChanged: (v) => setState(() => _packageId = v),
              title: Text(
                '${p.name}${p.bonusTickets > 0 ? ' (+${p.bonusTickets} bonus)' : ''}',
              ),
              subtitle: Text(formatMoney(p.priceMinor, a.currency)),
            ),
          ),
          RadioListTile<String?>(
            contentPadding: EdgeInsets.zero,
            value: null,
            groupValue: _packageId,
            onChanged: (_) => setState(() => _packageId = null),
            title: Row(
              children: [
                const Text('Custom'),
                const Spacer(),
                IconButton(
                  onPressed: () =>
                      setState(() => _count = (_count - 1).clamp(1, 100)),
                  icon: const Icon(AppIcons.remove),
                ),
                Text('$_count'),
                IconButton(
                  onPressed: () =>
                      setState(() => _count = (_count + 1).clamp(1, 100)),
                  icon: const Icon(AppIcons.add),
                ),
              ],
            ),
          ),
          const Divider(),
          Row(
            children: [
              ChoiceChip(
                label: const Text('Wallet'),
                selected: _method == 'wallet',
                onSelected: (_) => setState(() => _method = 'wallet'),
              ),
              const SizedBox(width: AppSpace.s8),
              ChoiceChip(
                label: const Text('Card / MoMo'),
                selected: _method == 'gateway',
                onSelected: (_) => setState(() => _method = 'gateway'),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s12),
          PrimaryButton(
            label: 'Pay ${formatMoney(_amount, a.currency)}',
            loading: _busy,
            onPressed: _buy,
          ),
          const SizedBox(height: AppSpace.s8),
          Text(
            'If the draw sells out, non-winner stakes fund the below-retail win price and aren\'t refunded. Full refunds only happen if the pool doesn\'t fill.',
            style: context.text.bodySmall?.copyWith(color: c.textLow),
          ),
        ],
      ),
    );
  }
}
