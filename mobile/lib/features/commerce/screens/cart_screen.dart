import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/router.dart';
import '../../../core/api_config.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screens 81–90 — the cart: multi-vendor groups, quantity, save-for-later,
/// coupon, and the hand-off to checkout.
class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.colors.bg,
        body: SafeArea(
          child: Column(
            children: [
              AppScreenHeader('My cart', trailing: const _ClearCartAction()),
              const Expanded(child: CartBody()),
            ],
          ),
        ),
      );
}

/// The header's "Clear All" — real, not decorative: `clearCart()` already
/// existed on the cart controller/API but had no button wired to it anywhere.
class _ClearCartAction extends ConsumerWidget {
  const _ClearCartAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartControllerProvider).valueOrNull;
    if (cart == null || cart.isEmpty) return const SizedBox.shrink();
    return TextButton(
      onPressed: () async {
        final ok = await confirmDialog(
          context,
          icon: AppIcons.delete_outline,
          title: 'Clear your cart?',
          message: 'This removes every item from your cart.',
          confirmLabel: 'Clear all',
          cancelLabel: 'Keep items',
          destructive: true,
        );
        if (ok) await ref.read(cartControllerProvider.notifier).clear();
      },
      child: Text(
        'Clear All',
        style: context.text.labelLarge?.copyWith(color: context.colors.primary),
      ),
    );
  }
}

/// Scaffold-less cart — used directly as the shell's "Cart" tab body and
/// wrapped by [CartScreen] for the pushed `/cart` route.
class CartBody extends ConsumerWidget {
  const CartBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(cartControllerProvider);
    return async.when(
      loading: () => const SkeletonList(rows: 3, rowHeight: 96),
      error: (e, _) => ListView(children: [
        AppErrorView(e, onRetry: () => ref.read(cartControllerProvider.notifier).refresh()),
      ]),
      data: (cart) => cart.isEmpty
          ? ListView(children: [
              const SizedBox(height: 80),
              EmptyState(
                icon: AppIcons.shopping_cart_outlined,
                title: 'Your cart is empty',
                message: 'Browse the catalogue and add something you like.',
                action: PrimaryButton(label: 'Start shopping', onPressed: () => context.go(RoutePaths.home)),
              ),
            ])
          : _CartBody(cart: cart),
    );
  }
}

class _CartBody extends ConsumerWidget {
  const _CartBody({required this.cart});
  final CartDto cart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final multi = cart.groups.length > 1;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s4, AppSpace.s16, AppSpace.s16),
            children: [
              for (final g in cart.groups) ...[
                if (multi)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpace.s8, bottom: AppSpace.s8, left: AppSpace.s4),
                    child: Row(
                      children: [
                        Icon(AppIcons.storefront_outlined, size: 15, color: c.textMed),
                        const SizedBox(width: AppSpace.s6),
                        Expanded(
                          child: Text(g.vendorName,
                              style: context.text.titleSmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                  ),
                for (final it in g.items) ...[
                  _CartLine(item: it, currency: cart.currency),
                  const SizedBox(height: AppSpace.s12),
                ],
              ],
              if (cart.savedForLater.isNotEmpty) ...[
                const SizedBox(height: AppSpace.s4),
                Text('Saved for later', style: context.text.titleSmall),
                const SizedBox(height: AppSpace.s8),
                for (final it in cart.savedForLater) ...[
                  _CartLine(item: it, currency: cart.currency, saved: true),
                  const SizedBox(height: AppSpace.s12),
                ],
              ],
              _CouponRow(cart: cart),
              const SizedBox(height: AppSpace.s12),
              _OrderSummary(cart: cart),
            ],
          ),
        ),
        _CartFooter(cart: cart, onCheckout: () => context.push(RoutePaths.checkout)),
        if (ref.watch(cartControllerProvider).isLoading) const LinearProgressIndicator(minHeight: 2),
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

    return AppCard(
      elevated: !saved,
      child: Opacity(
        opacity: item.available ? 1 : 0.5,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.md),
              child: Container(
                width: 64,
                height: 64,
                color: c.surfaceSunken,
                child: Image.network(
                  mediaUrl(item.image ?? 'seed/${item.offerId}'),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Icon(AppIcons.shopping_bag_outlined, size: 20, color: c.textLow),
                ),
              ),
            ),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                  const SizedBox(height: 3),
                  Text(formatMoney(item.currentUnitPriceMinor, currency),
                      style: context.text.titleMedium?.copyWith(color: c.primary)),
                  if (item.priceChanged)
                    Text('was ${formatMoney(item.unitPriceMinor, currency)}',
                        style: context.text.labelSmall
                            ?.copyWith(color: c.textLow, decoration: TextDecoration.lineThrough)),
                  if (!item.available)
                    Text('No longer available', style: context.text.labelSmall?.copyWith(color: c.error)),
                  const SizedBox(height: AppSpace.s8),
                  Row(
                    children: [
                      if (!saved)
                        AppQtyStepper(
                          value: item.qty,
                          onChanged: (v) => ctrl.setQty(item.id, v),
                        )
                      else
                        TextButton(
                          onPressed: () => ctrl.saveForLater(item.id, false),
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
                          child: const Text('Move to cart'),
                        ),
                      const Spacer(),
                      if (!saved)
                        TextButton(
                          onPressed: () => ctrl.saveForLater(item.id, true),
                          style: TextButton.styleFrom(
                            padding: EdgeInsets.zero,
                            minimumSize: const Size(0, 32),
                            foregroundColor: c.textMed,
                          ),
                          child: const Text('Save'),
                        ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: Icon(AppIcons.delete_outline, size: 18, color: c.textMed),
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
        padding: const EdgeInsets.all(AppSpace.s14),
        decoration: BoxDecoration(
          color: c.successContainer,
          borderRadius: BorderRadius.circular(AppRadius.r2xl),
        ),
        child: Row(
          children: [
            Icon(AppIcons.local_offer_outlined, size: 16, color: c.success),
            const SizedBox(width: AppSpace.s8),
            Expanded(
              child: Text('${cart.couponCode} applied',
                  style: context.text.titleSmall?.copyWith(color: c.success)),
            ),
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
                decoration: InputDecoration(
                  hintText: 'Coupon code',
                  isDense: true,
                  filled: true,
                  fillColor: c.surface,
                  prefixIcon: Icon(AppIcons.local_offer_outlined, size: 16, color: c.textLow),
                  contentPadding: const EdgeInsets.symmetric(horizontal: AppSpace.s12, vertical: AppSpace.s16),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.xl),
                    borderSide: BorderSide(color: c.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.xl),
                    borderSide: BorderSide(color: c.primary, width: 1.5),
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppSpace.s8),
            SizedBox(
              height: 52,
              child: FilledButton(
                onPressed: _apply,
                style: FilledButton.styleFrom(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.s24),
                ),
                child: const Text('Apply'),
              ),
            ),
          ],
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 4), child: InlineError(_error!)),
      ],
    );
  }
}

class _OrderSummary extends StatelessWidget {
  const _OrderSummary({required this.cart});
  final CartDto cart;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final discount = cart.couponValid ? cart.couponDiscountMinor : 0;
    final payable = cart.subtotalMinor - discount;

    Widget row(String label, String value, {Color? valueColor}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpace.s6),
          child: Row(
            children: [
              Text(label, style: context.text.bodyMedium?.copyWith(color: c.textMed)),
              const Spacer(),
              Text(value, style: context.text.bodyLarge?.copyWith(color: valueColor ?? c.textHi)),
            ],
          ),
        );

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Order summary', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s4),
          row('Subtotal', formatMoney(cart.subtotalMinor, cart.currency)),
          row('Delivery fee', cart.freeDelivery ? 'Free' : 'Calculated at checkout',
              valueColor: cart.freeDelivery ? c.success : null),
          if (discount > 0)
            row('Discount', '-${formatMoney(discount, cart.currency)}', valueColor: c.success),
          Divider(height: AppSpace.s20, color: c.border.withValues(alpha: 0.6)),
          Row(
            children: [
              Text('Total', style: context.text.titleMedium),
              const Spacer(),
              Text(formatMoney(payable, cart.currency),
                  style: context.text.titleLarge?.copyWith(color: c.primary)),
            ],
          ),
        ],
      ),
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
    return Container(
      padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s12, AppSpace.s16, AppSpace.s12),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.6))),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            PrimaryButton(
              label: 'Proceed to checkout',
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
