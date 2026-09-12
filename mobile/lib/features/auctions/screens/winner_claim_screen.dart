import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../api/auction_models.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/selectors.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auction_providers.dart';
import '../../../design/icons.dart';

/// Winner flow — claim → KYC → (staff approve) → buy at winTarget. Backups see
/// their standby position.
class WinnerClaimScreen extends ConsumerWidget {
  const WinnerClaimScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final win = ref.watch(myWinProvider(slug));
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Your prize'),
            Expanded(
              child: win.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (w) => _Body(slug: slug, w: w),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.slug, required this.w});
  final String slug;
  final MyWinDto w;
  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  MyWinDto get w => widget.w;

  Future<void> _run(Future<void> Function() op) async {
    setState(() => _busy = true);
    try {
      await op();
      ref.invalidate(myWinProvider(widget.slug));
      ref.invalidate(auctionDetailProvider(widget.slug));
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
    if (!w.isWinner) {
      return ListView(
        padding: const EdgeInsets.all(AppSpace.s24),
        children: [
          Icon(
            w.isBackup ? AppIcons.hourglass_bottom : AppIcons.info_outline,
            size: 48,
            color: c.textMed,
          ),
          const SizedBox(height: AppSpace.s8),
          Text(
            w.isBackup
                ? 'You\'re backup #${w.backupOrder}'
                : w.myRank != null
                ? 'Your position: #${w.myRank}'
                : 'This draw didn\'t go your way',
            style: context.text.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpace.s4),
          Text(
            w.isBackup
                ? 'If the winner forfeits, you\'re next in line.'
                : 'Non-winning seats keep the draw\'s below-retail price '
                      'possible — no refund unless the pool didn\'t fill.',
            textAlign: TextAlign.center,
            style: context.text.bodyMedium?.copyWith(color: c.textMed),
          ),
          if (w.myTicketCount != null && w.myScore != null) ...[
            const SizedBox(height: AppSpace.s4),
            Text(
              'You had ${w.myTicketCount} ticket${w.myTicketCount == 1 ? '' : 's'} '
              '(Score: ${w.myScore!.round()}/100).',
              textAlign: TextAlign.center,
              style: context.text.bodySmall?.copyWith(color: c.textLow),
            ),
          ],
          if (!w.isBackup && w.myRank != null) ...[
            const SizedBox(height: AppSpace.s24),
            Text('Top participants', style: context.text.titleSmall),
            const SizedBox(height: AppSpace.s8),
            _LeaderboardPreview(slug: widget.slug),
          ],
        ],
      );
    }

    final status = w.claimStatus ?? 'NONE';
    return ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpace.s20),
          decoration: BoxDecoration(
            color: c.successContainer,
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Column(
            children: [
              Icon(AppIcons.emoji_events, color: c.success, size: 44),
              const SizedBox(height: AppSpace.s8),
              Text('You won!', style: context.text.headlineSmall),
              Text(
                w.assetTitle ?? 'Your prize',
                style: context.text.bodyMedium?.copyWith(color: c.textMed),
              ),
              const SizedBox(height: AppSpace.s8),
              Text(
                'Buy it for ${formatMoney(w.winTargetMinor, w.currency)}',
                style: context.text.titleMedium?.copyWith(color: c.primary),
              ),
              Text(
                'retail ${formatMoney(w.retailValueMinor, w.currency)}',
                style: context.text.bodySmall?.copyWith(
                  color: c.textLow,
                  decoration: TextDecoration.lineThrough,
                ),
              ),
              const SizedBox(height: AppSpace.s12),
              OutlinedButton.icon(
                icon: const Icon(AppIcons.share_outlined, size: 16),
                label: const Text('Share'),
                onPressed: () => SharePlus.instance.share(
                  ShareParams(
                    text:
                        'I just won ${w.assetTitle ?? 'a prize'} on Stall\'s '
                        'Inverse Draw for ${formatMoney(w.winTargetMinor, w.currency)} '
                        '(retail ${formatMoney(w.retailValueMinor, w.currency)})!',
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.s20),
        _Step(n: 1, label: 'Start your claim', done: status != 'NONE'),
        _Step(
          n: 2,
          label: 'Verify your identity',
          done: const {
            'VERIFYING',
            'APPROVED',
            'FULFILLING',
            'DELIVERED',
          }.contains(status),
        ),
        _Step(
          n: 3,
          label: 'Approved',
          done: const {'APPROVED', 'FULFILLING', 'DELIVERED'}.contains(status),
        ),
        _Step(
          n: 4,
          label: 'Pay winTarget & receive',
          done: w.winPurchaseStatus == 'PAID',
        ),
        const SizedBox(height: AppSpace.s20),
        if (status == 'NONE')
          PrimaryButton(
            label: 'Start claim',
            loading: _busy,
            onPressed: () => _run(
              () => ref
                  .read(stallApiProvider)
                  .auctionStartClaim(widget.slug)
                  .then((_) {}),
            ),
          )
        else if (status == 'OPEN')
          PrimaryButton(
            label: 'Submit ID + selfie',
            loading: _busy,
            onPressed: () async {
              final docs = await _KycDocsSheet.show(context);
              if (docs == null) return;
              await _run(() async {
                final id =
                    w.claimId ??
                    await ref
                        .read(stallApiProvider)
                        .auctionStartClaim(widget.slug);
                await ref
                    .read(stallApiProvider)
                    .auctionSubmitClaimKyc(id, documents: docs);
              });
            },
          )
        else if (status == 'VERIFYING')
          Text(
            'Your documents are under review. We\'ll notify you once approved.',
            style: context.text.bodyMedium?.copyWith(color: c.textMed),
          )
        else if (status == 'APPROVED' && w.winPurchaseStatus != 'PAID')
          PrimaryButton(
            label:
                'Pay ${formatMoney(w.winTargetMinor, w.currency)} from wallet',
            loading: _busy,
            onPressed: () => _run(
              () => ref
                  .read(stallApiProvider)
                  .auctionWinPurchase(widget.slug, paymentMethod: 'wallet')
                  .then((_) {}),
            ),
          )
        else if (w.winPurchaseStatus == 'PAID')
          Text(
            'Paid. Your prize is being arranged — track it under Deliveries once dispatched.',
            style: context.text.bodyMedium?.copyWith(color: c.success),
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.n, required this.label, required this.done});
  final int n;
  final String label;
  final bool done;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: done ? c.primary : c.surfaceSunken,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: done
                ? const Icon(AppIcons.check, size: 14, color: Colors.white)
                : Text('$n', style: context.text.labelSmall),
          ),
          const SizedBox(width: AppSpace.s12),
          Text(
            label,
            style: context.text.bodyLarge?.copyWith(
              color: done ? c.textHi : c.textMed,
            ),
          ),
        ],
      ),
    );
  }
}

/// Top-N standings for a runner-up's results screen (Figma's `runner-up-screen`
/// "TOP PARTICIPANTS" list) — reuses the qualification-centre's own
/// leaderboard provider rather than a separate query.
class _LeaderboardPreview extends ConsumerWidget {
  const _LeaderboardPreview({required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(auctionLeaderboardProvider(slug));
    final c = context.colors;
    return board.when(
      loading: () => const SizedBox.shrink(),
      error: (e, _) => const SizedBox.shrink(),
      data: (rows) => Column(
        children: [
          for (final r in rows.take(5))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  SizedBox(
                    width: 28,
                    child: Text(
                      '${r.rank}',
                      style: context.text.titleSmall,
                    ),
                  ),
                  Expanded(
                    child: Text(r.name, style: context.text.bodyMedium),
                  ),
                  Text(
                    '${r.ticketCount} tickets',
                    style: context.text.labelSmall?.copyWith(
                      color: c.textMed,
                    ),
                  ),
                  const SizedBox(width: AppSpace.s8),
                  Text(
                    '${r.score.round()} pts',
                    style: context.text.labelMedium?.copyWith(
                      color: c.primary,
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

/// Collects the winner's real ID + selfie file keys before submitting the
/// claim's KYC — previously this step was skipped entirely and every claim
/// silently submitted the same two hardcoded placeholder paths regardless of
/// what the user actually had. Matches the manual file-key convention already
/// used by `business_docs_screen.dart` (no device camera/gallery picker exists
/// anywhere in the app yet).
class _KycDocsSheet extends StatefulWidget {
  const _KycDocsSheet();

  static Future<List<Map<String, String>>?> show(BuildContext context) =>
      showAppSheet<List<Map<String, String>>>(
        context,
        builder: (_) => const _KycDocsSheet(),
      );

  @override
  State<_KycDocsSheet> createState() => _KycDocsSheetState();
}

class _KycDocsSheetState extends State<_KycDocsSheet> {
  static const _docTypes = ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'];
  var _type = _docTypes.first;
  final _idKey = TextEditingController();
  final _selfieKey = TextEditingController();

  @override
  void dispose() {
    _idKey.dispose();
    _selfieKey.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _idKey.text.trim().isNotEmpty && _selfieKey.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.all(AppSpace.s20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Verify your identity', style: context.text.titleLarge),
          const SizedBox(height: AppSpace.s4),
          Text(
            'Ensure all details are clearly legible. No glare, reflection, or blur, and don\'t crop the document.',
            style: context.text.bodySmall?.copyWith(
              color: context.colors.textMed,
            ),
          ),
          const SizedBox(height: AppSpace.s16),
          AppSelect<String>(
            label: 'Document type',
            value: _type,
            items: [
              for (final t in _docTypes)
                AppSelectItem(value: t, label: t.replaceAll('_', ' ')),
            ],
            onChanged: (v) => setState(() => _type = v ?? _type),
          ),
          const SizedBox(height: AppSpace.s12),
          AppField(
            label: 'ID photo file key',
            controller: _idKey,
            hintText: 'kyc/id-front.jpg',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.s12),
          AppField(
            label: 'Selfie file key',
            controller: _selfieKey,
            hintText: 'kyc/selfie.jpg',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.s20),
          PrimaryButton(
            label: 'Submit for review',
            onPressed: ready
                ? () => Navigator.pop(context, [
                    {'type': _type, 'fileKey': _idKey.text.trim()},
                    {'type': 'SELFIE', 'fileKey': _selfieKey.text.trim()},
                  ])
                : null,
          ),
        ],
      ),
    );
  }
}
