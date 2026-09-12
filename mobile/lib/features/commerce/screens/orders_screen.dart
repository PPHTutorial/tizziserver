import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/router.dart';
import '../../../core/api_config.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screens 104–113 — order history, filterable by lifecycle bucket.
class OrdersScreen extends StatelessWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.colors.bg,
        body: SafeArea(
          child: Column(
            children: [
              const AppScreenHeader('My orders'),
              const Expanded(child: OrdersBody()),
            ],
          ),
        ),
      );
}

/// Scaffold-less order history — the shell's customer "Orders" tab body, and
/// wrapped by [OrdersScreen] for the pushed `/me/orders` route.
class OrdersBody extends ConsumerStatefulWidget {
  const OrdersBody({super.key});

  @override
  ConsumerState<OrdersBody> createState() => _OrdersBodyState();
}

class _OrdersBodyState extends ConsumerState<OrdersBody> {
  static const _tabs = <(String, String?)>[
    ('All', null),
    ('Active', 'PLACED'),
    ('Fulfilled', 'FULFILLED'),
    ('Cancelled', 'CANCELLED'),
  ];
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(ordersProvider(_tabs[_tab].$2));

    return Column(
      children: [
        SizedBox(
          height: 56,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s8, AppSpace.s16, AppSpace.s8),
            itemCount: _tabs.length,
            separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s8),
            itemBuilder: (_, i) => AppChip(
              _tabs[i].$1,
              selected: _tab == i,
              onTap: () => setState(() => _tab = i),
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(ordersProvider),
            child: async.when(
              loading: () => const SkeletonList(rows: 4, rowHeight: 150),
              error: (e, _) => ListView(children: [AppErrorView(e, onRetry: () => ref.invalidate(ordersProvider))]),
              data: (list) => list.isEmpty
                  ? ListView(children: const [
                      SizedBox(height: 80),
                      EmptyState(
                        icon: AppIcons.receipt_long_outlined,
                        title: 'No orders here',
                        message: 'Orders you place will show up in this list.',
                      ),
                    ])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s4, AppSpace.s16, AppSpace.s24),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
                      itemBuilder: (context, i) => _OrderCard(order: list[i]),
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});
  final OrderCardDto order;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final o = order;
    final status = o.status;
    final done = status == 'FULFILLED';
    final cancelled = status == 'CANCELLED' || status == 'REFUNDED';

    Widget divider() => Divider(height: AppSpace.s20, color: c.border.withValues(alpha: 0.6));
    void open() => context.push(RoutePaths.order(o.id));

    return AppCard(
      onTap: open,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('Order ${o.number}', style: context.text.titleSmall)),
              StatusBadge(status, tone: _orderStatusTone(status)),
            ],
          ),
          const SizedBox(height: 2),
          Text('Placed on ${_fmtDate(o.createdAt)}',
              style: context.text.bodySmall?.copyWith(color: c.textMed)),
          divider(),
          Row(
            children: [
              _Thumb(key_: o.thumbs.isNotEmpty ? o.thumbs.first : null),
              const SizedBox(width: AppSpace.s12),
              Expanded(
                child: Text(
                  '${o.itemCount} item${o.itemCount == 1 ? '' : 's'} · ${o.vendorCount} seller${o.vendorCount == 1 ? '' : 's'}',
                  style: context.text.bodyMedium?.copyWith(color: c.textHi),
                ),
              ),
            ],
          ),
          divider(),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total value', style: context.text.bodySmall?.copyWith(color: c.textMed)),
                    Text(formatMoney(o.totalMinor, o.currency), style: context.text.titleMedium),
                  ],
                ),
              ),
              if (!cancelled)
                SizedBox(
                  height: 40,
                  child: done
                      ? OutlinedButton(
                          onPressed: open,
                          style: OutlinedButton.styleFrom(
                            shape: const StadiumBorder(),
                            side: BorderSide(color: c.border),
                            foregroundColor: c.textHi,
                          ),
                          child: const Text('Reorder'),
                        )
                      : FilledButton(
                          onPressed: open,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 40),
                            shape: const StadiumBorder(),
                            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s20),
                          ),
                          child: const Text('Track order'),
                        ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({this.key_});
  final String? key_;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = BorderRadius.circular(AppRadius.md);
    return ClipRRect(
      borderRadius: r,
      child: Container(
        width: 52,
        height: 52,
        color: c.surfaceSunken,
        child: key_ == null || key_!.isEmpty
            ? Icon(AppIcons.shopping_bag_outlined, size: 18, color: c.textLow)
            : Image.network(
                mediaUrl(key_!),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Icon(AppIcons.shopping_bag_outlined, size: 18, color: c.textLow),
              ),
      ),
    );
  }
}

String _fmtDate(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${m[d.month - 1]} ${d.day}, ${d.year}';
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
