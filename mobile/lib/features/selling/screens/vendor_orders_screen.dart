import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../selling_providers.dart';

/// §25 screen 442 — the seller's incoming orders, filterable by lifecycle
/// bucket. Pushed at `/sell/orders` and embedded as the vendor "Orders" tab.
class VendorOrdersScreen extends StatelessWidget {
  const VendorOrdersScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.colors.bg,
        appBar: AppBar(title: const Text('Incoming orders')),
        body: const VendorOrdersBody(),
      );
}

class VendorOrdersBody extends ConsumerStatefulWidget {
  const VendorOrdersBody({super.key});

  @override
  ConsumerState<VendorOrdersBody> createState() => _VendorOrdersBodyState();
}

class _VendorOrdersBodyState extends ConsumerState<VendorOrdersBody> {
  static const _tabs = <(String, String?)>[
    ('All', null),
    ('New', 'NEW'),
    ('Preparing', 'PREPARING'),
    ('Ready', 'READY_FOR_PICKUP'),
    ('Completed', 'COMPLETED'),
  ];
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(sellerOrdersProvider(_tabs[_tab].$2));

    return Column(
      children: [
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12),
            children: [
              for (var i = 0; i < _tabs.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                  child: ChoiceChip(
                    label: Text(_tabs[i].$1),
                    selected: _tab == i,
                    onSelected: (_) => setState(() => _tab = i),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(sellerOrdersProvider),
            child: async.when(
              loading: () => const SkeletonList(),
              error: (e, _) => CenteredState.error(
                title: 'Couldn\'t load your orders',
                action: PrimaryButton(
                  label: 'Retry',
                  onPressed: () => ref.invalidate(sellerOrdersProvider),
                ),
              ),
              data: (list) => list.isEmpty
                  ? const CenteredState(
                      icon: AppIcons.receipt_long_outlined,
                      title: 'No orders here',
                      body: 'Orders from shoppers will show up in this list.',
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(AppSpace.s16),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
                      itemBuilder: (context, i) => _OrderTile(order: list[i]),
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order});
  final SellerOrderDto order;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      onTap: () => context.push(RoutePaths.sellOrder(order.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
            Row(
              children: [
                Expanded(child: Text(order.orderNumber, style: context.text.titleSmall)),
                SellerStatusPill(status: order.status),
              ],
            ),
            const SizedBox(height: AppSpace.s6),
            Text(
              '${order.itemCount} item${order.itemCount == 1 ? '' : 's'} · '
              '${order.fulfilmentMethod == 'PICKUP' ? 'Pickup' : 'Delivery'}',
              style: context.text.bodyMedium?.copyWith(color: c.textMed),
            ),
            const SizedBox(height: AppSpace.s10),
            Row(
              children: [
                Icon(AppIcons.payments_outlined, size: 16, color: c.textLow),
                const SizedBox(width: AppSpace.s6),
                Text('Payout ', style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                Text(
                  formatMoney(order.payoutMinor, order.currency),
                  style: context.text.titleSmall,
                ),
                const Spacer(),
                const Icon(AppIcons.chevron_right),
              ],
            ),
          ],
        ),
    );
  }
}

/// Shared status chip for the seller's `VendorOrder.status` values.
class SellerStatusPill extends StatelessWidget {
  const SellerStatusPill({super.key, required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final tone = switch (status) {
      'COMPLETED' => BadgeTone.success,
      'CANCELLED' => BadgeTone.danger,
      'HANDED_OVER' => BadgeTone.neutral,
      _ => BadgeTone.info,
    };
    return StatusBadge(status, tone: tone);
  }
}
