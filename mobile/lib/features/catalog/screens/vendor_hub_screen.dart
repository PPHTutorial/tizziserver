import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../auth/auth_util.dart';
import '../catalog_providers.dart';

/// §25 (vendor) screens 435–462 subset — the seller hub: onboarding →
/// KYC-pending → product management. Used both as a pushed screen and a
/// HomeShell tab body ([VendorHubBody]).
class VendorHubScreen extends StatelessWidget {
  const VendorHubScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.colors.bg,
        appBar: AppBar(title: const Text('Sell on Stall')),
        body: const VendorHubBody(),
      );
}

class VendorHubBody extends ConsumerWidget {
  const VendorHubBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vendorStatusProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => CenteredState.error(
        title: 'Couldn\'t load your seller account',
        action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(vendorStatusProvider)),
      ),
      data: (status) {
        if (!status.onboarded) return _OnboardingForm(onDone: () => ref.invalidate(vendorStatusProvider));
        if (status.isApproved) return const _SellerDashboard();
        return _KycPending(status: status);
      },
    );
  }
}

class _KycPending extends StatelessWidget {
  const _KycPending({required this.status});
  final VendorStatus status;

  @override
  Widget build(BuildContext context) {
    final rejected = status.kycStatus == 'REJECTED';
    return CenteredState(
      icon: rejected ? Icons.gpp_bad : Icons.hourglass_top,
      title: rejected ? 'Your application needs changes' : 'We\'re reviewing your application',
      body: rejected
          ? (status.note ?? 'Please review your business details and resubmit.')
          : 'This usually takes under a business day. You\'ll be able to list products once approved.',
    );
  }
}

class _OnboardingForm extends ConsumerStatefulWidget {
  const _OnboardingForm({required this.onDone});
  final VoidCallback onDone;

  @override
  ConsumerState<_OnboardingForm> createState() => _OnboardingFormState();
}

class _OnboardingFormState extends ConsumerState<_OnboardingForm> {
  final _display = TextEditingController();
  final _legal = TextEditingController();
  final _reg = TextEditingController();
  final _city = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final ctl in [_display, _legal, _reg, _city]) {
      ctl.dispose();
    }
    super.dispose();
  }

  bool get _valid => _display.text.trim().length >= 2 && _legal.text.trim().length >= 2;

  Future<void> _submit() async {
    if (!_valid) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await runCatching(() async {
      await ref.read(stallApiProvider).vendorOnboard(
        displayName: _display.text.trim(),
        business: {
          'legalName': _legal.text.trim(),
          if (_reg.text.trim().isNotEmpty) 'regNumber': _reg.text.trim(),
          if (_city.text.trim().isNotEmpty) 'city': _city.text.trim(),
          'country': 'GH',
        },
      );
    });
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Text('Set up your store', style: context.text.titleLarge),
        const SizedBox(height: AppSpace.s6),
        Text('We\'ll open a KYC review. Approved stores can list products right away.',
            style: context.text.bodyMedium?.copyWith(color: context.colors.textMed)),
        const SizedBox(height: AppSpace.s20),
        AppField(label: 'Store name', controller: _display, onChanged: (_) => setState(() {})),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'Registered business name', controller: _legal, onChanged: (_) => setState(() {})),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'Business reg. number (optional)', controller: _reg),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'City (optional)', controller: _city),
        InlineError(_error),
        const SizedBox(height: AppSpace.s24),
        PrimaryButton(label: 'Submit for review', loading: _busy, onPressed: _valid ? _submit : null),
      ],
    );
  }
}

class _SellerDashboard extends ConsumerWidget {
  const _SellerDashboard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(myProductsProvider(null));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myProductsProvider(null)),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [
          const SizedBox(height: 120),
          CenteredState.error(
            title: 'Couldn\'t load your products',
            action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(myProductsProvider(null))),
          ),
        ]),
        data: (items) => ListView(
          padding: const EdgeInsets.all(AppSpace.s16),
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Your products (${items.length})', style: context.text.titleMedium),
                FilledButton.icon(
                  onPressed: () => context.push(RoutePaths.newProduct),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.s12),
            if (items.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: AppSpace.s40),
                child: CenteredState(icon: Icons.inventory_2_outlined, title: 'No products yet'),
              ),
            for (final p in items)
              Card(
                elevation: 0,
                color: c.surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  side: BorderSide(color: c.border),
                ),
                child: ListTile(
                  title: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${p.status} · ${formatMoney(p.priceMinor, p.currency)}'),
                  trailing: _StatusChip(status: p.status),
                  onTap: () => context.push(RoutePaths.editProduct(p.id)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg) = switch (status) {
      'PUBLISHED' => (c.successContainer, c.success),
      'DRAFT' => (c.surfaceSunken, c.textMed),
      _ => (c.errorContainer, c.error),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s8, vertical: AppSpace.s4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(status, style: context.text.labelSmall?.copyWith(color: fg)),
    );
  }
}
