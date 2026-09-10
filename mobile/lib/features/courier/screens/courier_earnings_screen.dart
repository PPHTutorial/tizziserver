import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../courier_providers.dart';
import '../../../design/icons.dart';

class CourierEarningsBody extends ConsumerWidget {
  const CourierEarningsBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final summary = ref.watch(courierEarningsProvider);
    final txns = ref.watch(courierEarningTxnsProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(courierEarningsProvider);
        ref.invalidate(courierEarningTxnsProvider);
        await ref.read(courierEarningsProvider.future);
      },
      child: ListView(
        padding: const EdgeInsets.all(AppSpace.s16),
        children: [
          summary.when(
            loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
            error: (e, _) => Text('$e'),
            data: (s) => Column(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpace.s20),
                  decoration: BoxDecoration(
                    color: c.primary.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                  ),
                  child: Column(
                    children: [
                      Text('Available to withdraw', style: context.text.bodySmall?.copyWith(color: c.textMed)),
                      const SizedBox(height: 4),
                      Text(formatMoney(s.balanceMinor, s.currency), style: context.text.headlineMedium),
                      const SizedBox(height: AppSpace.s12),
                      PrimaryButton(
                        label: 'Withdraw earnings',
                        onPressed: s.balanceMinor <= 0 ? null : () => _withdraw(context, ref, s.balanceMinor),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.s12),
                Row(
                  children: [
                    StatTile(label: 'Today', value: formatMoney(s.today, s.currency)),
                    StatTile(label: 'Week', value: formatMoney(s.week, s.currency)),
                    StatTile(label: 'Month', value: formatMoney(s.month, s.currency)),
                  ],
                ),
                const SizedBox(height: AppSpace.s8),
                Text('${s.deliveries} deliveries · lifetime ${formatMoney(s.lifetimeNetMinor, s.currency)}',
                    style: context.text.bodySmall?.copyWith(color: c.textMed)),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.s20),
          Text('Recent activity', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s8),
          txns.when(
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
            error: (e, _) => Text('$e'),
            data: (list) => list.isEmpty
                ? Text('Nothing yet.', style: context.text.bodyMedium?.copyWith(color: c.textMed))
                : Column(
                    children: list
                        .map((t) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(
                                t.netMinor >= 0 ? AppIcons.arrow_downward : AppIcons.arrow_upward,
                                color: t.netMinor >= 0 ? c.success : c.error,
                              ),
                              title: Text(t.memo ?? t.kind),
                              subtitle: Text('${t.deliveryCode ?? t.kind} · ${t.at.toLocal().toString().substring(0, 16)}'),
                              trailing: Text('${t.netMinor >= 0 ? '+' : ''}${formatMoney(t.netMinor, t.currency)}',
                                  style: context.text.titleSmall),
                            ))
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _withdraw(BuildContext context, WidgetRef ref, int maxMinor) async {
    final amount = TextEditingController(text: (maxMinor / 100).toStringAsFixed(2));
    final pin = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Withdraw earnings'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppField(label: 'Amount (GHS)', controller: amount, keyboardType: TextInputType.number),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Transaction PIN', controller: pin, keyboardType: TextInputType.number, obscureText: true),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Withdraw')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final minor = ((double.tryParse(amount.text.trim()) ?? 0) * 100).round();
      await ref.read(stallApiProvider).courierRequestPayout(amountMinor: minor, pin: pin.text.trim());
      ref.invalidate(courierEarningsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Withdrawal requested.')));
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

class CourierEarningsScreen extends StatelessWidget {
  const CourierEarningsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Earnings')),
        body: const SafeArea(child: CourierEarningsBody()),
      );
}
