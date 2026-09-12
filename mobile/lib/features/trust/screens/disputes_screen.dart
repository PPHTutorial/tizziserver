import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../trust_providers.dart';
import '../../../design/icons.dart';

class DisputesScreen extends ConsumerWidget {
  const DisputesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final list = ref.watch(disputesProvider);
    return Scaffold(
      backgroundColor: c.bg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
          ),
          builder: (_) => const _OpenDisputeSheet(),
        ),
        icon: const Icon(AppIcons.add),
        label: const Text('Open a dispute'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Disputes'),
            Expanded(
              child: list.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (items) {
                  if (items.isEmpty) {
                    return Center(
                      child: Text(
                        'No disputes',
                        style: context.text.bodyMedium?.copyWith(
                          color: c.textMed,
                        ),
                      ),
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.s16,
                      0,
                      AppSpace.s16,
                      AppSpace.s16,
                    ),
                    itemCount: items.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: AppSpace.s12),
                    itemBuilder: (_, i) {
                      final d = items[i];
                      return AppCard(
                        padding: const EdgeInsets.all(AppSpace.s16),
                        onTap: () => context.push(RoutePaths.dispute(d.id)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${d.kind} · ${d.category}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: context.text.titleSmall,
                                  ),
                                ),
                                const SizedBox(width: AppSpace.s8),
                                _StatusChip(status: d.status),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              d.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: context.text.bodySmall?.copyWith(
                                color: c.textMed,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
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
    final resolved = const {'RESOLVED', 'CLOSED'}.contains(status);
    return StatusBadge(
      status,
      tone: resolved ? BadgeTone.success : BadgeTone.neutral,
    );
  }
}

class _OpenDisputeSheet extends ConsumerStatefulWidget {
  const _OpenDisputeSheet();
  @override
  ConsumerState<_OpenDisputeSheet> createState() => _OpenDisputeSheetState();
}

class _OpenDisputeSheetState extends ConsumerState<_OpenDisputeSheet> {
  String _kind = 'ORDER';
  final _ref = TextEditingController();
  final _cat = TextEditingController(text: 'item-not-as-described');
  final _body = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _ref.dispose();
    _cat.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(stallApiProvider)
          .openDispute(
            kind: _kind,
            refId: _ref.text.trim(),
            category: _cat.text.trim(),
            body: _body.text.trim(),
          );
      ref.invalidate(disputesProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpace.s16,
        right: AppSpace.s16,
        top: AppSpace.s16,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Open a dispute', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s12),
          Wrap(
            spacing: AppSpace.s8,
            children:
                ['ORDER', 'PAYMENT', 'DELIVERY', 'VENDOR', 'COURIER', 'AUCTION']
                    .map(
                      (k) => ChoiceChip(
                        label: Text(k),
                        selected: _kind == k,
                        onSelected: (_) => setState(() => _kind = k),
                      ),
                    )
                    .toList(),
          ),
          const SizedBox(height: AppSpace.s8),
          AppField(
            label: 'Reference id (order / delivery / …)',
            hintText: 'e.g. ORD-10234',
            controller: _ref,
          ),
          const SizedBox(height: AppSpace.s8),
          AppField(
            label: 'Category',
            hintText: 'e.g. Item not received',
            controller: _cat,
          ),
          const SizedBox(height: AppSpace.s8),
          AppField(
            label: 'What happened?',
            hintText: 'Describe the issue in detail',
            controller: _body,
          ),
          const SizedBox(height: AppSpace.s16),
          PrimaryButton(label: 'Submit', loading: _busy, onPressed: _submit),
        ],
      ),
    );
  }
}

class DisputeDetailScreen extends ConsumerStatefulWidget {
  const DisputeDetailScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<DisputeDetailScreen> createState() =>
      _DisputeDetailScreenState();
}

class _DisputeDetailScreenState extends ConsumerState<DisputeDetailScreen> {
  final _msg = TextEditingController();

  @override
  void dispose() {
    _msg.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final d = ref.watch(disputeProvider(widget.id));
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Dispute'),
            Expanded(
              child: d.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (dp) => Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.all(AppSpace.s16),
                        children: [
                          Row(
                            children: [
                              Text(
                                '${dp.kind} · ${dp.category}',
                                style: context.text.titleMedium,
                              ),
                              const Spacer(),
                              _StatusChip(status: dp.status),
                            ],
                          ),
                          const SizedBox(height: AppSpace.s4),
                          if (dp.slaDueAt != null && dp.isOpen)
                            Text(
                              'Response due ${dp.slaDueAt!.toLocal().toString().substring(0, 16)}',
                              style: context.text.bodySmall?.copyWith(
                                color: c.textMed,
                              ),
                            ),
                          if (dp.refundMinor != null && dp.refundMinor! > 0)
                            Text(
                              'Refund issued: ${(dp.refundMinor! / 100).toStringAsFixed(2)}',
                              style: context.text.bodyMedium?.copyWith(
                                color: c.success,
                              ),
                            ),
                          const SizedBox(height: AppSpace.s16),
                          Text('Evidence', style: context.text.titleSmall),
                          ...dp.evidence.map(
                            (e) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Text(
                                '${e.by}: ${e.body ?? e.fileKey ?? e.kind}',
                                style: context.text.bodySmall,
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpace.s16),
                          Text('Messages', style: context.text.titleSmall),
                          ...dp.messages.map(
                            (m) => Align(
                              alignment: Alignment.centerLeft,
                              child: Container(
                                margin: const EdgeInsets.symmetric(vertical: 3),
                                padding: const EdgeInsets.all(AppSpace.s8),
                                decoration: BoxDecoration(
                                  color: c.surfaceSunken,
                                  borderRadius: BorderRadius.circular(
                                    AppRadius.md,
                                  ),
                                ),
                                child: Text(
                                  '${m.by}: ${m.body}',
                                  style: context.text.bodyMedium,
                                ),
                              ),
                            ),
                          ),
                          if (dp.status == 'RESOLVED' &&
                              dp.appealStatus == null) ...[
                            const SizedBox(height: AppSpace.s16),
                            SecondaryButton(
                              label: 'Appeal this decision',
                              onPressed: () async {
                                final ok = await _prompt(
                                  context,
                                  'Why are you appealing?',
                                );
                                if (ok == null) return;
                                await ref
                                    .read(stallApiProvider)
                                    .appealDispute(widget.id, ok);
                                ref.invalidate(disputeProvider(widget.id));
                              },
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (dp.isOpen)
                      Container(
                        padding: const EdgeInsets.all(AppSpace.s8),
                        decoration: BoxDecoration(
                          color: c.surface,
                          border: Border(top: BorderSide(color: c.border)),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _msg,
                                decoration: const InputDecoration.collapsed(
                                  hintText: 'Add a message…',
                                ),
                              ),
                            ),
                            IconButton(
                              icon: Icon(AppIcons.send, color: c.primary),
                              onPressed: () async {
                                final t = _msg.text.trim();
                                if (t.isEmpty) return;
                                _msg.clear();
                                await ref
                                    .read(stallApiProvider)
                                    .sendDisputeMessage(widget.id, t);
                                ref.invalidate(disputeProvider(widget.id));
                              },
                            ),
                          ],
                        ),
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

Future<String?> _prompt(BuildContext context, String title) {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(controller: ctrl, maxLines: 3),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, ctrl.text.trim()),
          child: const Text('Submit'),
        ),
      ],
    ),
  );
}
