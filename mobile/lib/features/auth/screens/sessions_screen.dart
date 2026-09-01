import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';

final _sessionsProvider = FutureProvider.autoDispose<List<SessionInfo>>(
  (ref) => ref.watch(stallApiProvider).sessions(),
);

/// Screens 17–18 — active sessions / security notices, with per-device revoke
/// and "sign out everywhere".
class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_sessionsProvider);

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Signed-in devices')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load your sessions',
          body: 'Check your connection and try again.',
          action: PrimaryButton(
            label: 'Retry',
            onPressed: () => ref.invalidate(_sessionsProvider),
          ),
        ),
        data: (sessions) => ListView(
          padding: const EdgeInsets.all(AppSpace.s16),
          children: [
            for (final s in sessions) _SessionCard(session: s, ref: ref),
            const SizedBox(height: AppSpace.s16),
            SecondaryButton(
              label: 'Sign out of all other devices',
              onPressed: () async {
                await ref.read(authControllerProvider.notifier).logout(everywhere: true);
                if (context.mounted) context.go(RoutePaths.welcome);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({required this.session, required this.ref});

  final SessionInfo session;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpace.s12),
      padding: const EdgeInsets.all(AppSpace.s16),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(session.current ? Icons.verified_user : Icons.devices, color: c.textMed),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  session.userAgent ?? session.platformSlug ?? 'Unknown device',
                  style: context.text.titleSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: AppSpace.s2),
                Text(
                  [
                    session.activeRole,
                    if (session.ip != null) session.ip,
                    if (session.current) 'This device',
                  ].join(' · '),
                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                ),
              ],
            ),
          ),
          if (!session.current)
            TextButton(
              onPressed: () async {
                await ref.read(stallApiProvider).revokeSession(session.id);
                ref.invalidate(_sessionsProvider);
              },
              child: const Text('Revoke'),
            ),
        ],
      ),
    );
  }
}
