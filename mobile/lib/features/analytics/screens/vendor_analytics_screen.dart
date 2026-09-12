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
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Analytics'),
            SizedBox(
              height: 48,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
                itemCount: 3,
                separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s8),
                itemBuilder: (_, i) {
                  final d = [7, 30, 90][i];
                  return AppChip('${d}d', selected: _days == d, onTap: () => setState(() => _days = d));
                },
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            Expanded(
              child: a.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (d) => ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpace.s16, 0, AppSpace.s16, AppSpace.s16),
                  children: [
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SectionHeader('Sales'),
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
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SectionHeader('Customers'),
                          Row(children: [
                            StatTile(label: 'Unique', value: '${d.customersUnique}'),
                            StatTile(label: 'Returning', value: '${d.customersReturning}'),
                            StatTile(label: 'New', value: '${d.customersUnique - d.customersReturning}'),
                          ]),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SectionHeader('Payouts'),
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
                            const StatTile(label: '', value: '', plain: true),
                          ]),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SectionHeader('Advertising ROI'),
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
                        ],
                      ),
                    ),
                    if (d.topProducts.isNotEmpty) ...[
                      const SizedBox(height: AppSpace.s16),
                      AppCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s16, AppSpace.s16, 0),
                              child: SectionHeader('Top products'),
                            ),
                            ...d.topProducts.take(6).map((p) => ListTile(
                                  dense: true,
                                  title: Text('${p['title']}', maxLines: 1, overflow: TextOverflow.ellipsis),
                                  subtitle: Text('${p['units']} sold'),
                                  trailing: Text(formatMoney((p['revenueMinor'] as num).toInt(), 'GHS')),
                                )),
                            const SizedBox(height: AppSpace.s8),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
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
            AppField(label: 'Amount (GHS)', hintText: '0.00', controller: amount, keyboardType: TextInputType.number),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Transaction PIN', hintText: '4–6 digits', controller: pin, keyboardType: TextInputType.number, obscureText: true),
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
