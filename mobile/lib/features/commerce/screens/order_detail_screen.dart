import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/responsive.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../catalog/widgets/product_card_tile.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screens 114–123 — order detail: per-vendor sub-orders, timeline, fee
/// breakdown, cancel.
class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Order'),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load this order',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () =>
                        ref.invalidate(orderDetailProvider(orderId)),
                  ),
                ),
                data: (o) => MaxWidth(
                  child: ListView(
                    padding: const EdgeInsets.all(AppSpace.s16),
                    children: [
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    o.number,
                                    style: context.text.titleLarge,
                                  ),
                                ),
                                _pill(context, o.status),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${o.fulfilmentMethod == 'PICKUP' ? 'Pickup' : 'Delivery'} · paid by ${o.paymentMethod ?? '—'}',
                              style: context.text.bodyMedium?.copyWith(
                                color: c.textMed,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpace.s16),

                      for (final vo in o.vendorOrders)
                        _VendorBlock(
                          vo: vo,
                          currency: o.currency,
                          orderId: o.id,
                        ),

                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Payment', style: context.text.titleMedium),
                            const SizedBox(height: AppSpace.s8),
                            _row(
                              context,
                              'Items',
                              formatMoney(o.itemsSubtotalMinor, o.currency),
                            ),
                            if (o.discountMinor > 0)
                              _row(
                                context,
                                'Discount',
                                '-${formatMoney(o.discountMinor, o.currency)}',
                              ),
                            _row(
                              context,
                              o.fulfilmentMethod == 'PICKUP'
                                  ? 'Pickup'
                                  : 'Delivery',
                              formatMoney(o.deliveryFeeMinor, o.currency),
                            ),
                            _row(
                              context,
                              'Service fee',
                              formatMoney(o.serviceFeeMinor, o.currency),
                            ),
                            if (o.taxMinor > 0)
                              _row(
                                context,
                                'Tax',
                                formatMoney(o.taxMinor, o.currency),
                              ),
                            Divider(
                              height: AppSpace.s24,
                              color: c.border.withValues(alpha: 0.6),
                            ),
                            _row(
                              context,
                              'Total',
                              formatMoney(o.totalMinor, o.currency),
                              bold: true,
                            ),
                            if (o.invoiceNumber != null) ...[
                              const SizedBox(height: AppSpace.s12),
                              _InvoiceButton(
                                orderId: o.id,
                                invoiceNumber: o.invoiceNumber!,
                              ),
                            ],
                          ],
                        ),
                      ),

                      const SizedBox(height: AppSpace.s16),
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Timeline', style: context.text.titleMedium),
                            const SizedBox(height: AppSpace.s12),
                            for (var i = 0; i < o.events.length; i++)
                              _TimelineRow(
                                label: o.events[i].type
                                    .replaceAll('_', ' ')
                                    .toLowerCase(),
                                at: _short(o.events[i].at),
                                isLast: i == o.events.length - 1,
                              ),
                          ],
                        ),
                      ),

                      const SizedBox(height: AppSpace.s20),
                      // Mirrors the backend's real guard (cancelOrder in
                      // orders.ts) so the button doesn't show for a state
                      // it would just be rejected in — e.g. once a vendor's
                      // leg has already started preparing/shipped, even if
                      // the *order* as a whole hasn't reached FULFILLED yet.
                      if ((o.status == 'PLACED' || o.status == 'CONFIRMED') &&
                          o.vendorOrders.every(
                            (vo) =>
                                vo.status == 'NEW' || vo.status == 'ACCEPTED',
                          ))
                        _CancelButton(orderId: o.id),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _short(String iso) =>
      iso.length >= 16 ? iso.substring(0, 16).replaceFirst('T', ' ') : iso;

  Widget _row(
    BuildContext context,
    String label,
    String value, {
    bool bold = false,
  }) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        Text(
          label,
          style: bold
              ? context.text.titleMedium
              : context.text.bodyMedium?.copyWith(
                  color: context.colors.textMed,
                ),
        ),
        const Spacer(),
        Text(
          value,
          style: bold ? context.text.titleMedium : context.text.bodyMedium,
        ),
      ],
    ),
  );

  Widget _pill(BuildContext context, String status) =>
      StatusBadge(status, tone: _orderStatusTone(status));
}

/// Shared tone mapping for order-lifecycle statuses — kept identical to
/// `_StatusPill` in orders_screen.dart so the two screens read consistently.
BadgeTone _orderStatusTone(String status) => switch (status) {
  'FULFILLED' => BadgeTone.success,
  'CANCELLED' || 'REFUNDED' => BadgeTone.danger,
  'PENDING_PAYMENT' => BadgeTone.neutral,
  _ => BadgeTone.info,
};

/// One entry in the order-events timeline: a dot connected to the next entry
/// by a vertical line, matching the stepper visual language used on the
/// delivery-tracking screen.
class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.label,
    required this.at,
    required this.isLast,
  });

  final String label;
  final String at;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(top: 5),
                decoration: BoxDecoration(
                  color: c.primary,
                  shape: BoxShape.circle,
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 1.5,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    color: c.border,
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.s16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(label, style: context.text.bodyMedium),
                  ),
                  Text(
                    at,
                    style: context.text.labelSmall?.copyWith(
                      color: c.textLow,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VendorBlock extends ConsumerWidget {
  const _VendorBlock({
    required this.vo,
    required this.currency,
    required this.orderId,
  });
  final VendorOrderDto vo;
  final String currency;
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpace.s16),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(AppIcons.storefront_outlined, size: 18, color: c.textMed),
                const SizedBox(width: AppSpace.s6),
                Expanded(
                  child: Text(vo.vendorName, style: context.text.titleSmall),
                ),
                Text(
                  vo.status.replaceAll('_', ' ').toLowerCase(),
                  style: context.text.labelSmall?.copyWith(color: c.textMed),
                ),
              ],
            ),
            if (vo.pickupCode != null) ...[
              const SizedBox(height: 4),
              Text(
                'Pickup code: ${vo.pickupCode}',
                style: context.text.labelSmall?.copyWith(color: c.primary),
              ),
            ],
            const SizedBox(height: AppSpace.s8),
            for (final it in vo.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    ProductThumb(seed: it.title, label: it.title, size: 40),
                    const SizedBox(width: AppSpace.s8),
                    Expanded(
                      child: Text(
                        '${it.qty}× ${it.title}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      formatMoney(it.totalMinor, currency),
                      style: context.text.bodyMedium,
                    ),
                  ],
                ),
              ),
            Row(
              children: [
                if (vo.deliveryId != null)
                  OutlinedButton.icon(
                    icon: const Icon(
                      AppIcons.local_shipping_outlined,
                      size: 18,
                    ),
                    label: const Text('Track'),
                    onPressed: () =>
                        context.push(RoutePaths.delivery(vo.deliveryId!)),
                  ),
                const SizedBox(width: AppSpace.s8),
                OutlinedButton.icon(
                  icon: const Icon(AppIcons.chat_bubble_outline, size: 18),
                  label: const Text('Message seller'),
                  onPressed: () async {
                    try {
                      final cid = await ref
                          .read(stallApiProvider)
                          .conversationForOrder(orderId);
                      if (context.mounted) {
                        context.push(
                          RoutePaths.conversation(cid),
                          extra: vo.vendorName,
                        );
                      }
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(
                          context,
                        ).showSnackBar(SnackBar(content: Text('$e')));
                      }
                    }
                  },
                ),
                if (vo.status == 'COMPLETED') ...[
                  const SizedBox(width: AppSpace.s8),
                  OutlinedButton.icon(
                    icon: const Icon(AppIcons.replay, size: 18),
                    label: const Text('Return'),
                    onPressed: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      showDragHandle: true,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
                      ),
                      builder: (_) =>
                          _ReturnRequestSheet(orderId: orderId, vo: vo),
                    ),
                  ),
                ],
              ],
            ),
            if (vo.returns.isNotEmpty) ...[
              const SizedBox(height: AppSpace.s10),
              for (final r in vo.returns)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Icon(AppIcons.replay, size: 14, color: c.textLow),
                      const SizedBox(width: AppSpace.s6),
                      Expanded(
                        child: Text(
                          'Return · ${r.reason}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.labelSmall?.copyWith(
                            color: c.textMed,
                          ),
                        ),
                      ),
                      StatusBadge(r.status, tone: _returnStatusTone(r.status)),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

BadgeTone _returnStatusTone(String status) => switch (status) {
  'APPROVED' || 'COMPLETED' => BadgeTone.success,
  'REJECTED' => BadgeTone.danger,
  _ => BadgeTone.info,
};

/// Pick items + quantities to return, with a reason.
class _ReturnRequestSheet extends ConsumerStatefulWidget {
  const _ReturnRequestSheet({required this.orderId, required this.vo});
  final String orderId;
  final VendorOrderDto vo;

  @override
  ConsumerState<_ReturnRequestSheet> createState() =>
      _ReturnRequestSheetState();
}

class _ReturnRequestSheetState extends ConsumerState<_ReturnRequestSheet> {
  late final Map<String, int> _qty = {
    for (final it in widget.vo.items)
      if (it.id != null) it.id!: 0,
  };
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  int _returned(String orderItemId) => widget.vo.returns
      .where((r) => r.status != 'REJECTED')
      .fold(
        0,
        (n, r) =>
            n +
            r.items
                .where((i) => i.orderItemId == orderItemId)
                .fold(0, (m, i) => m + i.qty),
      );

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final items = _qty.entries
        .where((e) => e.value > 0)
        .map((e) => (orderItemId: e.key, qty: e.value))
        .toList();
    if (items.isEmpty || _reason.text.trim().length < 3) {
      setState(() => _error = 'Pick at least one item and describe why.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(stallApiProvider)
          .requestReturn(
            widget.orderId,
            widget.vo.id,
            reason: _reason.text.trim(),
            items: items,
          );
      ref.invalidate(orderDetailProvider(widget.orderId));
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Return requested — the seller will review it'),
          ),
        );
      }
    } on StallApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16,
        top: AppSpace.s16,
        left: AppSpace.s16,
        right: AppSpace.s16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Request a return', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s16),
            for (final it in widget.vo.items)
              if (it.id != null)
                Builder(
                  builder: (_) {
                    final remaining = it.qty - _returned(it.id!);
                    final qty = _qty[it.id!] ?? 0;
                    return Padding(
                      padding: const EdgeInsets.symmetric(
                        vertical: AppSpace.s6,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              it.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: remaining <= 0
                                  ? context.text.bodyMedium?.copyWith(
                                      color: c.textLow,
                                    )
                                  : context.text.bodyMedium,
                            ),
                          ),
                          if (remaining <= 0)
                            Text(
                              'fully returned',
                              style: context.text.labelSmall?.copyWith(
                                color: c.textLow,
                              ),
                            )
                          else ...[
                            IconButton(
                              icon: const Icon(AppIcons.remove, size: 20),
                              onPressed: qty > 0
                                  ? () => setState(() => _qty[it.id!] = qty - 1)
                                  : null,
                            ),
                            Text('$qty', style: context.text.titleSmall),
                            IconButton(
                              icon: const Icon(AppIcons.add, size: 20),
                              onPressed: qty < remaining
                                  ? () => setState(() => _qty[it.id!] = qty + 1)
                                  : null,
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
            const SizedBox(height: AppSpace.s8),
            TextField(
              controller: _reason,
              maxLength: 500,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Reason for return',
                hintText: 'Tell us what went wrong',
              ),
            ),
            if (_error != null) ...[
              InlineError(_error!),
              const SizedBox(height: AppSpace.s8),
            ],
            PrimaryButton(
              label: _busy ? 'Submitting…' : 'Submit return',
              loading: _busy,
              onPressed: _busy ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _CancelButton extends ConsumerStatefulWidget {
  const _CancelButton({required this.orderId});
  final String orderId;

  @override
  ConsumerState<_CancelButton> createState() => _CancelButtonState();
}

class _CancelButtonState extends ConsumerState<_CancelButton> {
  bool _busy = false;
  String? _error;

  Future<void> _cancel() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(stallApiProvider).cancelOrder(widget.orderId);
      ref.invalidate(orderDetailProvider(widget.orderId));
      ref.invalidate(ordersProvider);
      ref.invalidate(walletProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Order cancelled — refunded to your wallet'),
          ),
        );
      }
    } on StallApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SecondaryButton(
          label: _busy ? 'Cancelling…' : 'Cancel order',
          onPressed: _busy ? null : _cancel,
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: InlineError(_error!),
          ),
      ],
    );
  }
}

/// Downloads the invoice PDF and hands it to the OS share sheet — the
/// simplest cross-platform way to let the shopper save or open it, without
/// this app needing its own PDF viewer.
class _InvoiceButton extends ConsumerStatefulWidget {
  const _InvoiceButton({required this.orderId, required this.invoiceNumber});
  final String orderId;
  final String invoiceNumber;

  @override
  ConsumerState<_InvoiceButton> createState() => _InvoiceButtonState();
}

class _InvoiceButtonState extends ConsumerState<_InvoiceButton> {
  bool _busy = false;
  String? _error;

  Future<void> _download() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final bytes = await ref
          .read(stallApiProvider)
          .orderInvoiceBytes(widget.orderId);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${widget.invoiceNumber}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path, mimeType: 'application/pdf')]),
      );
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          icon: const Icon(AppIcons.receipt_outlined, size: 18),
          label: Text(_busy ? 'Preparing invoice…' : 'Download invoice'),
          onPressed: _busy ? null : _download,
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: InlineError(_error!),
          ),
      ],
    );
  }
}
