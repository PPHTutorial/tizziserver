import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';

/// §19 (344–345) — saved cards / mobile-money methods used at checkout, wallet
/// top-up and ticket purchases.
class PaymentMethodsScreen extends ConsumerWidget {
  const PaymentMethodsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(paymentMethodsProvider);
    final walletAsync = ref.watch(walletProvider);
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Payment Methods'),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async => ref.invalidate(paymentMethodsProvider),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpace.s16,
                    0,
                    AppSpace.s16,
                    AppSpace.s16,
                  ),
                  children: [
                    walletAsync.maybeWhen(
                      data: (w) => Container(
                        padding: const EdgeInsets.all(AppSpace.s20),
                        decoration: BoxDecoration(
                          color: c.primary,
                          borderRadius: BorderRadius.circular(AppRadius.r2xl),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Wallet balance',
                              style: context.text.labelLarge?.copyWith(
                                color: Colors.white70,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              formatMoney(w.balanceMinor, w.currency),
                              style: context.text.displayLarge?.copyWith(
                                color: Colors.white,
                                fontSize: 30,
                              ),
                            ),
                          ],
                        ),
                      ),
                      orElse: () => const SizedBox.shrink(),
                    ),
                    const SizedBox(height: AppSpace.s20),
                    Text(
                      'SAVED ACCOUNTS',
                      style: context.text.labelSmall?.copyWith(
                        color: c.textMed,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: AppSpace.s10),
                    async.when(
                      loading: () => const SkeletonList(rows: 3, rowHeight: 72),
                      error: (e, _) => AppErrorView(
                        e,
                        onRetry: () => ref.invalidate(paymentMethodsProvider),
                      ),
                      data: (list) => list.isEmpty
                          ? const EmptyState(
                              icon: AppIcons.credit_card,
                              title: 'No payment methods',
                              message:
                                  'Add a card or mobile-money account to check out faster.',
                            )
                          : Column(
                              children: [
                                for (final m in list) _MethodCard(method: m),
                              ],
                            ),
                    ),
                    const SizedBox(height: AppSpace.s8),
                    OutlinedButton(
                      onPressed: () => _addSheet(context, ref),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(double.infinity, 52),
                        shape: const StadiumBorder(),
                        side: BorderSide(color: c.primary),
                        foregroundColor: c.primary,
                      ),
                      child: const Text('+ Add New Payment Method'),
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
}

class _MethodCard extends ConsumerWidget {
  const _MethodCard({required this.method});
  final PaymentMethodDto method;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final m = method;
    final isMobileMoney = const {
      'momo',
      'mtn momo',
      'vodafone cash',
      'airteltigo',
    }.contains(m.gateway.toLowerCase()) || m.label.toLowerCase().contains('cash');
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s12),
      child: AppCard(
        child: Row(
          children: [
            Icon(
              isMobileMoney ? AppIcons.smartphone : AppIcons.credit_card,
              size: 22,
              color: c.textMed,
            ),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(m.label, style: context.text.titleSmall),
                  Text(
                    [
                      m.gateway,
                      if (m.expiry != null) 'exp ${m.expiry}',
                    ].join(' · '),
                    style: context.text.labelSmall?.copyWith(color: c.textMed),
                  ),
                ],
              ),
            ),
            if (m.isDefault)
              const StatusBadge('default', tone: BadgeTone.success),
            IconButton(
              icon: Icon(AppIcons.delete_outline, size: 18, color: c.textLow),
              onPressed: () async {
                final ok = await confirmDialog(
                  context,
                  title: 'Remove ${m.label}?',
                  confirmLabel: 'Remove',
                  destructive: true,
                );
                if (!ok || !context.mounted) return;
                try {
                  await ref.read(stallApiProvider).removePaymentMethod(m.id);
                  ref.invalidate(paymentMethodsProvider);
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text('$e')));
                  }
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _addSheet(BuildContext context, WidgetRef ref) async {
  final brand = ValueNotifier<String>('Visa');
  final last4 = TextEditingController();
  final exp = TextEditingController();
  var makeDefault = false;

  final ok = await showAppSheet<bool>(
    context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => Padding(
        padding: EdgeInsets.only(
          left: AppSpace.s20,
          right: AppSpace.s20,
          top: AppSpace.s8,
          bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add payment method', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s16),
            ValueListenableBuilder<String>(
              valueListenable: brand,
              builder: (context, value, _) => DropdownButtonFormField<String>(
                value: value,
                decoration: const InputDecoration(labelText: 'Type'),
                items: const [
                  DropdownMenuItem(value: 'Visa', child: Text('Visa')),
                  DropdownMenuItem(
                    value: 'Mastercard',
                    child: Text('Mastercard'),
                  ),
                  DropdownMenuItem(value: 'MTN MoMo', child: Text('MTN MoMo')),
                  DropdownMenuItem(
                    value: 'Vodafone Cash',
                    child: Text('Vodafone Cash'),
                  ),
                ],
                onChanged: (v) => brand.value = v ?? value,
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            AppField(
              label: 'Last 4 digits',
              hintText: '1234',
              controller: last4,
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: AppSpace.s8),
            AppField(
              label: 'Expiry (MM/YY)',
              hintText: '09/28',
              controller: exp,
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: makeDefault,
              onChanged: (v) => setState(() => makeDefault = v ?? false),
              title: const Text('Set as default'),
            ),
            const SizedBox(height: AppSpace.s8),
            PrimaryButton(
              label: 'Add',
              onPressed: () => Navigator.pop(context, true),
            ),
          ],
        ),
      ),
    ),
  );
  if (ok != true) return;

  final l4 = last4.text.trim();
  final parts = exp.text.trim().split('/');
  final mm = parts.isNotEmpty ? int.tryParse(parts[0].trim()) : null;
  final yy = parts.length > 1 ? int.tryParse(parts[1].trim()) : null;

  try {
    await ref
        .read(stallApiProvider)
        .addPaymentMethod(
          // Real gateways hand back a client-side token; the mock sandbox accepts any.
          gateway: 'mock',
          token: 'tok_${DateTime.now().microsecondsSinceEpoch}',
          brand: brand.value,
          last4: l4.length == 4 ? l4 : null,
          expMonth: mm,
          expYear: yy == null ? null : (yy < 100 ? 2000 + yy : yy),
          makeDefault: makeDefault,
        );
    ref.invalidate(paymentMethodsProvider);
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}
