import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../catalog/widgets/product_card_tile.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screens 81–90 — the cart: multi-vendor groups, quantity, save-for-later,
/// coupon, and the hand-off to checkout.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(cartControllerProvider);

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Cart')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load your cart',
          action: PrimaryButton(label: 'Retry', onPressed: () => ref.read(cartControllerProvider.notifier).refresh()),
        ),
        data: (cart) => cart.isEmpty
            ? CenteredState(
                icon: AppIcons.shopping_cart_outlined,
                title: 'Your cart is empty',
                body: 'Browse the catalogue and add something you like.',
                action: PrimaryButton(label: 'Start shopping', onPressed: () => context.go(RoutePaths.home)),
              )
            : _CartBody(cart: cart),
      ),
    );
  }
}

class _CartBody extends ConsumerWidget {
  const _CartBody({required this.cart});
  final CartDto cart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpace.s16),
            children: [
              for (final g in cart.groups) ...[
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpace.s8),
                  child: Row(
                    children: [
                      Icon(AppIcons.storefront_outlined, size: 18, color: c.textMed),
                      const SizedBox(width: AppSpace.s6),
                      Text(g.vendorName, style: context.text.titleSmall),
                      const Spacer(),
                      Text(formatMoney(g.subtotalMinor, cart.currency),
                          style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                    ],
                  ),
                ),
                for (final it in g.items) _CartLine(item: it, currency: cart.currency),
                const SizedBox(height: AppSpace.s16),
              ],
              if (cart.savedForLater.isNotEmpty) ...[
                Text('Saved for later', style: context.text.titleSmall),
                const SizedBox(height: AppSpace.s8),
                for (final it in cart.savedForLater)
                  _CartLine(item: it, currency: cart.currency, saved: true),
              ],
              const SizedBox(height: AppSpace.s12),
              _CouponRow(cart: cart),
            ],
          ),
        ),
        _CartFooter(cart: cart, onCheckout: () => context.push(RoutePaths.checkout)),
        if (ref.watch(cartControllerProvider).isLoading)
          const LinearProgressIndicator(minHeight: 2),
      ],
    );
  }
}

class _CartLine extends ConsumerWidget {
  const _CartLine({required this.item, required this.currency, this.saved = false});
  final CartItemDto item;
  final String currency;
  final bool saved;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final ctrl = ref.read(cartControllerProvider.notifier);

    return Opacity(
      opacity: item.available ? 1 : 0.5,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpace.s6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ProductThumb(seed: item.offerId, label: item.title, size: 56),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodyLarge),
                  const SizedBox(height: 2),
                  Text(formatMoney(item.unitPriceMinor, currency),
                      style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                  if (item.priceChanged)
                    Text('Now ${formatMoney(item.currentUnitPriceMinor, currency)}',
                        style: context.text.labelSmall?.copyWith(color: c.error)),
                  if (!item.available)
                    Text('No longer available', style: context.text.labelSmall?.copyWith(color: c.error)),
                  const SizedBox(height: AppSpace.s6),
                  Row(
                    children: [
                      if (!saved) ...[
                        _QtyButton(icon: AppIcons.remove, onTap: () => ctrl.setQty(item.id, item.qty - 1)),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12),
                          child: Text('${item.qty}', style: context.text.titleSmall),
                        ),
                        _QtyButton(icon: AppIcons.add, onTap: () => ctrl.setQty(item.id, item.qty + 1)),
                        const SizedBox(width: AppSpace.s8),
                      ],
                      TextButton(
                        onPressed: () => saved ? ctrl.saveForLater(item.id, false) : ctrl.saveForLater(item.id, true),
                        child: Text(saved ? 'Move to cart' : 'Save for later'),
                      ),
                      IconButton(
                        icon: const Icon(AppIcons.delete_outline, size: 20),
                        onPressed: () => ctrl.remove(item.id),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.pill),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(border: Border.all(color: c.border), borderRadius: BorderRadius.circular(AppRadius.pill)),
        child: Icon(icon, size: 16),
      ),
    );
  }
}

class _CouponRow extends ConsumerStatefulWidget {
  const _CouponRow({required this.cart});
  final CartDto cart;

  @override
  ConsumerState<_CouponRow> createState() => _CouponRowState();
}

class _CouponRowState extends ConsumerState<_CouponRow> {
  final _ctl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    setState(() => _error = null);
    try {
      await ref.read(cartControllerProvider.notifier).applyCoupon(_ctl.text.trim());
    } on StallApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final cart = widget.cart;
    if (cart.couponCode != null && cart.couponValid) {
      return Container(
        padding: const EdgeInsets.all(AppSpace.s12),
        decoration: BoxDecoration(
          color: c.successContainer,
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Row(
          children: [
            Icon(AppIcons.local_offer_outlined, size: 18, color: c.success),
            const SizedBox(width: AppSpace.s8),
            Expanded(child: Text('${cart.couponCode} applied', style: context.text.bodyMedium)),
            TextButton(
              onPressed: () => ref.read(cartControllerProvider.notifier).removeCoupon(),
              child: const Text('Remove'),
            ),
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _ctl,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(hintText: 'Coupon code', isDense: true),
              ),
            ),
            const SizedBox(width: AppSpace.s8),
            SecondaryButton(label: 'Apply', onPressed: _apply),
          ],
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 4), child: InlineError(_error!)),
      ],
    );
  }
}

class _CartFooter extends StatelessWidget {
  const _CartFooter({required this.cart, required this.onCheckout});
  final CartDto cart;
  final VoidCallback onCheckout;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final payable = cart.subtotalMinor - (cart.couponValid ? cart.couponDiscountMinor : 0);
    return Container(
      padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s12, AppSpace.s16, AppSpace.s16),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Text('Subtotal', style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                const Spacer(),
                Text(formatMoney(payable, cart.currency), style: context.text.titleMedium),
              ],
            ),
            const SizedBox(height: AppSpace.s4),
            Text('Delivery, service fee & taxes shown at checkout',
                style: context.text.labelSmall?.copyWith(color: c.textLow)),
            const SizedBox(height: AppSpace.s12),
            PrimaryButton(
              label: 'Checkout · ${cart.itemCount} item${cart.itemCount == 1 ? '' : 's'}',
              onPressed: cart.hasUnavailable ? null : onCheckout,
            ),
            if (cart.hasUnavailable)
              Padding(
                padding: const EdgeInsets.only(top: AppSpace.s8),
                child: Text('Remove unavailable items to continue',
                    style: context.text.labelSmall?.copyWith(color: c.error)),
              ),
          ],
        ),
      ),
    );
  }
}
