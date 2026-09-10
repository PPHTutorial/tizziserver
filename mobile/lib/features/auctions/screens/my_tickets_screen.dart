import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/auction_models.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../auction_providers.dart';
import '../../../design/components.dart';
import '../../../design/icons.dart';

class MyTicketsScreen extends ConsumerWidget {
  const MyTicketsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final wallets = ref.watch(myTicketWalletsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My tickets')),
      body: SafeArea(
        child: wallets.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (list) {
            if (list.isEmpty) {
              return Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(AppIcons.confirmation_number_outlined, size: 48, color: c.textLow),
                  const SizedBox(height: AppSpace.s8),
                  Text('No seats yet', style: context.text.bodyMedium),
                  TextButton(onPressed: () => context.go(RoutePaths.auctions), child: const Text('Browse draws')),
                ]),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(AppSpace.s16),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
              itemBuilder: (_, i) {
                final w = list[i];
                return AppCard(
                  padding: const EdgeInsets.all(AppSpace.s16),
                  onTap: () => context.push(RoutePaths.auction(w.auctionSlug)),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(AppSpace.s12),
                        decoration: BoxDecoration(color: c.primaryContainer, borderRadius: BorderRadius.circular(AppRadius.md)),
                        child: Text('${w.activeCount}', style: context.text.titleLarge?.copyWith(color: c.onPrimaryContainer)),
                      ),
                      const SizedBox(width: AppSpace.s12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(w.auctionTitle, style: context.text.titleSmall),
                            const SizedBox(height: 2),
                            Text('${auctionStatusLabel(w.auctionStatus)} · ${w.fillPct}% full',
                                style: context.text.bodySmall?.copyWith(color: c.textMed)),
                            if (w.drawAt != null) ...[
                              const SizedBox(height: AppSpace.s6),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: Countdown(
                                  target: w.drawAt!,
                                  prefix: 'Draw in',
                                  icon: AppIcons.clock,
                                  imminentLabel: 'imminent',
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const Icon(AppIcons.chevron_right),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
