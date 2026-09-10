import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/ads_models.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../ads_providers.dart';
import '../../../design/icons.dart';

class AdvertisingCenterScreen extends ConsumerWidget {
  const AdvertisingCenterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final campaigns = ref.watch(campaignsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Advertising')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          builder: (_) => const _CreateCampaignSheet(),
        ),
        icon: const Icon(AppIcons.add),
        label: const Text('New campaign'),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(campaignsProvider);
            await ref.read(campaignsProvider.future);
          },
          child: campaigns.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('$e')),
            data: (list) {
              if (list.isEmpty) {
                return ListView(children: [
                  const SizedBox(height: 120),
                  Icon(AppIcons.campaign_outlined, size: 48, color: c.textLow),
                  const SizedBox(height: AppSpace.s8),
                  Center(child: Text('No campaigns yet', style: context.text.bodyMedium)),
                  const SizedBox(height: 4),
                  Center(child: Text('Boost a product to the top of search and the home feed.', style: context.text.bodySmall?.copyWith(color: c.textMed))),
                ]);
              }
              return ListView.separated(
                padding: const EdgeInsets.all(AppSpace.s16),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s8),
                itemBuilder: (_, i) => _CampaignCard(c: list[i]),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _CampaignCard extends StatelessWidget {
  const _CampaignCard({required this.c});
  final CampaignDto c;

  @override
  Widget build(BuildContext context) {
    final col = context.colors;
    final tone = switch (c.status) {
      'ACTIVE' => BadgeTone.success,
      'PENDING_REVIEW' || 'SCHEDULED' => BadgeTone.warning,
      'REJECTED' => BadgeTone.danger,
      _ => BadgeTone.neutral,
    };
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s16),
      onTap: () => context.push(RoutePaths.campaign(c.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(c.name, style: context.text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis)),
              StatusBadge(c.status, tone: tone),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: LinearProgressIndicator(value: c.spentPct, minHeight: 6, backgroundColor: col.border, color: col.primary),
          ),
          const SizedBox(height: 6),
          Text('${formatMoney(c.spentMinor, 'GHS')} of ${formatMoney(c.budgetMinor, 'GHS')} spent'
              '${c.tierName != null ? ' · ${c.tierName}' : ''}',
              style: context.text.bodySmall?.copyWith(color: col.textMed)),
          if (c.rejectionReason != null) ...[
            const SizedBox(height: 4),
            Text(c.rejectionReason!, style: context.text.bodySmall?.copyWith(color: col.error)),
          ],
        ],
      ),
    );
  }
}

class _CreateCampaignSheet extends ConsumerStatefulWidget {
  const _CreateCampaignSheet();
  @override
  ConsumerState<_CreateCampaignSheet> createState() => _CreateCampaignSheetState();
}

class _CreateCampaignSheetState extends ConsumerState<_CreateCampaignSheet> {
  final _name = TextEditingController(text: 'My promotion');
  double _budget = 100; // GHS major
  String? _tierKey;
  final _productIds = <String>{};
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(stallApiProvider);
      final camp = await api.createCampaign(
        name: _name.text.trim(),
        boostTierKey: _tierKey,
        budgetMinor: (_budget * 100).round(),
        productIds: _productIds.toList(),
      );
      ref.invalidate(campaignsProvider);
      if (mounted) {
        Navigator.of(context).pop();
        context.push(RoutePaths.campaign(camp.id));
      }
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tiers = ref.watch(boostTiersProvider);
    final products = ref.watch(myProductsProvider);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16, top: AppSpace.s16, left: AppSpace.s16, right: AppSpace.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('New campaign', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s16),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Campaign name')),
            const SizedBox(height: AppSpace.s16),
            Text('Daily budget cap: GHS ${_budget.round()}', style: context.text.bodyMedium),
            Slider(value: _budget, min: 50, max: 2000, divisions: 39, label: 'GHS ${_budget.round()}', onChanged: (v) => setState(() => _budget = v)),
            const SizedBox(height: AppSpace.s8),
            Text('Tier', style: context.text.labelLarge),
            const SizedBox(height: 6),
            tiers.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e', style: TextStyle(color: c.error)),
              data: (list) => Wrap(
                spacing: 8,
                children: list
                    .map((t) => ChoiceChip(
                          label: Text('${t.name} · ${formatMoney(t.priceMinor, 'GHS')}'),
                          selected: _tierKey == t.key,
                          onSelected: (_) => setState(() => _tierKey = t.key),
                        ))
                    .toList(),
              ),
            ),
            const SizedBox(height: AppSpace.s16),
            Text('Products to promote', style: context.text.labelLarge),
            const SizedBox(height: 6),
            products.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e', style: TextStyle(color: c.error)),
              data: (list) => Column(
                children: list
                    .take(12)
                    .map((p) => CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          value: _productIds.contains(p.id),
                          title: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                          onChanged: (v) => setState(() => v == true ? _productIds.add(p.id) : _productIds.remove(p.id)),
                        ))
                    .toList(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: c.error)),
            ],
            const SizedBox(height: AppSpace.s16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy || _productIds.isEmpty ? null : _submit,
                child: _busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Create draft'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Vendor's own products, for the promote picker.
final myProductsProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(stallApiProvider).myProducts(),
);
