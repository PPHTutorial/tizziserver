import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../comms_providers.dart';
import '../../../design/icons.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final feed = ref.watch(notificationFeedProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            tooltip: 'Preferences',
            icon: const Icon(AppIcons.tune),
            onPressed: () => showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => const _PrefsSheet()),
          ),
          TextButton(
            onPressed: () async {
              await ref.read(stallApiProvider).markAllNotificationsRead();
              ref.invalidate(notificationFeedProvider);
            },
            child: const Text('Read all'),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(notificationFeedProvider);
            await ref.read(notificationFeedProvider.future);
          },
          child: feed.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('$e')),
            data: (f) {
              if (f.items.isEmpty) {
                return ListView(children: [
                  const SizedBox(height: 140),
                  Icon(AppIcons.notifications_none, size: 48, color: c.textLow),
                  const SizedBox(height: AppSpace.s8),
                  Center(child: Text('Nothing here yet', style: context.text.bodyMedium)),
                ]);
              }
              return ListView.separated(
                itemCount: f.items.length,
                separatorBuilder: (_, __) => Divider(height: 1, color: c.border),
                itemBuilder: (_, i) {
                  final n = f.items[i];
                  return ListTile(
                    leading: Icon(_icon(n.category), color: n.read ? c.textLow : c.primary),
                    title: Text(n.title, style: context.text.bodyLarge?.copyWith(fontWeight: n.read ? FontWeight.normal : FontWeight.w600)),
                    subtitle: Text(n.body, style: context.text.bodySmall?.copyWith(color: c.textMed)),
                    trailing: Text(_ago(n.at), style: context.text.labelSmall?.copyWith(color: c.textLow)),
                    onTap: () async {
                      if (!n.read) {
                        await ref.read(stallApiProvider).markNotificationRead(n.id);
                        ref.invalidate(notificationFeedProvider);
                      }
                    },
                  );
                },
              );
            },
          ),
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

class _PrefsSheet extends ConsumerWidget {
  const _PrefsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(notificationPrefsProvider);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16, top: AppSpace.s16, left: AppSpace.s16, right: AppSpace.s16),
      child: prefs.when(
        loading: () => const SizedBox(height: 160, child: Center(child: CircularProgressIndicator())),
        error: (e, _) => Text('$e'),
        data: (list) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Notification preferences', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: list
                    .map((p) => SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(p.category[0] + p.category.substring(1).toLowerCase()),
                          subtitle: Text('Push${p.email ? ' · Email' : ''}${p.sms ? ' · SMS' : ''}',
                              style: context.text.bodySmall?.copyWith(color: context.colors.textMed)),
                          value: p.push,
                          onChanged: (v) async {
                            await ref.read(stallApiProvider).setNotificationPreference(p.category, push: v);
                            ref.invalidate(notificationPrefsProvider);
                          },
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
