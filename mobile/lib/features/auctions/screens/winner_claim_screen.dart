import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/auction_models.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
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
      appBar: AppBar(title: const Text('Your prize')),
      body: SafeArea(
        child: win.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (w) => _Body(slug: slug, w: w),
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (!w.isWinner) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(w.isBackup ? AppIcons.hourglass_bottom : AppIcons.info_outline, size: 48, color: c.textMed),
            const SizedBox(height: AppSpace.s8),
            Text(
              w.isBackup ? 'You\'re backup #${w.backupOrder}' : 'This draw didn\'t go your way',
              style: context.text.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpace.s4),
            Text(
              w.isBackup
                  ? 'If the winner forfeits, you\'re next in line.'
                  : 'Non-winning seats are refunded to your wallet.',
              textAlign: TextAlign.center,
              style: context.text.bodyMedium?.copyWith(color: c.textMed),
            ),
          ]),
        ),
      );
    }

    final status = w.claimStatus ?? 'NONE';
    return ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpace.s20),
          decoration: BoxDecoration(color: c.successContainer, borderRadius: BorderRadius.circular(AppRadius.lg)),
          child: Column(children: [
            Icon(AppIcons.emoji_events, color: c.success, size: 44),
            const SizedBox(height: AppSpace.s8),
            Text('You won!', style: context.text.headlineSmall),
            Text(w.assetTitle ?? 'Your prize', style: context.text.bodyMedium?.copyWith(color: c.textMed)),
            const SizedBox(height: AppSpace.s8),
            Text('Buy it for ${formatMoney(w.winTargetMinor, w.currency)}',
                style: context.text.titleMedium?.copyWith(color: c.primary)),
            Text('retail ${formatMoney(w.retailValueMinor, w.currency)}',
                style: context.text.bodySmall?.copyWith(color: c.textLow, decoration: TextDecoration.lineThrough)),
          ]),
        ),
        const SizedBox(height: AppSpace.s20),
        _Step(n: 1, label: 'Start your claim', done: status != 'NONE'),
        _Step(n: 2, label: 'Verify your identity', done: const {'VERIFYING', 'APPROVED', 'FULFILLING', 'DELIVERED'}.contains(status)),
        _Step(n: 3, label: 'Approved', done: const {'APPROVED', 'FULFILLING', 'DELIVERED'}.contains(status)),
        _Step(n: 4, label: 'Pay winTarget & receive', done: w.winPurchaseStatus == 'PAID'),
        const SizedBox(height: AppSpace.s20),
        if (status == 'NONE')
          PrimaryButton(label: 'Start claim', loading: _busy, onPressed: () => _run(() => ref.read(stallApiProvider).auctionStartClaim(widget.slug).then((_) {})))
        else if (status == 'OPEN')
          PrimaryButton(
            label: 'Submit ID + selfie',
            loading: _busy,
            onPressed: () => _run(() async {
              final id = w.claimId ?? await ref.read(stallApiProvider).auctionStartClaim(widget.slug);
              await ref.read(stallApiProvider).auctionSubmitClaimKyc(id, documents: [
                {'type': 'ID_FRONT', 'fileKey': 'kyc/win-front.jpg'},
                {'type': 'SELFIE', 'fileKey': 'kyc/win-selfie.jpg'},
              ]);
            }),
          )
        else if (status == 'VERIFYING')
          Text('Your documents are under review. We\'ll notify you once approved.',
              style: context.text.bodyMedium?.copyWith(color: c.textMed))
        else if (status == 'APPROVED' && w.winPurchaseStatus != 'PAID')
          PrimaryButton(
            label: 'Pay ${formatMoney(w.winTargetMinor, w.currency)} from wallet',
            loading: _busy,
            onPressed: () => _run(() => ref.read(stallApiProvider).auctionWinPurchase(widget.slug, paymentMethod: 'wallet').then((_) {})),
          )
        else if (w.winPurchaseStatus == 'PAID')
          Text('Paid. Your prize is being arranged — track it under Deliveries once dispatched.',
              style: context.text.bodyMedium?.copyWith(color: c.success)),
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
      child: Row(children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(color: done ? c.primary : c.surfaceSunken, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: done
              ? const Icon(AppIcons.check, size: 14, color: Colors.white)
              : Text('$n', style: context.text.labelSmall),
        ),
        const SizedBox(width: AppSpace.s12),
        Text(label, style: context.text.bodyLarge?.copyWith(color: done ? c.textHi : c.textMed)),
      ]),
    );
  }
}
