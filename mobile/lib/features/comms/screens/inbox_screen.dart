import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/components.dart';
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
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Messages'),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(conversationsProvider);
                  await ref.read(conversationsProvider.future);
                },
                child: convos.when(
                  loading: () => const SkeletonList(rows: 6, rowHeight: 72),
                  error: (e, _) => ListView(children: [AppErrorView(e, onRetry: () => ref.invalidate(conversationsProvider))]),
                  data: (list) {
                    if (list.isEmpty) {
                      return ListView(children: const [
                        SizedBox(height: 100),
                        EmptyState(icon: AppIcons.forum_outlined, title: 'No conversations yet'),
                      ]);
                    }
                    return ListView.separated(
                      padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s4, AppSpace.s16, AppSpace.s24),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s10),
                      itemBuilder: (_, i) {
                        final cv = list[i];
                        return AppCard(
                          elevated: cv.unread > 0,
                          onTap: () => context.push(RoutePaths.conversation(cv.id), extra: cv.title),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: c.primaryContainer,
                                child: Icon(
                                    cv.kind == 'SUPPORT' ? AppIcons.headset_mic : AppIcons.person,
                                    size: 18,
                                    color: c.onPrimaryContainer),
                              ),
                              const SizedBox(width: AppSpace.s12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(cv.title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: context.text.titleSmall?.copyWith(
                                            fontWeight: cv.unread > 0 ? FontWeight.w800 : FontWeight.w600)),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${cv.lastFromMe ? 'You: ' : ''}${cv.lastBody ?? 'No messages yet'}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: context.text.bodyMedium?.copyWith(color: c.textMed),
                                    ),
                                  ],
                                ),
                              ),
                              if (cv.unread > 0) ...[
                                const SizedBox(width: AppSpace.s8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                      color: c.primary, borderRadius: BorderRadius.circular(AppRadius.pill)),
                                  child: Text('${cv.unread}',
                                      style: context.text.labelSmall?.copyWith(color: c.onPrimary)),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
