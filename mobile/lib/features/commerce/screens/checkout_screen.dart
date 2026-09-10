import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';

/// Screens 91–103 — checkout: fulfilment method → address → payment → review →
/// place. The quote is re-fetched server-side whenever an input changes.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String _method = 'DELIVERY';
  String _payment = 'wallet';
  String? _addressId;
  bool _placing = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final quoteAsync = ref.watch(checkoutQuoteProvider((method: _method, coupon: null)));
    final addressesAsync = ref.watch(addressesProvider);
    final walletAsync = ref.watch(walletProvider);

    // default to the default address once loaded
    addressesAsync.whenData((list) {
      if (_addressId == null && list.isNotEmpty) {
        _addressId = (list.firstWhere((a) => a.isDefault, orElse: () => list.first)).id;
      }
    });

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Checkout')),
      body: quoteAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t price your order',
          action: PrimaryButton(
            label: 'Back to cart',
            onPressed: () => context.go(RoutePaths.cart),
          ),
        ),
        data: (quote) => ListView(
          padding: const EdgeInsets.all(AppSpace.s16),
          children: [
            _Section(
              title: 'Fulfilment',
              child: Column(
                children: [
                  RadioListTile<String>(
                    value: 'DELIVERY',
                    groupValue: _method,
                    onChanged: (v) => setState(() => _method = v!),
                    title: const Text('Deliver to me'),
                    contentPadding: EdgeInsets.zero,
                  ),
                  RadioListTile<String>(
                    value: 'PICKUP',
                    groupValue: _method,
                    onChanged: (v) => setState(() => _method = v!),
                    title: const Text('Pick up from the seller'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
            if (_method != 'PICKUP')
              _Section(
                title: 'Delivery address',
                trailing: TextButton(
                  onPressed: () => context.push(RoutePaths.addresses),
                  child: const Text('Manage'),
                ),
                child: addressesAsync.when(
                  loading: () => const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator()),
                  error: (e, _) => const Text('Couldn\'t load addresses'),
                  data: (list) => list.isEmpty
                      ? Align(
                          alignment: Alignment.centerLeft,
                          child: SecondaryButton(
                            label: 'Add an address',
                            onPressed: () => context.push(RoutePaths.addresses),
                          ),
                        )
                      : Column(
                          children: [
                            for (final a in list)
                              RadioListTile<String>(
                                value: a.id,
                                groupValue: _addressId,
                                onChanged: (v) => setState(() => _addressId = v),
                                title: Text(a.recipientName),
                                subtitle: Text(a.oneLine, maxLines: 2, overflow: TextOverflow.ellipsis),
                                contentPadding: EdgeInsets.zero,
                              ),
                          ],
                        ),
                ),
              ),
            _Section(
              title: 'Payment',
              child: Column(
                children: [
                  walletAsync.maybeWhen(
                    data: (w) => RadioListTile<String>(
                      value: 'wallet',
                      groupValue: _payment,
                      onChanged: (v) => setState(() => _payment = v!),
                      title: const Text('Wallet'),
                      subtitle: Text('Balance ${formatMoney(w.balanceMinor, w.currency)}'),
                      contentPadding: EdgeInsets.zero,
                    ),
                    orElse: () => RadioListTile<String>(
                      value: 'wallet',
                      groupValue: _payment,
                      onChanged: (v) => setState(() => _payment = v!),
                      title: const Text('Wallet'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                  RadioListTile<String>(
                    value: 'gateway',
                    groupValue: _payment,
                    onChanged: (v) => setState(() => _payment = v!),
                    title: const Text('Card / Mobile Money'),
                    subtitle: const Text('Sandbox gateway'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
            _Section(
              title: 'Summary',
              child: Column(
                children: [
                  for (final l in quote.lines)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          Text(l.label,
                              style: l.key == 'total'
                                  ? context.text.titleMedium
                                  : context.text.bodyMedium?.copyWith(color: c.textMed)),
                          const Spacer(),
                          Text(formatMoney(l.amountMinor, quote.currency),
                              style: l.key == 'total' ? context.text.titleMedium : context.text.bodyMedium),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: InlineError(_error!)),
            const SizedBox(height: AppSpace.s16),
            PrimaryButton(
              label: 'Pay ${formatMoney(quote.totalMinor, quote.currency)}',
              loading: _placing,
              onPressed: _placing ? null : () => _place(quote),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _place(CheckoutQuoteDto quote) async {
    if (_method != 'PICKUP' && _addressId == null) {
      setState(() => _error = 'Choose a delivery address');
      return;
    }
    setState(() {
      _placing = true;
      _error = null;
    });
    try {
      final api = ref.read(stallApiProvider);
      final order = await api.placeOrder(
        paymentMethod: _payment,
        gateway: _payment == 'gateway' ? 'mock' : null,
        addressId: _method == 'PICKUP' ? null : _addressId,
        fulfilmentMethod: _method,
        idempotencyKey: 'chk-${DateTime.now().microsecondsSinceEpoch}',
      );
      await ref.read(cartControllerProvider.notifier).refresh();
      ref.invalidate(walletProvider);
      ref.invalidate(ordersProvider);
      if (mounted) context.go('${RoutePaths.orderConfirmation}?id=${order.id}');
    } on StallApiException catch (e) {
      setState(() {
        _placing = false;
        _error = e.message;
      });
    }
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(title, style: context.text.titleSmall),
              const Spacer(),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: AppSpace.s4),
          child,
        ],
      ),
    );
  }
}
