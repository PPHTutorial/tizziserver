import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screen 103 — order placed.
class OrderConfirmationScreen extends ConsumerWidget {
  const OrderConfirmationScreen({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(AppIcons.check_circle, size: 72, color: c.success),
              const SizedBox(height: AppSpace.s16),
              Text('Order placed', textAlign: TextAlign.center, style: context.text.headlineMedium),
              const SizedBox(height: AppSpace.s8),
              async.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (o) => Text(
                  '${o.number} · ${formatMoney(o.totalMinor, o.currency)} · ${o.vendorOrders.length} seller${o.vendorOrders.length == 1 ? '' : 's'}',
                  textAlign: TextAlign.center,
                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                ),
              ),
              const SizedBox(height: AppSpace.s32),
              PrimaryButton(label: 'View order', onPressed: () => context.go(RoutePaths.order(orderId))),
              const SizedBox(height: AppSpace.s12),
              SecondaryButton(label: 'Continue shopping', onPressed: () => context.go(RoutePaths.home)),
            ],
          ),
        ),
      ),
    );
  }
}
