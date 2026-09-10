import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screens 104–113 — order history, filterable by lifecycle bucket.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  static const _tabs = <(String, String?)>[
    ('All', null),
    ('Active', 'PLACED'),
    ('Fulfilled', 'FULFILLED'),
    ('Cancelled', 'CANCELLED'),
  ];
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(ordersProvider(_tabs[_tab].$2));

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        title: const Text('My orders'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: SizedBox(
            height: 48,
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
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(ordersProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => CenteredState.error(
            title: 'Couldn\'t load your orders',
            action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(ordersProvider)),
          ),
          data: (list) => list.isEmpty
              ? const CenteredState(
                  icon: AppIcons.receipt_long_outlined,
                  title: 'No orders here',
                  body: 'Orders you place will show up in this list.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(AppSpace.s16),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
                  itemBuilder: (context, i) {
                    final o = list[i];
                    return AppCard(
                      onTap: () => context.push(RoutePaths.order(o.id)),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(o.number, style: context.text.titleSmall),
                                    const SizedBox(width: AppSpace.s8),
                                    _StatusPill(status: o.status),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${o.itemCount} item${o.itemCount == 1 ? '' : 's'} · ${o.vendorCount} seller${o.vendorCount == 1 ? '' : 's'}',
                                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                                ),
                              ],
                            ),
                          ),
                          Text(formatMoney(o.totalMinor, o.currency), style: context.text.titleMedium),
                          const Icon(AppIcons.chevron_right),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) => StatusBadge(status, tone: _orderStatusTone(status));
}

/// Shared tone mapping for order-lifecycle statuses — kept identical to
/// `_orderStatusTone` in order_detail_screen.dart so the two screens read
/// consistently.
BadgeTone _orderStatusTone(String status) => switch (status) {
      'FULFILLED' => BadgeTone.success,
      'CANCELLED' || 'REFUNDED' => BadgeTone.danger,
      'PENDING_PAYMENT' => BadgeTone.neutral,
      _ => BadgeTone.info,
    };
