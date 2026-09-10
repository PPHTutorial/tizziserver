import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    final async = ref.watch(paymentMethodsProvider);
    return Scaffold(
      backgroundColor: context.colors.bg,
      appBar: AppBar(title: const Text('Payment methods')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addSheet(context, ref),
        icon: const Icon(AppIcons.add),
        label: const Text('Add method'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(paymentMethodsProvider),
        child: async.when(
          loading: () => const SkeletonList(rows: 3, rowHeight: 72),
          error: (e, _) => AppErrorView(e, onRetry: () => ref.invalidate(paymentMethodsProvider)),
          data: (list) => list.isEmpty
              ? const EmptyState(
                  icon: AppIcons.credit_card,
                  title: 'No payment methods',
                  message: 'Add a card or mobile-money account to check out faster.',
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s16, AppSpace.s16, 96),
                  children: [for (final m in list) _MethodCard(method: m)],
                ),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s12),
      child: AppCard(
        child: Row(
          children: [
            Icon(AppIcons.credit_card, size: 22, color: c.textMed),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(m.label, style: context.text.titleSmall),
                  Text(
                    [m.gateway, if (m.expiry != null) 'exp ${m.expiry}'].join(' · '),
                    style: context.text.labelSmall?.copyWith(color: c.textMed),
                  ),
                ],
              ),
            ),
            if (m.isDefault) const StatusBadge('default', tone: BadgeTone.success),
            IconButton(
              icon: Icon(AppIcons.delete_outline, size: 18, color: c.textLow),
              onPressed: () async {
                final ok = await confirmDialog(context,
                    title: 'Remove ${m.label}?', confirmLabel: 'Remove', destructive: true);
                if (!ok || !context.mounted) return;
                try {
                  await ref.read(stallApiProvider).removePaymentMethod(m.id);
                  ref.invalidate(paymentMethodsProvider);
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
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

  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Add payment method'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValueListenableBuilder<String>(
              valueListenable: brand,
              builder: (context, value, _) => DropdownButtonFormField<String>(
                value: value,
                decoration: const InputDecoration(labelText: 'Type'),
                items: const [
                  DropdownMenuItem(value: 'Visa', child: Text('Visa')),
                  DropdownMenuItem(value: 'Mastercard', child: Text('Mastercard')),
                  DropdownMenuItem(value: 'MTN MoMo', child: Text('MTN MoMo')),
                  DropdownMenuItem(value: 'Vodafone Cash', child: Text('Vodafone Cash')),
                ],
                onChanged: (v) => brand.value = v ?? value,
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Last 4 digits', controller: last4, keyboardType: TextInputType.number),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Expiry (MM/YY)', controller: exp),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: makeDefault,
              onChanged: (v) => setState(() => makeDefault = v ?? false),
              title: const Text('Set as default'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Add')),
        ],
      ),
    ),
  );
  if (ok != true) return;

  final l4 = last4.text.trim();
  final parts = exp.text.trim().split('/');
  final mm = parts.isNotEmpty ? int.tryParse(parts[0].trim()) : null;
  final yy = parts.length > 1 ? int.tryParse(parts[1].trim()) : null;

  try {
    await ref.read(stallApiProvider).addPaymentMethod(
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
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
  }
}
