import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../auction_providers.dart';

/// Qualification centre — score breakdown, rank, leaderboard, and the
/// engagement / share / referral actions that (weight, never guarantee) the draw.
class AuctionQualificationScreen extends ConsumerWidget {
  const AuctionQualificationScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final q = ref.watch(auctionQualificationProvider(slug));
    final board = ref.watch(auctionLeaderboardProvider(slug));

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Qualification'),
            Expanded(
              child: q.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (data) => ListView(
                  padding: const EdgeInsets.all(AppSpace.s16),
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(AppSpace.s20),
                      decoration: BoxDecoration(
                        color: c.primary.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(AppRadius.lg),
                      ),
                      child: Column(
                        children: [
                          Text(
                            'Your score',
                            style: context.text.bodySmall?.copyWith(
                              color: c.textMed,
                            ),
                          ),
                          Text(
                            data.qualificationScore.toStringAsFixed(1),
                            style: context.text.headlineLarge,
                          ),
                          Text(
                            data.rank != null
                                ? 'Rank #${data.rank} of ${data.totalParticipants}'
                                : '${data.totalParticipants} participants',
                            style: context.text.bodyMedium?.copyWith(
                              color: c.textMed,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                    Text('How it adds up', style: context.text.titleMedium),
                    const SizedBox(height: AppSpace.s8),
                    ...data.breakdown.map(
                      (b) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Expanded(child: Text(_factorLabel(b.factor))),
                            Text(
                              '${b.points.toStringAsFixed(0)} × ${b.weight}',
                              style: context.text.bodySmall?.copyWith(
                                color: c.textMed,
                              ),
                            ),
                            const SizedBox(width: AppSpace.s8),
                            Text(
                              '+${b.contribution.toStringAsFixed(1)}',
                              style: context.text.titleSmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                    Wrap(
                      spacing: AppSpace.s8,
                      children: [
                        _ActionChip(
                          label: 'Share the draw',
                          onTap: () => _qualify(context, ref, 'SHARE'),
                        ),
                        _ActionChip(
                          label: 'Watch the video',
                          onTap: () => _qualify(context, ref, 'ENGAGEMENT'),
                        ),
                        _ActionChip(
                          label: 'Invite a friend',
                          onTap: () => _qualify(context, ref, 'REFERRAL'),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpace.s8),
                    Text(
                      data.note,
                      style: context.text.bodySmall?.copyWith(color: c.textLow),
                    ),
                    const SizedBox(height: AppSpace.s24),
                    Text('Leaderboard', style: context.text.titleMedium),
                    const SizedBox(height: AppSpace.s8),
                    board.when(
                      loading: () => const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: CircularProgressIndicator(),
                        ),
                      ),
                      error: (e, _) => Text('$e'),
                      data: (rows) => Column(
                        children: rows
                            .map(
                              (r) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: CircleAvatar(
                                  radius: 14,
                                  backgroundColor: c.surfaceSunken,
                                  child: Text(
                                    '${r.rank}',
                                    style: context.text.labelSmall,
                                  ),
                                ),
                                title: Text(r.name),
                                subtitle: Text('${r.ticketCount} seats'),
                                trailing: Text(
                                  r.score.toStringAsFixed(1),
                                  style: context.text.titleSmall,
                                ),
                              ),
                            )
                            .toList(),
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

  String _factorLabel(String f) => switch (f) {
    'TICKETS' => 'Seats held',
    'ENGAGEMENT' => 'Engagement',
    'SHARE' => 'Shares',
    'REFERRAL' => 'Referrals',
    _ => f,
  };

  Future<void> _qualify(
    BuildContext context,
    WidgetRef ref,
    String factor,
  ) async {
    try {
      await ref
          .read(stallApiProvider)
          .auctionQualify(
            slug,
            factor: factor,
            key: '$factor-${DateTime.now().millisecondsSinceEpoch ~/ 60000}',
          );
      ref.invalidate(auctionQualificationProvider(slug));
      ref.invalidate(auctionLeaderboardProvider(slug));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Logged — your score updated.')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) =>
      ActionChip(label: Text(label), onPressed: onTap);
}
