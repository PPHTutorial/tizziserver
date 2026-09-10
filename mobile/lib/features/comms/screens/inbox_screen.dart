import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../comms_providers.dart';
import '../../../design/icons.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final convos = ref.watch(conversationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Inbox')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(conversationsProvider);
            await ref.read(conversationsProvider.future);
          },
          child: convos.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('$e')),
            data: (list) {
              if (list.isEmpty) {
                return ListView(children: [
                  const SizedBox(height: 140),
                  Icon(AppIcons.forum_outlined, size: 48, color: c.textLow),
                  const SizedBox(height: AppSpace.s8),
                  Center(child: Text('No conversations yet', style: context.text.bodyMedium)),
                ]);
              }
              return ListView.separated(
                itemCount: list.length,
                separatorBuilder: (_, __) => Divider(height: 1, color: c.border),
                itemBuilder: (_, i) {
                  final cv = list[i];
                  return ListTile(
                    leading: CircleAvatar(
                      backgroundColor: c.primaryContainer,
                      child: Icon(cv.kind == 'SUPPORT' ? AppIcons.headset_mic : AppIcons.person, color: c.onPrimaryContainer),
                    ),
                    title: Text(cv.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text(
                      '${cv.lastFromMe ? 'You: ' : ''}${cv.lastBody ?? 'No messages yet'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(color: c.textMed),
                    ),
                    trailing: cv.unread > 0
                        ? Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(AppRadius.pill)),
                            child: Text('${cv.unread}', style: context.text.labelSmall?.copyWith(color: c.onPrimary)),
                          )
                        : null,
                    onTap: () => context.push(RoutePaths.conversation(cv.id), extra: cv.title),
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}
