import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../comms_providers.dart';
import '../comms_realtime.dart';
import '../../../design/icons.dart';
import '../../trust/report_sheet.dart';

class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({super.key, required this.conversationId, this.title});
  final String conversationId;
  final String? title;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  DateTime _lastTypingPing = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(stallApiProvider).markConversationRead(widget.conversationId).catchError((_) {}));
    _input.addListener(_onTyping);
  }

  @override
  void dispose() {
    _input.removeListener(_onTyping);
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onTyping() {
    if (_input.text.isEmpty) return;
    final now = DateTime.now();
    if (now.difference(_lastTypingPing) < const Duration(seconds: 2)) return;
    _lastTypingPing = now;
    ref.read(commsRealtimeProvider).sendTyping(widget.conversationId);
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _input.clear();
    try {
      await ref.read(stallApiProvider).sendMessage(widget.conversationId, body: text);
      ref.invalidate(messagesProvider(widget.conversationId));
      ref.invalidate(conversationsProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final msgs = ref.watch(messagesProvider(widget.conversationId));
    final peerTyping = msgs.valueOrNull?.peerTyping ?? false;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title ?? 'Conversation'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'report') {
                showReportSheet(context, ref,
                    targetType: 'CONVERSATION',
                    targetId: widget.conversationId,
                    targetLabel: 'conversation');
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'report', child: Text('Report conversation')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: msgs.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (page) => ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(AppSpace.s12),
                  itemCount: page.items.length,
                  itemBuilder: (_, i) {
                    final m = page.items[i];
                    return Align(
                      alignment: m.fromMe ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 3),
                        padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12, vertical: AppSpace.s8),
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                        decoration: BoxDecoration(
                          color: m.fromMe ? c.primary : c.surfaceSunken,
                          borderRadius: BorderRadius.circular(AppRadius.lg),
                        ),
                        child: Text(
                          m.body ?? '[${m.kind.toLowerCase()}]',
                          style: context.text.bodyMedium?.copyWith(color: m.fromMe ? c.onPrimary : c.textHi),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            if (peerTyping)
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpace.s16, 0, 0, AppSpace.s4),
                  child: Text('typing…',
                      style: context.text.bodySmall?.copyWith(color: c.textMed, fontStyle: FontStyle.italic)),
                ),
              ),
            Container(
              padding: const EdgeInsets.fromLTRB(AppSpace.s12, AppSpace.s8, AppSpace.s8, AppSpace.s8),
              decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration.collapsed(hintText: 'Message…'),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(
                    icon: _sending
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(AppIcons.send, color: c.primary),
                    onPressed: _send,
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
