import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
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
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Checkout'),
            Expanded(
              child: quoteAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t price your order',
                  action: PrimaryButton(
                    label: 'Back to cart',
                    onPressed: () => context.go(RoutePaths.cart),
                  ),
                ),
                data: (quote) => ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpace.s16, 0, AppSpace.s16, AppSpace.s16),
                  children: [
                    _Section(
                      title: 'Fulfilment',
                      child: Column(
                        children: [
                          _SelectRow(
                            icon: AppIcons.local_shipping_outlined,
                            title: 'Deliver to me',
                            selected: _method == 'DELIVERY',
                            onTap: () => setState(() => _method = 'DELIVERY'),
                          ),
                          const SizedBox(height: AppSpace.s8),
                          _SelectRow(
                            icon: AppIcons.storefront_outlined,
                            title: 'Pick up from the seller',
                            selected: _method == 'PICKUP',
                            onTap: () => setState(() => _method = 'PICKUP'),
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
                                    for (final a in list) ...[
                                      _SelectRow(
                                        icon: AppIcons.location_on_outlined,
                                        title: a.recipientName,
                                        subtitle: a.oneLine,
                                        selected: _addressId == a.id,
                                        onTap: () => setState(() => _addressId = a.id),
                                      ),
                                      if (a != list.last) const SizedBox(height: AppSpace.s8),
                                    ],
                                  ],
                                ),
                        ),
                      ),
                    _Section(
                      title: 'Payment',
                      child: Column(
                        children: [
                          walletAsync.maybeWhen(
                            data: (w) => _SelectRow(
                              icon: AppIcons.account_balance_wallet_outlined,
                              title: 'Wallet',
                              subtitle: 'Balance ${formatMoney(w.balanceMinor, w.currency)}',
                              selected: _payment == 'wallet',
                              onTap: () => setState(() => _payment = 'wallet'),
                            ),
                            orElse: () => _SelectRow(
                              icon: AppIcons.account_balance_wallet_outlined,
                              title: 'Wallet',
                              selected: _payment == 'wallet',
                              onTap: () => setState(() => _payment = 'wallet'),
                            ),
                          ),
                          const SizedBox(height: AppSpace.s8),
                          _SelectRow(
                            icon: AppIcons.credit_card,
                            title: 'Card / Mobile Money',
                            subtitle: 'Sandbox gateway',
                            selected: _payment == 'gateway',
                            onTap: () => setState(() => _payment = 'gateway'),
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
                                      style: l.key == 'total'
                                          ? context.text.titleMedium?.copyWith(color: c.primary)
                                          : context.text.bodyMedium),
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
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, style: context.text.titleSmall)),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: AppSpace.s10),
            child,
          ],
        ),
      ),
    );
  }
}

/// A radio-like selectable row used across checkout (fulfilment, address,
/// payment). Matches the app's card row conventions instead of the stock
/// [RadioListTile].
class _SelectRow extends StatelessWidget {
  const _SelectRow({
    required this.icon,
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: selected ? c.primaryContainer : c.surfaceSunken,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12, vertical: AppSpace.s10),
          child: Row(
            children: [
              Icon(icon, size: 18, color: selected ? c.onPrimaryContainer : c.textMed),
              const SizedBox(width: AppSpace.s10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.titleSmall
                            ?.copyWith(color: selected ? c.onPrimaryContainer : c.textHi)),
                    if (subtitle != null)
                      Text(subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.bodySmall?.copyWith(
                              color: selected ? c.onPrimaryContainer.withValues(alpha: 0.8) : c.textMed)),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.s8),
              Icon(
                selected ? AppIcons.check_circle : AppIcons.circle,
                size: 20,
                color: selected ? c.primary : c.border,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
