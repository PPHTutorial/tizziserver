import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart' show CouponDto;
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screens 357–368 — coupon centre: what's available on this tenant. Applying
/// happens in the cart.
class CouponsScreen extends ConsumerWidget {
  const CouponsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(couponsProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Coupons'),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load coupons',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(couponsProvider),
                  ),
                ),
                data: (list) => list.isEmpty
                    ? const CenteredState(
                        icon: AppIcons.local_offer_outlined,
                        title: 'No coupons right now',
                        body: 'Check back later for deals.',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppSpace.s16),
                        itemCount: list.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpace.s12),
                        itemBuilder: (context, i) => _CouponCard(coupon: list[i]),
                      ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s16),
          child: SecondaryButton(
            label: 'Go to cart',
            onPressed: () => context.push(RoutePaths.cart),
          ),
        ),
      ),
    );
  }
}

class _CouponCard extends ConsumerWidget {
  const _CouponCard({required this.coupon});
  final CouponDto coupon;

  String? get _expiryText {
    final ends = coupon.endsAt;
    if (ends == null) return null;
    final d = DateTime.tryParse(ends);
    if (d == null) return null;
    final days = d.difference(DateTime.now()).inDays;
    if (days < 0) return 'Expired';
    if (days == 0) return 'Expires today';
    return 'Expires in $days day${days == 1 ? '' : 's'}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final expiry = _expiryText;
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s16),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.s12,
              vertical: AppSpace.s8,
            ),
            decoration: BoxDecoration(
              color: c.primaryContainer,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Text(
              coupon.code,
              style: context.text.titleSmall?.copyWith(
                color: c.onPrimaryContainer,
              ),
            ),
          ),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(coupon.blurb, style: context.text.titleSmall),
                Text(
                  [
                    if (coupon.minSpendMinor != null)
                      'Min spend ${formatMoney(coupon.minSpendMinor, 'GHS')}',
                    if (expiry != null) expiry,
                  ].join(' · '),
                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s8),
          TextButton(
            onPressed: () async {
              try {
                await ref
                    .read(cartControllerProvider.notifier)
                    .applyCoupon(coupon.code);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('${coupon.code} applied to your cart')),
                  );
                  context.push(RoutePaths.cart);
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text('$e')));
                }
              }
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
  }
}
