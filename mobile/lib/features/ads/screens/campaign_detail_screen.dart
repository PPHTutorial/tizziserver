import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/ads_models.dart';
import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../ads_providers.dart';
import '../../../design/icons.dart';
import 'advertising_center_screen.dart' show myProductsProvider;

class CampaignDetailScreen extends ConsumerWidget {
  const CampaignDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final detail = ref.watch(campaignDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('Campaign')),
      body: SafeArea(
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (d) {
            final camp = d.campaign;
            final p = d.performance;
            return ListView(
              padding: const EdgeInsets.all(AppSpace.s16),
              children: [
                Text(camp.name, style: context.text.titleLarge),
                const SizedBox(height: 4),
                Text('${camp.status.replaceAll('_', ' ')} · ${camp.objective.replaceAll('_', ' ')}',
                    style: context.text.bodySmall?.copyWith(color: c.textMed)),
                const SizedBox(height: AppSpace.s16),
                Row(children: [
                  StatTile(label: 'Impressions', value: '${p.impressions}'),
                  StatTile(label: 'Clicks', value: '${p.clicks}'),
                  StatTile(label: 'CTR', value: '${p.ctr}%'),
                ]),
                const SizedBox(height: AppSpace.s8),
                Row(children: [
                  StatTile(label: 'Conversions', value: '${p.conversions}'),
                  StatTile(label: 'Spent', value: formatMoney(p.spentMinor, 'GHS')),
                  StatTile(label: 'Left', value: formatMoney(p.remainingMinor, 'GHS')),
                ]),
                const SizedBox(height: AppSpace.s16),
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  child: LinearProgressIndicator(
                    value: p.budgetMinor == 0 ? 0 : p.spentMinor / p.budgetMinor,
                    minHeight: 8,
                    backgroundColor: c.border,
                    color: c.primary,
                  ),
                ),
                const SizedBox(height: AppSpace.s24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Creatives (${d.creatives.length})', style: context.text.titleMedium),
                    TextButton.icon(
                      onPressed: () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) => _CreativeFormSheet(campaignId: camp.id),
                      ),
                      icon: const Icon(AppIcons.add, size: 18),
                      label: const Text('Add'),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.s4),
                if (d.creatives.isEmpty)
                  Text(
                    'No creatives yet — add one to start showing this campaign in the app.',
                    style: context.text.bodySmall?.copyWith(color: c.textMed),
                  )
                else
                  ...d.creatives.map((a) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.s8),
                        child: AppCard(
                          onTap: () => showModalBottomSheet<void>(
                            context: context,
                            isScrollControlled: true,
                            builder: (_) => _CreativeFormSheet(campaignId: camp.id, existing: a),
                          ),
                          child: Row(
                            children: [
                              Icon(AppIcons.image_outlined, color: c.textMed),
                              const SizedBox(width: AppSpace.s12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${a['slot']}'.replaceAll('_', ' '), style: context.text.titleSmall),
                                    Text('${a['headline'] ?? a['creativeKind']}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: context.text.bodySmall?.copyWith(color: c.textMed)),
                                  ],
                                ),
                              ),
                              const SizedBox(width: AppSpace.s8),
                              StatusBadge(
                                a['isActive'] == true ? 'active' : 'paused',
                                tone: a['isActive'] == true ? BadgeTone.success : BadgeTone.neutral,
                              ),
                            ],
                          ),
                        ),
                      )),
                const SizedBox(height: AppSpace.s24),
                _Actions(camp: camp),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Actions extends ConsumerStatefulWidget {
  const _Actions({required this.camp});
  final CampaignDto camp;
  @override
  ConsumerState<_Actions> createState() => _ActionsState();
}

class _ActionsState extends ConsumerState<_Actions> {
  bool _busy = false;
  String? _error;

  Future<void> _run(Future<CampaignDto> Function() op) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await op();
      ref.invalidate(campaignDetailProvider(widget.camp.id));
      ref.invalidate(campaignsProvider);
    } on StallApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    await _run(() async {
      final method = await showModalBottomSheet<String>(
        context: context,
        builder: (_) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(leading: const Icon(AppIcons.account_balance_wallet_outlined), title: const Text('Pay from wallet'), onTap: () => Navigator.pop(context, 'wallet')),
            ListTile(leading: const Icon(AppIcons.credit_card), title: const Text('Card / Mobile Money'), onTap: () => Navigator.pop(context, 'gateway')),
          ]),
        ),
      );
      if (method == null) return widget.camp;
      return ref.read(stallApiProvider).submitCampaign(widget.camp.id, paymentMethod: method);
    });
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(stallApiProvider);
    final s = widget.camp.status;
    final buttons = <Widget>[];
    if (s == 'DRAFT' || s == 'REJECTED') {
      buttons.add(FilledButton(onPressed: _busy ? null : _submit, child: const Text('Submit & fund')));
    }
    if (s == 'ACTIVE') {
      buttons.add(OutlinedButton(onPressed: _busy ? null : () => _run(() => api.pauseCampaign(widget.camp.id)), child: const Text('Pause')));
    }
    if (s == 'PAUSED') {
      buttons.add(FilledButton(onPressed: _busy ? null : () => _run(() => api.resumeCampaign(widget.camp.id)), child: const Text('Resume')));
    }
    if (s != 'COMPLETED' && s != 'CANCELLED') {
      buttons.add(TextButton(
        onPressed: _busy ? null : () => _run(() => api.cancelCampaign(widget.camp.id)),
        child: Text('Cancel campaign', style: TextStyle(color: context.colors.error)),
      ));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: context.colors.error))),
        ...buttons.map((b) => Padding(padding: const EdgeInsets.only(bottom: 8), child: b)),
      ],
    );
  }
}

/// Add/edit a campaign creative. `existing` (the raw `ads[i]` map from
/// `CampaignDetailDto`) is null for "add", populated for "edit" — the same
/// sheet drives both, matching the create/edit split the backend itself
/// draws (POST allows `creativeKind`, PATCH does not — it's fixed at
/// creation, so the kind picker only shows up when adding).
class _CreativeFormSheet extends ConsumerStatefulWidget {
  const _CreativeFormSheet({required this.campaignId, this.existing});
  final String campaignId;
  final Map<String, dynamic>? existing;

  @override
  ConsumerState<_CreativeFormSheet> createState() => _CreativeFormSheetState();
}

class _CreativeFormSheetState extends ConsumerState<_CreativeFormSheet> {
  static const _slots = ['HOME_RAIL', 'SEARCH_TOP', 'CATEGORY_TOP', 'PRODUCT_RELATED', 'CHECKOUT_CROSS_SELL'];
  static const _kinds = ['PRODUCT_CARD', 'BANNER'];

  late String _slot = widget.existing?['slot'] as String? ?? _slots.first;
  late String _kind = _kinds.first;
  late final _headline = TextEditingController(text: widget.existing?['headline'] as String? ?? '');
  late final _subtext = TextEditingController(text: widget.existing?['subtext'] as String? ?? '');
  late final _destinationRoute =
      TextEditingController(text: widget.existing?['destinationRoute'] as String? ?? '');
  late String? _productId = widget.existing?['productId'] as String?;
  late double _weight = ((widget.existing?['weight'] as num?)?.toDouble()) ?? 100;
  late bool _isActive = widget.existing?['isActive'] as bool? ?? true;
  bool _busy = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void dispose() {
    _headline.dispose();
    _subtext.dispose();
    _destinationRoute.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() op) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await op();
      ref.invalidate(campaignDetailProvider(widget.campaignId));
      if (mounted) Navigator.of(context).pop();
    } on StallApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() => _run(() {
        final api = ref.read(stallApiProvider);
        final headline = _headline.text.trim();
        final subtext = _subtext.text.trim();
        final route = _destinationRoute.text.trim();
        if (_isEdit) {
          return api.updateCampaignCreative(
            widget.campaignId,
            widget.existing!['id'] as String,
            slot: _slot,
            headline: headline.isEmpty ? null : headline,
            subtext: subtext.isEmpty ? null : subtext,
            productId: _productId,
            destinationRoute: route.isEmpty ? null : route,
            weight: _weight.round(),
            isActive: _isActive,
          );
        }
        return api.addCampaignCreative(
          widget.campaignId,
          slot: _slot,
          creativeKind: _kind,
          headline: headline.isEmpty ? null : headline,
          subtext: subtext.isEmpty ? null : subtext,
          productId: _productId,
          destinationRoute: route.isEmpty ? null : route,
          weight: _weight.round(),
        );
      });

  Future<void> _remove() => _run(
        () => ref.read(stallApiProvider).removeCampaignCreative(widget.campaignId, widget.existing!['id'] as String),
      );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final products = ref.watch(myProductsProvider);
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16,
        top: AppSpace.s16,
        left: AppSpace.s16,
        right: AppSpace.s16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_isEdit ? 'Edit creative' : 'New creative', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s16),
            Text('Placement', style: context.text.labelLarge),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                for (final s in _slots)
                  ChoiceChip(
                    label: Text(s.replaceAll('_', ' ')),
                    selected: _slot == s,
                    onSelected: (_) => setState(() => _slot = s),
                  ),
              ],
            ),
            if (!_isEdit) ...[
              const SizedBox(height: AppSpace.s16),
              Text('Kind', style: context.text.labelLarge),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                children: [
                  for (final k in _kinds)
                    ChoiceChip(
                      label: Text(k.replaceAll('_', ' ')),
                      selected: _kind == k,
                      onSelected: (_) => setState(() => _kind = k),
                    ),
                ],
              ),
            ],
            const SizedBox(height: AppSpace.s16),
            TextField(controller: _headline, decoration: const InputDecoration(labelText: 'Headline (optional)')),
            const SizedBox(height: AppSpace.s12),
            TextField(controller: _subtext, decoration: const InputDecoration(labelText: 'Subtext (optional)')),
            const SizedBox(height: AppSpace.s16),
            Text('Product', style: context.text.labelLarge),
            const SizedBox(height: 6),
            products.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e', style: TextStyle(color: c.error)),
              data: (list) => Wrap(
                spacing: 8,
                children: [
                  ChoiceChip(
                    label: const Text('None'),
                    selected: _productId == null,
                    onSelected: (_) => setState(() => _productId = null),
                  ),
                  for (final p in list.take(20))
                    ChoiceChip(
                      label: Text(p.title, overflow: TextOverflow.ellipsis),
                      selected: _productId == p.id,
                      onSelected: (_) => setState(() => _productId = p.id),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.s16),
            TextField(
              controller: _destinationRoute,
              decoration: const InputDecoration(labelText: 'Destination route (optional, e.g. /deals)'),
            ),
            const SizedBox(height: AppSpace.s16),
            Text('Weight: ${_weight.round()} (higher = shown more often)', style: context.text.bodyMedium),
            Slider(
              value: _weight,
              min: 1,
              max: 1000,
              divisions: 999,
              label: '${_weight.round()}',
              onChanged: (v) => setState(() => _weight = v),
            ),
            if (_isEdit)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                value: _isActive,
                onChanged: (v) => setState(() => _isActive = v),
              ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: c.error)),
            ],
            const SizedBox(height: AppSpace.s16),
            Row(
              children: [
                if (_isEdit) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : _remove,
                      style: OutlinedButton.styleFrom(foregroundColor: c.error, side: BorderSide(color: c.error)),
                      child: const Text('Remove'),
                    ),
                  ),
                  const SizedBox(width: AppSpace.s12),
                ],
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _save,
                    child: _busy
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_isEdit ? 'Save' : 'Add creative'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
