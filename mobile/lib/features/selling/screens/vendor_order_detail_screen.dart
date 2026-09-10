import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../api/delivery_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/responsive.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../catalog/widgets/product_card_tile.dart';
import '../selling_providers.dart';
import 'vendor_orders_screen.dart' show SellerStatusPill;

/// §25 screens 443–447 — one incoming sub-order: items, payout split, the
/// prep → ready → handoff → complete workflow, and (for delivery) the courier
/// pickup handoff card.
class VendorOrderDetailScreen extends ConsumerWidget {
  const VendorOrderDetailScreen({super.key, required this.vendorOrderId});
  final String vendorOrderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(sellerOrderProvider(vendorOrderId));

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Order')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load this order',
          action: PrimaryButton(
            label: 'Retry',
            onPressed: () => ref.invalidate(sellerOrderProvider(vendorOrderId)),
          ),
        ),
        data: (o) => _Detail(order: o),
      ),
    );
  }
}

class _Detail extends ConsumerStatefulWidget {
  const _Detail({required this.order});
  final SellerOrderDetailDto order;

  @override
  ConsumerState<_Detail> createState() => _DetailState();
}

class _DetailState extends ConsumerState<_Detail> {
  bool _busy = false;
  String? _error;

  SellerOrderDetailDto get o => widget.order;

  Future<void> _do(Future<void> Function() op, {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await op();
      ref.invalidate(sellerOrderProvider(o.id));
      ref.invalidate(sellerOrdersProvider);
      if (mounted && done != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
      }
    } on StallApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final action = _sellerNextAction(o.status, o.fulfilmentMethod);

    return MaxWidth(
      child: ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Row(
          children: [
            Expanded(child: Text(o.orderNumber, style: context.text.titleLarge)),
            SellerStatusPill(status: o.status),
          ],
        ),
        const SizedBox(height: AppSpace.s4),
        Text(
          'Placed ${_shortDate(o.placedAt ?? o.createdAt)} · '
          '${o.isPickup ? 'Customer pickup' : 'Delivery'}',
          style: context.text.bodyMedium?.copyWith(color: c.textMed),
        ),
        const SizedBox(height: AppSpace.s20),

        // --- items ---
        AppCard(
          child: Column(
            children: [
              for (final it in o.items)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpace.s6),
                  child: Row(
                    children: [
                      ProductThumb(seed: it.title, label: it.title, size: 40),
                      const SizedBox(width: AppSpace.s10),
                      Expanded(
                        child: Text('${it.qty}× ${it.title}',
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                      ),
                      Text(formatMoney(it.totalMinor, o.currency), style: context.text.bodyMedium),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.s16),

        // --- payout split ---
        Text('Your payout', style: context.text.titleMedium),
        const SizedBox(height: AppSpace.s8),
        _row(context, 'Items subtotal', formatMoney(o.subtotalMinor, o.currency)),
        _row(context, 'Platform commission', '-${formatMoney(o.commissionMinor, o.currency)}'),
        const Divider(height: AppSpace.s24),
        _row(context, 'Payout to you', formatMoney(o.payoutMinor, o.currency), bold: true),
        Text(
          o.status == 'COMPLETED'
              ? 'Released to your wallet.'
              : 'Released from escrow when you complete the order.',
          style: context.text.labelSmall?.copyWith(color: c.textLow),
        ),
        const SizedBox(height: AppSpace.s24),

        // --- fulfilment ---
        Text(o.isPickup ? 'Pickup' : 'Delivery', style: context.text.titleMedium),
        const SizedBox(height: AppSpace.s8),
        if (o.isPickup)
          _PickupCard(order: o)
        else if (o.deliveryId != null)
          _CourierHandoffCard(deliveryId: o.deliveryId!)
        else
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(AppIcons.location_on_outlined, size: 18, color: c.textMed),
                    const SizedBox(width: AppSpace.s8),
                    Expanded(
                      child: Text(
                        o.addressLine.isEmpty ? 'Delivery address on file' : o.addressLine,
                        style: context.text.bodyMedium,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.s8),
                Text(
                  'A courier is dispatched automatically once you mark this order ready.',
                  style: context.text.labelSmall?.copyWith(color: c.textLow),
                ),
              ],
            ),
          ),
        const SizedBox(height: AppSpace.s24),

        // --- returns ---
        if (o.returns.isNotEmpty) ...[
          Text('Returns', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s8),
          for (final r in o.returns) _ReturnCard(orderId: o.id, ret: r),
          const SizedBox(height: AppSpace.s16),
        ],

        // --- timeline ---
        if (o.events.isNotEmpty) ...[
          Text('Timeline', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s8),
          for (final e in o.events)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  Icon(AppIcons.circle, size: 8, color: c.primary),
                  const SizedBox(width: AppSpace.s8),
                  Text(e.type.replaceAll('_', ' ').toLowerCase(), style: context.text.bodyMedium),
                  const Spacer(),
                  Text(_shortDate(e.at), style: context.text.labelSmall?.copyWith(color: c.textLow)),
                ],
              ),
            ),
          const SizedBox(height: AppSpace.s24),
        ],

        // --- action ---
        if (_error != null) ...[InlineError(_error!), const SizedBox(height: AppSpace.s12)],
        if (action != null)
          PrimaryButton(
            label: action.label,
            loading: _busy,
            onPressed: _busy
                ? null
                : () => _do(
                      () async {
                        await ref.read(stallApiProvider).advanceSellerOrder(o.id, action.next);
                      },
                      done: action.done,
                    ),
          )
        else if (o.status == 'HANDED_OVER')
          PrimaryButton(
            label: 'Complete order — release payout',
            loading: _busy,
            onPressed: _busy
                ? null
                : () => _do(
                      () => ref.read(stallApiProvider).completeSellerOrder(o.id),
                      done: 'Order completed — payout released',
                    ),
          )
        else if (o.status == 'COMPLETED')
          _doneBanner(context, 'Order completed', c.success)
        else if (o.status == 'CANCELLED')
          _doneBanner(context, 'Order cancelled', c.error),
      ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Text(label,
                style: bold
                    ? context.text.titleMedium
                    : context.text.bodyMedium?.copyWith(color: context.colors.textMed)),
            const Spacer(),
            Text(value, style: bold ? context.text.titleMedium : context.text.bodyMedium),
          ],
        ),
      );

  Widget _doneBanner(BuildContext context, String label, Color tone) => Container(
        padding: const EdgeInsets.all(AppSpace.s16),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Row(
          children: [
            Icon(AppIcons.check_circle_outline, color: tone),
            const SizedBox(width: AppSpace.s8),
            Text(label, style: context.text.titleSmall),
          ],
        ),
      );
}

/// One return request: reason, items, and — while pending — approve/reject.
class _ReturnCard extends ConsumerStatefulWidget {
  const _ReturnCard({required this.orderId, required this.ret});
  final String orderId;
  final ReturnDto ret;

  @override
  ConsumerState<_ReturnCard> createState() => _ReturnCardState();
}

class _ReturnCardState extends ConsumerState<_ReturnCard> {
  bool _busy = false;
  String? _error;

  Future<void> _review(String decision) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref.read(stallApiProvider).reviewReturn(widget.ret.id, decision: decision);
      ref.invalidate(sellerOrderProvider(widget.orderId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            decision == 'APPROVED'
                ? 'Return approved — refunded via ${result.refundMethod ?? 'wallet'}'
                : 'Return rejected',
          ),
        ));
      }
    } on StallApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = widget.ret;
    final pending = r.status == 'REQUESTED';
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s10),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(r.reason, style: context.text.bodyMedium)),
                StatusBadge(r.status, tone: switch (r.status) {
                  'APPROVED' || 'COMPLETED' => BadgeTone.success,
                  'REJECTED' => BadgeTone.danger,
                  _ => BadgeTone.info,
                }),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${r.items.fold<int>(0, (n, i) => n + i.qty)} item(s) requested',
              style: context.text.labelSmall?.copyWith(color: c.textMed),
            ),
            if (pending) ...[
              const SizedBox(height: AppSpace.s10),
              if (_error != null) ...[InlineError(_error!), const SizedBox(height: AppSpace.s8)],
              Row(
                children: [
                  Expanded(
                    child: SecondaryButton(
                      label: 'Reject',
                      onPressed: _busy ? null : () => _review('REJECTED'),
                    ),
                  ),
                  const SizedBox(width: AppSpace.s8),
                  Expanded(
                    child: PrimaryButton(
                      label: 'Approve',
                      loading: _busy,
                      onPressed: _busy ? null : () => _review('APPROVED'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Pickup handoff — the customer reads out a code the seller confirms.
class _PickupCard extends StatelessWidget {
  const _PickupCard({required this.order});
  final SellerOrderDetailDto order;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final code = order.pickupCode;
    final live = order.status == 'READY_FOR_PICKUP' || order.status == 'HANDED_OVER';
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Pickup code', style: context.text.labelMedium?.copyWith(color: c.textMed)),
          const SizedBox(height: AppSpace.s6),
          Row(
            children: [
              Text(
                code == null || code.isEmpty ? '——————' : code,
                style: context.text.headlineMedium?.copyWith(letterSpacing: 3),
              ),
              const Spacer(),
              if (code != null && code.isNotEmpty)
                IconButton(
                  icon: const Icon(AppIcons.copy_outlined, size: 18),
                  tooltip: 'Copy',
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: code));
                    ScaffoldMessenger.of(context)
                        .showSnackBar(const SnackBar(content: Text('Code copied')));
                  },
                ),
            ],
          ),
          const SizedBox(height: AppSpace.s4),
          Text(
            live
                ? 'Ask the shopper for this code before handing over the items.'
                : 'Shown to the shopper once you mark the order ready for pickup.',
            style: context.text.labelSmall?.copyWith(color: c.textLow),
          ),
        ],
      ),
    );
  }
}

/// Delivery handoff — courier identity, live status and the pickup code the
/// courier must quote. Never shows the customer's private contact details.
class _CourierHandoffCard extends ConsumerWidget {
  const _CourierHandoffCard({required this.deliveryId});
  final String deliveryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(sellerHandoffDeliveryProvider(deliveryId));

    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s12),
      child: async.when(
        loading: () => const SizedBox(
          height: 56,
          child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (e, _) => Row(
          children: [
            Icon(AppIcons.info_outline, size: 18, color: c.textMed),
            const SizedBox(width: AppSpace.s8),
            Expanded(child: Text('Courier details unavailable', style: context.text.bodyMedium)),
            TextButton(
              onPressed: () => ref.invalidate(sellerHandoffDeliveryProvider(deliveryId)),
              child: const Text('Retry'),
            ),
          ],
        ),
        data: (d) {
          final courier = d.courier;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(AppIcons.local_shipping_outlined, size: 18, color: c.textMed),
                  const SizedBox(width: AppSpace.s8),
                  Expanded(
                    child: Text(deliveryStatusLabel(d.status), style: context.text.titleSmall),
                  ),
                  Text('#${d.code}', style: context.text.labelSmall?.copyWith(color: c.textLow)),
                ],
              ),
              const SizedBox(height: AppSpace.s10),
              if (courier == null)
                Text('Finding a courier — this usually takes a few minutes.',
                    style: context.text.bodyMedium?.copyWith(color: c.textMed))
              else ...[
                Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: c.primaryContainer,
                      child: Text(
                        courier.name.isEmpty ? '?' : courier.name.characters.first.toUpperCase(),
                        style: context.text.titleSmall?.copyWith(color: c.onPrimaryContainer),
                      ),
                    ),
                    const SizedBox(width: AppSpace.s10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(courier.name, style: context.text.titleSmall),
                          Text(
                            [
                              if (courier.ratingCount > 0)
                                '★ ${courier.ratingAvg.toStringAsFixed(1)}',
                              if (courier.vehicle != null)
                                [courier.vehicle!.type.toLowerCase(), courier.vehicle!.plate]
                                    .where((s) => (s ?? '').isNotEmpty)
                                    .join(' · '),
                            ].join('  ·  '),
                            style: context.text.labelSmall?.copyWith(color: c.textMed),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(AppIcons.chat_bubble_outline, size: 18),
                      tooltip: 'Message courier',
                      onPressed: () async {
                        try {
                          final cid = await ref
                              .read(stallApiProvider)
                              .conversationForDelivery(deliveryId);
                          if (context.mounted) {
                            context.push(RoutePaths.conversation(cid), extra: courier.name);
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context)
                                .showSnackBar(SnackBar(content: Text('$e')));
                          }
                        }
                      },
                    ),
                  ],
                ),
              ],
              if ((d.pickupCode ?? '').isNotEmpty && !d.pickupVerified) ...[
                const SizedBox(height: AppSpace.s12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpace.s12),
                  decoration: BoxDecoration(
                    color: c.primaryContainer,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Give the courier this code',
                          style: context.text.labelSmall?.copyWith(color: c.onPrimaryContainer)),
                      const SizedBox(height: 2),
                      Text(d.pickupCode!,
                          style: context.text.titleLarge?.copyWith(
                            color: c.onPrimaryContainer,
                            letterSpacing: 3,
                          )),
                    ],
                  ),
                ),
              ] else if (d.pickupVerified) ...[
                const SizedBox(height: AppSpace.s8),
                Row(
                  children: [
                    Icon(AppIcons.check_circle, size: 16, color: c.success),
                    const SizedBox(width: AppSpace.s6),
                    Text('Picked up', style: context.text.labelSmall?.copyWith(color: c.textMed)),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

typedef _SellerAction = ({String next, String label, String done});

_SellerAction? _sellerNextAction(String status, String method) {
  final pickup = method == 'PICKUP';
  switch (status) {
    case 'NEW':
      return (next: 'ACCEPTED', label: 'Accept order', done: 'Order accepted');
    case 'ACCEPTED':
      return (next: 'PREPARING', label: 'Start preparing', done: 'Marked as preparing');
    case 'PREPARING':
      return (
        next: 'READY_FOR_PICKUP',
        label: pickup ? 'Mark ready for pickup' : 'Mark ready — request courier',
        done: pickup ? 'Ready for pickup' : 'Courier requested',
      );
    case 'READY_FOR_PICKUP':
      return (
        next: 'HANDED_OVER',
        label: pickup ? 'Customer collected' : 'Handed to courier',
        done: 'Handed over',
      );
    default:
      return null;
  }
}

String _shortDate(String iso) =>
    iso.length >= 16 ? iso.substring(0, 16).replaceFirst('T', ' ') : iso;
