import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/ads_models.dart';
import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../ads/ads_providers.dart';

class VendorAnalyticsScreen extends ConsumerStatefulWidget {
  const VendorAnalyticsScreen({super.key});
  @override
  ConsumerState<VendorAnalyticsScreen> createState() => _VendorAnalyticsScreenState();
}

class _VendorAnalyticsScreenState extends ConsumerState<VendorAnalyticsScreen> {
  int _days = 30;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = ref.watch(vendorAnalyticsProvider(_days));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(44),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(spacing: 8, children: [
              for (final d in [7, 30, 90])
                ChoiceChip(label: Text('${d}d'), selected: _days == d, onSelected: (_) => setState(() => _days = d)),
            ]),
          ),
        ),
      ),
      body: SafeArea(
        child: a.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (d) => ListView(
            padding: const EdgeInsets.all(AppSpace.s16),
            children: [
              Text('Sales', style: context.text.titleMedium),
              const SizedBox(height: AppSpace.s8),
              Row(children: [
                StatTile(label: 'Gross', value: formatMoney(d.grossMinor, 'GHS')),
                StatTile(label: 'Net payout', value: formatMoney(d.netMinor, 'GHS')),
                StatTile(label: 'Orders', value: '${d.orderCount}'),
              ]),
              const SizedBox(height: AppSpace.s8),
              Row(children: [
                StatTile(label: 'Units', value: '${d.units}'),
                StatTile(label: 'AOV', value: formatMoney(d.aovMinor, 'GHS')),
                StatTile(label: 'Rating', value: d.ratingAvg.toStringAsFixed(1)),
              ]),
              const SizedBox(height: AppSpace.s16),
              _Spark(points: d.salesSeries, color: c.primary),
              const SizedBox(height: AppSpace.s24),
              Text('Customers', style: context.text.titleMedium),
              const SizedBox(height: AppSpace.s8),
              Row(children: [
                StatTile(label: 'Unique', value: '${d.customersUnique}'),
                StatTile(label: 'Returning', value: '${d.customersReturning}'),
                StatTile(label: 'New', value: '${d.customersUnique - d.customersReturning}'),
              ]),
              const SizedBox(height: AppSpace.s24),
              Text('Payouts', style: context.text.titleMedium),
              const SizedBox(height: AppSpace.s8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpace.s16),
                decoration: BoxDecoration(
                  color: c.primary.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                ),
                child: Column(
                  children: [
                    Text('Available to withdraw', style: context.text.bodySmall?.copyWith(color: c.textMed)),
                    const SizedBox(height: 4),
                    Text(formatMoney(d.balanceMinor, 'GHS'), style: context.text.headlineMedium),
                    const SizedBox(height: AppSpace.s10),
                    PrimaryButton(
                      label: 'Withdraw',
                      onPressed: d.balanceMinor <= 0 ? null : () => _withdraw(context, ref, d.balanceMinor),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpace.s8),
              Row(children: [
                StatTile(label: 'Paid out', value: formatMoney(d.paidOutMinor, 'GHS')),
                StatTile(label: 'Pending', value: formatMoney(d.pendingPayoutMinor, 'GHS')),
                StatTile(label: '', value: ''),
              ]),
              const SizedBox(height: AppSpace.s24),
              Text('Advertising ROI', style: context.text.titleMedium),
              const SizedBox(height: AppSpace.s8),
              Row(children: [
                StatTile(label: 'Ad spend', value: formatMoney(d.adSpendMinor, 'GHS')),
                StatTile(label: 'Attributed', value: formatMoney(d.adRevenueMinor, 'GHS')),
                StatTile(label: 'ROAS', value: '${d.roas}×'),
              ]),
              const SizedBox(height: AppSpace.s8),
              Row(children: [
                StatTile(label: 'Impressions', value: '${d.adImpressions}'),
                StatTile(label: 'Clicks', value: '${d.adClicks}'),
                StatTile(label: 'CTR', value: '${d.adCtr}%'),
              ]),
              const SizedBox(height: AppSpace.s24),
              if (d.topProducts.isNotEmpty) ...[
                Text('Top products', style: context.text.titleMedium),
                const SizedBox(height: AppSpace.s8),
                ...d.topProducts.take(6).map((p) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: Text('${p['title']}', maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${p['units']} sold'),
                      trailing: Text(formatMoney((p['revenueMinor'] as num).toInt(), 'GHS')),
                    )),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _withdraw(BuildContext context, WidgetRef ref, int maxMinor) async {
    final amount = TextEditingController(text: (maxMinor / 100).toStringAsFixed(2));
    final pin = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Withdraw payout'),
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
      await ref.read(stallApiProvider).vendorRequestPayout(amountMinor: minor, pin: pin.text.trim());
      ref.invalidate(vendorAnalyticsProvider(_days));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Withdrawal requested.')));
      }
    } on StallApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

class _Spark extends StatelessWidget {
  const _Spark({required this.points, required this.color});
  final List<SeriesPoint> points;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final max = points.fold<double>(1, (m, p) => p.value > m ? p.value : m);
    return SizedBox(
      height: 90,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: points
            .map((p) => Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    height: (p.value / max) * 84 + 2,
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.75), borderRadius: BorderRadius.circular(2)),
                  ),
                ))
            .toList(),
      ),
    );
  }
}
