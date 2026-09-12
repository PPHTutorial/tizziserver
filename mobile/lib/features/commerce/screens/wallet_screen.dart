import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';
import '../../../design/responsive.dart';
import '../../../app/router.dart';
import 'package:go_router/go_router.dart';

/// Screens 339–356 — wallet: balance, transaction feed, top-up, PIN-gated
/// withdrawal.
class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final walletAsync = ref.watch(walletProvider);
    final txnsAsync = ref.watch(walletTxnsProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(walletProvider);
            ref.invalidate(walletTxnsProvider);
          },
          child: MaxWidth(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(AppSpace.s16, 0, AppSpace.s16, AppSpace.s24),
              children: [
                const AppScreenHeader('Wallet'),
                walletAsync.when(
                  loading: () => const SkeletonBox(height: 190, radius: AppRadius.r2xl),
                  error: (e, _) => AppErrorView(e, onRetry: () => ref.invalidate(walletProvider)),
                  data: (w) => Container(
                    padding: const EdgeInsets.all(AppSpace.s20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [c.primary, c.onPrimaryContainer],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(AppRadius.r2xl),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text('Secure wallet',
                                  style: context.text.labelLarge?.copyWith(color: Colors.white)),
                            ),
                            Icon(AppIcons.credit_card, size: 18, color: Colors.white.withValues(alpha: 0.9)),
                          ],
                        ),
                        const SizedBox(height: AppSpace.s20),
                        Text('AVAILABLE BALANCE',
                            style: context.text.labelSmall?.copyWith(color: Colors.white70, letterSpacing: 1)),
                        const SizedBox(height: 4),
                        Text(formatMoney(w.balanceMinor, w.currency),
                            style: context.text.displayLarge?.copyWith(color: Colors.white, fontSize: 32)),
                        const SizedBox(height: AppSpace.s16),
                        Row(
                          children: [
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: () => _topUpSheet(context, ref),
                                style: FilledButton.styleFrom(
                                  backgroundColor: Colors.white.withValues(alpha: 0.22),
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(0, 48),
                                  shape: const StadiumBorder(),
                                ),
                                icon: const Icon(AppIcons.add, size: 14),
                                label: const Text('Top up'),
                              ),
                            ),
                            const SizedBox(width: AppSpace.s12),
                            Expanded(
                              child: OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(0, 48),
                                  side: BorderSide(color: Colors.white.withValues(alpha: 0.6)),
                                  shape: const StadiumBorder(),
                                ),
                                onPressed: () => _withdrawSheet(context, ref, w.balanceMinor),
                                icon: const Icon(AppIcons.arrow_upward, size: 13),
                                label: const Text('Withdraw'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: AppSpace.s16),
                AppCard(
                  padding: EdgeInsets.zero,
                  child: AppListRow(
                    icon: AppIcons.credit_card,
                    label: 'Payment methods',
                    onTap: () => context.push(RoutePaths.paymentMethods),
                  ),
                ),
                const SizedBox(height: AppSpace.s24),
                Row(
                  children: [
                    Expanded(child: Text('Recent transactions', style: context.text.titleMedium)),
                    TextButton(
                      onPressed: () => context.push(RoutePaths.walletTransactions),
                      child: const Text('See All'),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.s12),
                txnsAsync.when(
                  loading: () => const SkeletonList(rows: 4, rowHeight: 64),
                  error: (e, _) => const Text('Couldn\'t load transactions'),
                  data: (txns) => txns.isEmpty
                      ? const EmptyState(
                          icon: AppIcons.receipt_outlined,
                          title: 'No transactions yet',
                          message: 'Top up or pay for an order to see activity here.',
                        )
                      : Column(
                          children: [
                            for (final t in txns) ...[
                              AppCard(
                                child: Row(
                                  children: [
                                    Container(
                                      width: 40,
                                      height: 40,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: t.isCredit ? c.successContainer : c.surfaceSunken,
                                        borderRadius: BorderRadius.circular(AppRadius.md),
                                      ),
                                      child: Icon(
                                        t.isCredit ? AppIcons.arrow_downward : AppIcons.arrow_upward,
                                        size: 16,
                                        color: t.isCredit ? c.success : c.textMed,
                                      ),
                                    ),
                                    const SizedBox(width: AppSpace.s12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(t.description,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: context.text.titleSmall),
                                          Text(
                                            t.at.length >= 16 ? t.at.substring(0, 16).replaceFirst('T', ' · ') : t.at,
                                            style: context.text.bodySmall?.copyWith(color: c.textMed),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: AppSpace.s8),
                                    Text(
                                      '${t.isCredit ? '+' : '-'}${formatMoney(t.amountMinor, 'GHS')}',
                                      style: context.text.titleSmall
                                          ?.copyWith(color: t.isCredit ? c.success : c.textHi),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: AppSpace.s10),
                            ],
                          ],
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _topUpSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
      ),
      builder: (_) => _AmountSheet(
        title: 'Top up wallet',
        cta: 'Pay',
        onSubmit: (amountMinor, _) async {
          await ref.read(stallApiProvider).walletTopUp(amountMinor, gateway: 'mock');
          ref.invalidate(walletProvider);
          ref.invalidate(walletTxnsProvider);
        },
      ),
    );
  }

  void _withdrawSheet(BuildContext context, WidgetRef ref, int balanceMinor) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
      ),
      builder: (_) => _AmountSheet(
        title: 'Withdraw',
        cta: 'Withdraw',
        needsPin: true,
        maxMinor: balanceMinor,
        onSubmit: (amountMinor, pin) async {
          await ref.read(stallApiProvider).walletWithdraw(amountMinor: amountMinor, pin: pin!);
          ref.invalidate(walletProvider);
          ref.invalidate(walletTxnsProvider);
        },
      ),
    );
  }
}

class _AmountSheet extends StatefulWidget {
  const _AmountSheet({
    required this.title,
    required this.cta,
    required this.onSubmit,
    this.needsPin = false,
    this.maxMinor,
  });
  final String title;
  final String cta;
  final bool needsPin;
  final int? maxMinor;
  final Future<void> Function(int amountMinor, String? pin) onSubmit;

  @override
  State<_AmountSheet> createState() => _AmountSheetState();
}

class _AmountSheetState extends State<_AmountSheet> {
  final _amount = TextEditingController();
  final _pin = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _go() async {
    final major = double.tryParse(_amount.text.trim());
    if (major == null || major <= 0) {
      setState(() => _error = 'Enter a valid amount');
      return;
    }
    final minor = (major * 100).round();
    if (widget.maxMinor != null && minor > widget.maxMinor!) {
      setState(() => _error = 'More than your balance');
      return;
    }
    if (widget.needsPin && _pin.text.trim().length < 4) {
      setState(() => _error = 'Enter your 4–6 digit PIN');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onSubmit(minor, widget.needsPin ? _pin.text.trim() : null);
      if (mounted) Navigator.of(context).pop();
    } on StallApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpace.s16,
        right: AppSpace.s16,
        top: AppSpace.s16,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s12),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(prefixText: 'GHS ', hintText: '0.00'),
          ),
          if (widget.needsPin) ...[
            const SizedBox(height: AppSpace.s12),
            TextField(
              controller: _pin,
              obscureText: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(labelText: 'Transaction PIN', hintText: '4–6 digits'),
            ),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: InlineError(_error!)),
          const SizedBox(height: AppSpace.s16),
          PrimaryButton(label: widget.cta, loading: _busy, onPressed: _busy ? null : _go),
        ],
      ),
    );
  }
}
