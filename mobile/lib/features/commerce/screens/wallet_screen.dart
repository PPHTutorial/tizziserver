import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
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
      appBar: AppBar(title: const Text('Wallet')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(walletProvider);
          ref.invalidate(walletTxnsProvider);
        },
        child: MaxWidth(
          child: ListView(
          padding: const EdgeInsets.all(AppSpace.s16),
          children: [
            walletAsync.when(
              loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
              error: (e, _) => CenteredState.error(
                title: 'Couldn\'t load your wallet',
                action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(walletProvider)),
              ),
              data: (w) => Container(
                padding: const EdgeInsets.all(AppSpace.s20),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [c.primary, c.onPrimaryContainer]),
                  borderRadius: BorderRadius.circular(AppRadius.xl),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Balance', style: context.text.labelMedium?.copyWith(color: Colors.white70)),
                    const SizedBox(height: 4),
                    Text(formatMoney(w.balanceMinor, w.currency),
                        style: context.text.headlineMedium?.copyWith(color: Colors.white)),
                    const SizedBox(height: AppSpace.s16),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.tonal(
                            onPressed: () => _topUpSheet(context, ref),
                            child: const Text('Top up'),
                          ),
                        ),
                        const SizedBox(width: AppSpace.s12),
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.white54),
                            ),
                            onPressed: () => _withdrawSheet(context, ref, w.balanceMinor),
                            child: const Text('Withdraw'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpace.s16),
            Card(
              elevation: 0,
              color: c.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.lg),
                side: BorderSide(color: c.border),
              ),
              child: ListTile(
                leading: Icon(AppIcons.credit_card, color: c.textMed),
                title: const Text('Payment methods'),
                trailing: const Icon(AppIcons.chevron_right),
                onTap: () => context.push(RoutePaths.paymentMethods),
              ),
            ),
            const SizedBox(height: AppSpace.s24),
            Text('Transactions', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            txnsAsync.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
              error: (e, _) => const Text('Couldn\'t load transactions'),
              data: (txns) => txns.isEmpty
                  ? const CenteredState(
                      icon: AppIcons.receipt_outlined,
                      title: 'No transactions yet',
                      body: 'Top up or pay for an order to see activity here.',
                    )
                  : Column(
                      children: [
                        for (final t in txns)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                              backgroundColor: t.isCredit ? c.successContainer : c.surfaceSunken,
                              child: Icon(t.isCredit ? AppIcons.south_west : AppIcons.north_east,
                                  size: 18, color: t.isCredit ? c.success : c.textMed),
                            ),
                            title: Text(t.description),
                            subtitle: Text(t.at.length >= 16 ? t.at.substring(0, 16).replaceFirst('T', ' ') : t.at),
                            trailing: Text(
                              '${t.isCredit ? '+' : '-'}${formatMoney(t.amountMinor, 'GHS')}',
                              style: context.text.titleSmall?.copyWith(color: t.isCredit ? c.success : c.textHi),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
        ),
      ),
    );
  }

  void _topUpSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
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
              decoration: const InputDecoration(labelText: 'Transaction PIN'),
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
