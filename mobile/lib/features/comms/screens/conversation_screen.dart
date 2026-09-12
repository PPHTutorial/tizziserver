import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../design/components.dart';
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
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              widget.title ?? 'Conversation',
              trailing: IconButton(
                icon: const Icon(AppIcons.flag, size: 15),
                onPressed: () => showReportSheet(context, ref,
                    targetType: 'CONVERSATION',
                    targetId: widget.conversationId,
                    targetLabel: 'conversation'),
              ),
            ),
            Expanded(
              child: msgs.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (page) => ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(AppSpace.s16),
                  itemCount: page.items.length,
                  itemBuilder: (_, i) {
                    final m = page.items[i];
                    return Align(
                      alignment: m.fromMe ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 3),
                        padding: const EdgeInsets.symmetric(horizontal: AppSpace.s14, vertical: AppSpace.s10),
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                        decoration: BoxDecoration(
                          color: m.fromMe ? c.primary : c.surface,
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(AppRadius.r2xl),
                            topRight: const Radius.circular(AppRadius.r2xl),
                            bottomLeft: Radius.circular(m.fromMe ? AppRadius.r2xl : AppRadius.xs),
                            bottomRight: Radius.circular(m.fromMe ? AppRadius.xs : AppRadius.r2xl),
                          ),
                          border: m.fromMe ? null : Border.all(color: c.border.withValues(alpha: 0.6)),
                        ),
                        child: m.body != null
                            ? Text(
                                m.body!,
                                style: context.text.bodyLarge
                                    ?.copyWith(color: m.fromMe ? c.onPrimary : c.textHi),
                              )
                            : Text(
                                // No structured product-card payload is exposed by
                                // ChatMessageDto.attachments yet — an honest label
                                // instead of the old raw "[kind]" debug text.
                                m.kind == 'PRODUCT_SHARE' ? 'Shared a product' : 'Attachment',
                                style: context.text.bodyMedium?.copyWith(
                                  color: m.fromMe ? c.onPrimary.withValues(alpha: 0.85) : c.textMed,
                                  fontStyle: FontStyle.italic,
                                ),
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
