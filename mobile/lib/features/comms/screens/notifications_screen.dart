import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/comms_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../comms_providers.dart';
import '../../../design/icons.dart';

const _kAuctionCats = {'AUCTION', 'TICKET'};
const _kPromoCats = {'COUPON', 'PROMO'};

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final feed = ref.watch(notificationFeedProvider);
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              'Notifications',
              trailing: Row(
                children: [
                  IconButton(
                    tooltip: 'Preferences',
                    icon: const Icon(AppIcons.tune, size: 16),
                    onPressed: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      showDragHandle: true,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
                      ),
                      builder: (_) => const NotificationPrefsSheet(),
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      await ref
                          .read(stallApiProvider)
                          .markAllNotificationsRead();
                      ref.invalidate(notificationFeedProvider);
                    },
                    child: Text(
                      'Read all',
                      style: context.text.labelLarge?.copyWith(
                        color: c.primary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
                children: [
                  AppChip(
                    'All (${feed.valueOrNull?.items.length ?? 0})',
                    selected: _filter == 'all',
                    onTap: () => setState(() => _filter = 'all'),
                  ),
                  const SizedBox(width: AppSpace.s8),
                  AppChip(
                    'Auctions',
                    selected: _filter == 'auctions',
                    onTap: () => setState(() => _filter = 'auctions'),
                  ),
                  const SizedBox(width: AppSpace.s8),
                  AppChip(
                    'Promo',
                    selected: _filter == 'promo',
                    onTap: () => setState(() => _filter = 'promo'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(notificationFeedProvider);
                  await ref.read(notificationFeedProvider.future);
                },
                child: feed.when(
                  loading: () => const SkeletonList(rows: 6, rowHeight: 72),
                  error: (e, _) => ListView(
                    children: [
                      AppErrorView(
                        e,
                        onRetry: () => ref.invalidate(notificationFeedProvider),
                      ),
                    ],
                  ),
                  data: (f) {
                    final items = switch (_filter) {
                      'auctions' =>
                        f.items.where((n) => _kAuctionCats.contains(n.category)).toList(),
                      'promo' =>
                        f.items.where((n) => _kPromoCats.contains(n.category)).toList(),
                      _ => f.items,
                    };
                    if (items.isEmpty) {
                      return ListView(
                        children: const [
                          SizedBox(height: 100),
                          EmptyState(
                            icon: AppIcons.notifications_none,
                            title: 'Nothing here yet',
                          ),
                        ],
                      );
                    }
                    return ListView.separated(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpace.s16,
                        AppSpace.s4,
                        AppSpace.s16,
                        AppSpace.s24,
                      ),
                      itemCount: items.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: AppSpace.s10),
                      itemBuilder: (_, i) {
                        final n = items[i];
                        return AppCard(
                          elevated: !n.read,
                          onTap: () async {
                            if (!n.read) {
                              await ref
                                  .read(stallApiProvider)
                                  .markNotificationRead(n.id);
                              ref.invalidate(notificationFeedProvider);
                            }
                          },
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: n.read
                                      ? c.surfaceSunken
                                      : c.primaryContainer,
                                  borderRadius: BorderRadius.circular(
                                    AppRadius.md,
                                  ),
                                ),
                                child: Icon(
                                  _icon(n.category),
                                  size: 16,
                                  color: n.read
                                      ? c.textMed
                                      : c.onPrimaryContainer,
                                ),
                              ),
                              const SizedBox(width: AppSpace.s12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            n.title,
                                            style: context.text.titleSmall
                                                ?.copyWith(
                                                  fontWeight: n.read
                                                      ? FontWeight.w600
                                                      : FontWeight.w800,
                                                ),
                                          ),
                                        ),
                                        Text(
                                          _ago(n.at),
                                          style: context.text.labelSmall
                                              ?.copyWith(color: c.textLow),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      n.body,
                                      style: context.text.bodyMedium?.copyWith(
                                        color: c.textMed,
                                      ),
                                    ),
                                  ],
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
            ),
          ],
        ),
      ),
    );
  }

  IconData _icon(String cat) => switch (cat) {
    'ORDER' => AppIcons.receipt_long,
    'PAYMENT' => AppIcons.payments_outlined,
    'DELIVERY' => AppIcons.local_shipping_outlined,
    'COURIER' => AppIcons.delivery_dining,
    'AUCTION' || 'TICKET' => AppIcons.emoji_events_outlined,
    'COUPON' || 'PROMO' => AppIcons.local_offer_outlined,
    'SECURITY' => AppIcons.shield_outlined,
    'CHAT' || 'SUPPORT' => AppIcons.forum_outlined,
    _ => AppIcons.notifications_none,
  };

  String _ago(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'now';
    if (d.inHours < 1) return '${d.inMinutes}m';
    if (d.inDays < 1) return '${d.inHours}h';
    return '${d.inDays}d';
  }
}

class NotificationPrefsSheet extends ConsumerWidget {
  const NotificationPrefsSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final prefs = ref.watch(notificationPrefsProvider);
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16,
        top: AppSpace.s16,
        left: AppSpace.s16,
        right: AppSpace.s16,
      ),
      child: prefs.when(
        loading: () => const SizedBox(
          height: 160,
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (e, _) => Text('$e'),
        data: (list) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Notification preferences', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s16),
            Flexible(
              child: SingleChildScrollView(
                child: AppCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        _NotificationPrefRow(
                          pref: list[i],
                          onChanged: (v) async {
                            await ref
                                .read(stallApiProvider)
                                .setNotificationPreference(
                                  list[i].category,
                                  push: v,
                                );
                            ref.invalidate(notificationPrefsProvider);
                          },
                        ),
                        if (i != list.length - 1)
                          Divider(
                            height: 1,
                            thickness: 1,
                            color: c.border.withValues(alpha: 0.6),
                            indent: AppSpace.s16,
                            endIndent: AppSpace.s16,
                          ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotificationPrefRow extends StatelessWidget {
  const _NotificationPrefRow({required this.pref, required this.onChanged});
  final NotificationPrefDto pref;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.s16,
        vertical: AppSpace.s12,
      ),
      child: Row(
        children: [
          Icon(AppIcons.notifications_none, size: 18, color: c.textHi),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pref.category[0] + pref.category.substring(1).toLowerCase(),
                  style: context.text.titleSmall,
                ),
                const SizedBox(height: 2),
                Text(
                  'Push${pref.email ? ' · Email' : ''}${pref.sms ? ' · SMS' : ''}',
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
              ],
            ),
          ),
          Switch(value: pref.push, onChanged: onChanged),
        ],
      ),
    );
  }
}
