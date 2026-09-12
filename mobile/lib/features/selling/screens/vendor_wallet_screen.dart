import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../ads/ads_providers.dart';
import '../selling_providers.dart';

/// The vendor's own payouts screen — replaces the generic customer
/// [WalletScreen] for the VENDOR role's "wallet" nav tab. Shows the live
/// payable balance, recent payout history, and a PIN-gated "request payout"
/// action wired to the same `commerce.requestVendorPayout` endpoint the
/// Analytics screen's "Withdraw" button already uses.
class VendorWalletScreen extends StatelessWidget {
  const VendorWalletScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.colors.bg,
    body: const SafeArea(
      child: Column(
        children: [
          AppScreenHeader('Wallet'),
          Expanded(child: VendorWalletBody()),
        ],
      ),
    ),
  );
}

/// There's no dedicated "vendor balance" endpoint — `balanceMinor` is only
/// ever returned inside the vendor analytics payload (`payouts.balanceMinor`
/// in `packages/core/src/analytics/vendor.ts`, already consumed by
/// [VendorAnalyticsScreen]'s own "Withdraw" card). Reusing that same
/// `vendorAnalyticsProvider` here — rather than deriving a balance from the
/// payout list — keeps this screen's figure exactly as authoritative as the
/// one on Analytics, with a fixed 30-day window purely for the paid-out /
/// pending stats underneath it (the balance itself isn't day-scoped).
const _kWindowDays = 30;

class VendorWalletBody extends ConsumerWidget {
  const VendorWalletBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analytics = ref.watch(vendorAnalyticsProvider(_kWindowDays));
    final payouts = ref.watch(vendorPayoutsProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(vendorAnalyticsProvider(_kWindowDays));
        ref.invalidate(vendorPayoutsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(AppSpace.s16),
        children: [
          analytics.when(
            loading: () =>
                const SkeletonBox(height: 176, radius: AppRadius.r2xl),
            error: (e, _) => AppErrorView(
              e,
              onRetry: () => ref.invalidate(vendorAnalyticsProvider(_kWindowDays)),
            ),
            data: (d) => _BalanceCard(
              balanceMinor: d.balanceMinor,
              paidOutMinor: d.paidOutMinor,
              pendingPayoutMinor: d.pendingPayoutMinor,
              onRequestPayout: d.balanceMinor <= 0
                  ? null
                  : () => _requestPayout(context, ref, d.balanceMinor),
            ),
          ),
          const SizedBox(height: AppSpace.s24),
          Text('Payout history', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s12),
          payouts.when(
            loading: () => const SkeletonList(rows: 4, rowHeight: 64),
            error: (e, _) =>
                AppErrorView(e, onRetry: () => ref.invalidate(vendorPayoutsProvider)),
            data: (list) => list.isEmpty
                ? const EmptyState(
                    icon: AppIcons.payments_outlined,
                    title: 'No payouts yet',
                    message: 'Payouts you request will show up here.',
                  )
                : Column(
                    children: [
                      for (final p in list) ...[
                        _PayoutRow(payout: p),
                        const SizedBox(height: AppSpace.s10),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _requestPayout(
    BuildContext context,
    WidgetRef ref,
    int maxMinor,
  ) async {
    await showAppSheet<void>(
      context,
      builder: (_) => _PayoutSheet(
        maxMinor: maxMinor,
        onSubmit: (amountMinor, pin) async {
          await ref
              .read(stallApiProvider)
              .vendorRequestPayout(amountMinor: amountMinor, pin: pin);
          ref.invalidate(vendorAnalyticsProvider(_kWindowDays));
          ref.invalidate(vendorPayoutsProvider);
        },
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({
    required this.balanceMinor,
    required this.paidOutMinor,
    required this.pendingPayoutMinor,
    required this.onRequestPayout,
  });

  final int balanceMinor;
  final int paidOutMinor;
  final int pendingPayoutMinor;
  final VoidCallback? onRequestPayout;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
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
                child: Text(
                  'Seller wallet',
                  style: context.text.labelLarge?.copyWith(color: Colors.white),
                ),
              ),
              Icon(
                AppIcons.account_balance_wallet_outlined,
                size: 18,
                color: Colors.white.withValues(alpha: 0.9),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s20),
          Text(
            'AVAILABLE TO WITHDRAW',
            style: context.text.labelSmall?.copyWith(
              color: Colors.white70,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            formatMoney(balanceMinor, 'GHS'),
            style: context.text.displayLarge?.copyWith(
              color: Colors.white,
              fontSize: 32,
            ),
          ),
          const SizedBox(height: AppSpace.s16),
          Row(
            children: [
              Expanded(
                child: _WhiteStat(
                  label: 'Paid out (${_kWindowDays}d)',
                  value: formatMoney(paidOutMinor, 'GHS'),
                ),
              ),
              Expanded(
                child: _WhiteStat(
                  label: 'Pending (${_kWindowDays}d)',
                  value: formatMoney(pendingPayoutMinor, 'GHS'),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onRequestPayout,
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.22),
                foregroundColor: Colors.white,
                minimumSize: const Size(0, 48),
                shape: const StadiumBorder(),
              ),
              icon: const Icon(AppIcons.arrow_upward, size: 14),
              label: const Text('Request payout'),
            ),
          ),
        ],
      ),
    );
  }
}

class _WhiteStat extends StatelessWidget {
  const _WhiteStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        value,
        style: context.text.titleMedium?.copyWith(color: Colors.white),
      ),
      Text(
        label,
        style: context.text.labelSmall?.copyWith(
          color: Colors.white.withValues(alpha: 0.75),
        ),
      ),
    ],
  );
}

class _PayoutRow extends StatelessWidget {
  const _PayoutRow({required this.payout});
  final PayoutDto payout;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tone = switch (payout.status) {
      'PAID' => BadgeTone.success,
      'FAILED' => BadgeTone.danger,
      'PROCESSING' => BadgeTone.warning,
      _ => BadgeTone.info,
    };
    return AppCard(
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: c.surfaceSunken,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(AppIcons.arrow_upward, size: 16, color: c.textMed),
          ),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Payout', style: context.text.titleSmall),
                Text(
                  payout.at.length >= 16
                      ? payout.at.substring(0, 16).replaceFirst('T', ' · ')
                      : payout.at,
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatMoney(payout.amountMinor, payout.currency),
                style: context.text.titleSmall,
              ),
              const SizedBox(height: 2),
              StatusBadge(payout.status, tone: tone),
            ],
          ),
        ],
      ),
    );
  }
}

/// PIN-gated payout request sheet — amount + transaction PIN, mirroring the
/// existing withdrawal flows in [WalletScreen] and `VendorAnalyticsScreen`.
class _PayoutSheet extends StatefulWidget {
  const _PayoutSheet({required this.maxMinor, required this.onSubmit});
  final int maxMinor;
  final Future<void> Function(int amountMinor, String pin) onSubmit;

  @override
  State<_PayoutSheet> createState() => _PayoutSheetState();
}

class _PayoutSheetState extends State<_PayoutSheet> {
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
    if (minor > widget.maxMinor) {
      setState(() => _error = 'More than your available balance');
      return;
    }
    if (_pin.text.trim().length < 4) {
      setState(() => _error = 'Enter your 4–6 digit PIN');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onSubmit(minor, _pin.text.trim());
      if (mounted) Navigator.of(context).pop();
    } on StallApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _busy = false;
        _error = '$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpace.s16,
        right: AppSpace.s16,
        top: AppSpace.s8,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Request payout', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s4),
          Text(
            'Available: ${formatMoney(widget.maxMinor, 'GHS')}',
            style: context.text.bodyMedium?.copyWith(color: c.textMed),
          ),
          const SizedBox(height: AppSpace.s16),
          AppField(
            label: 'Amount (GHS)',
            hintText: '0.00',
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: AppSpace.s12),
          AppField(
            label: 'Transaction PIN',
            hintText: '4–6 digits',
            controller: _pin,
            keyboardType: TextInputType.number,
            obscureText: true,
          ),
          InlineError(_error),
          const SizedBox(height: AppSpace.s16),
          PrimaryButton(
            label: 'Request payout',
            loading: _busy,
            onPressed: _busy ? null : _go,
          ),
        ],
      ),
    );
  }
}
