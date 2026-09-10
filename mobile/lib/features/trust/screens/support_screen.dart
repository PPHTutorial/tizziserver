import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../trust_providers.dart';
import '../../../design/icons.dart';

class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final help = ref.watch(helpCenterProvider);
    final tickets = ref.watch(supportTicketsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Help & support')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => const _NewTicketSheet()),
        icon: const Icon(AppIcons.support_agent),
        label: const Text('Contact support'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.s16),
          children: [
            tickets.maybeWhen(
              data: (list) => list.isEmpty
                  ? const SizedBox.shrink()
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Your tickets', style: context.text.titleMedium),
                        const SizedBox(height: AppSpace.s8),
                        ...list.map((t) => Card(
                              child: ListTile(
                                title: Text(t.subject),
                                subtitle: Text('${t.number} · ${t.status.toLowerCase()}'),
                                trailing: const Icon(AppIcons.chevron_right),
                                onTap: t.conversationId == null
                                    ? null
                                    : () => context.push(RoutePaths.conversation(t.conversationId!), extra: 'Support · ${t.number}'),
                              ),
                            )),
                        const SizedBox(height: AppSpace.s16),
                      ],
                    ),
              orElse: () => const SizedBox.shrink(),
            ),
            Text('FAQ', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            help.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
              error: (e, _) => Text('$e'),
              data: (h) => Column(
                children: h.faq
                    .map((f) => ExpansionTile(
                          tilePadding: EdgeInsets.zero,
                          title: Text(f.q, style: context.text.bodyLarge),
                          subtitle: Text(f.category, style: context.text.labelSmall?.copyWith(color: context.colors.textMed)),
                          children: [Padding(padding: const EdgeInsets.only(bottom: AppSpace.s12), child: Text(f.a, style: context.text.bodyMedium))],
                        ))
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewTicketSheet extends ConsumerStatefulWidget {
  const _NewTicketSheet();
  @override
  ConsumerState<_NewTicketSheet> createState() => _NewTicketSheetState();
}

class _NewTicketSheetState extends ConsumerState<_NewTicketSheet> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _category = 'Orders';
  String _priority = 'NORMAL';
  bool _busy = false;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      final r = await ref.read(stallApiProvider).createSupportTicket(category: _category, subject: _subject.text.trim(), body: _body.text.trim(), priority: _priority);
      ref.invalidate(supportTicketsProvider);
      if (mounted) {
        Navigator.pop(context);
        final cid = r['conversationId'] as String?;
        if (cid != null) context.push(RoutePaths.conversation(cid), extra: 'Support · ${r['number']}');
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: AppSpace.s16, right: AppSpace.s16, top: AppSpace.s16, bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Contact support', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s12),
          Wrap(
            spacing: AppSpace.s8,
            children: ['Orders', 'Payments', 'Wallet', 'Deliveries', 'Account']
                .map((cat) => ChoiceChip(label: Text(cat), selected: _category == cat, onSelected: (_) => setState(() => _category = cat)))
                .toList(),
          ),
          const SizedBox(height: AppSpace.s8),
          AppField(label: 'Subject', controller: _subject),
          const SizedBox(height: AppSpace.s8),
          AppField(label: 'Describe the issue', controller: _body),
          const SizedBox(height: AppSpace.s8),
          Row(
            children: ['LOW', 'NORMAL', 'HIGH', 'URGENT']
                .map((p) => Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(label: Text(p[0] + p.substring(1).toLowerCase()), selected: _priority == p, onSelected: (_) => setState(() => _priority = p)),
                    ))
                .toList(),
          ),
          const SizedBox(height: AppSpace.s16),
          PrimaryButton(label: 'Open ticket', loading: _busy, onPressed: _submit),
        ],
      ),
    );
  }
}
