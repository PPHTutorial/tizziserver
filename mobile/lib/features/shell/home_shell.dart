import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models.dart';
import '../../app/providers.dart';
import '../../app/router.dart';
import '../../design/context_ext.dart';
import '../../design/responsive.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';
import '../auth/screens/select_role_screen.dart';
import '../auth/security_actions.dart';
import '../catalog/screens/catalog_home_body.dart';
import '../catalog/screens/vendor_hub_screen.dart';
import '../commerce/commerce_providers.dart';
import '../comms/comms_providers.dart';
import '../courier/screens/active_delivery_screen.dart';
import '../courier/screens/courier_dashboard_screen.dart';
import '../courier/screens/courier_earnings_screen.dart';
import '../courier/screens/courier_jobs_screen.dart';
import '../courier/screens/courier_profile_screen.dart';
import '../selling/screens/vendor_orders_screen.dart';
import 'app_bottom_nav.dart';
import '../../design/icons.dart';

/// Post-auth landing. Phase 1 ships the shell + server-driven nav + the account
/// tab (security, 2FA, PIN, password, logout). Feature tabs arrive in Phase 2+.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(bootstrapProvider);
    final c = context.colors;
    ref.watch(commsLiveSyncProvider); // live inbox + notification-bell updates

    return async.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        backgroundColor: c.bg,
        body: CenteredState.error(
          title: 'Couldn\'t reach Stall',
          body: 'Check your connection and try again.',
          action: PrimaryButton(
            label: 'Retry',
            onPressed: () => ref.invalidate(bootstrapProvider),
          ),
        ),
      ),
      data: (boot) {
        final nav = boot.nav;
        final index = _index.clamp(0, nav.isEmpty ? 0 : nav.length - 1);
        final current = nav.isEmpty ? null : nav[index];
        final key = current?.key ?? 'home';

        final body = switch (key) {
          'profile' when boot.activeRole == 'COURIER' => const CourierProfileBody(),
          'profile' => _AccountTab(boot: boot),
          'home' when boot.activeRole == 'CUSTOMER' =>
            CatalogHomeBody(platformName: boot.platform.name),
          'home' when boot.activeRole == 'COURIER' => const CourierDashboardBody(),
          'jobs' => const CourierJobsBody(),
          'active' => const CourierActiveBody(),
          'earnings' => const CourierEarningsBody(),
          'explore' => const CatalogExploreBody(),
          'orders' when boot.activeRole == 'VENDOR' => const VendorOrdersBody(),
          'dashboard' || 'products' => const VendorHubBody(),
          _ => _PlaceholderTab(boot: boot, navKey: key),
        };

        // §30 — a nav rail replaces the bottom bar on tablet-width viewports.
        final wide = context.isWide && nav.length >= 2;

        return Scaffold(
          backgroundColor: c.bg,
          appBar: AppBar(
            title: Text(current?.label ?? boot.platform.name),
            centerTitle: false,
            actions: [
              const _NotificationsAction(),
              IconButton(
                icon: const Icon(AppIcons.forum_outlined),
                tooltip: 'Inbox',
                onPressed: () => context.push(RoutePaths.inbox),
              ),
              if (boot.activeRole == 'CUSTOMER') const _CartAction(),
            ],
          ),
          body: wide
              ? Row(
                  children: [
                    NavigationRail(
                      selectedIndex: index,
                      onDestinationSelected: (i) => setState(() => _index = i),
                      labelType: NavigationRailLabelType.all,
                      backgroundColor: c.surface,
                      destinations: [
                        for (final item in nav)
                          NavigationRailDestination(
                            icon: Icon(navIconFor(item.icon), size: 20),
                            label: Text(item.label),
                          ),
                      ],
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(child: body),
                  ],
                )
              : body,
          bottomNavigationBar: wide
              ? null
              : AppBottomNav(
                  items: nav,
                  currentIndex: index,
                  onTap: (i) => setState(() => _index = i),
                ),
        );
      },
    );
  }
}

class _NotificationsAction extends ConsumerWidget {
  const _NotificationsAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider);
    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(
          icon: const Icon(AppIcons.notifications_none),
          tooltip: 'Notifications',
          onPressed: () => context.push(RoutePaths.notifications),
        ),
        if (unread > 0)
          Positioned(
            right: 6,
            top: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: context.colors.primary,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(unread > 9 ? '9+' : '$unread',
                  style: context.text.labelSmall?.copyWith(color: context.colors.onPrimary)),
            ),
          ),
      ],
    );
  }
}

class _CartAction extends ConsumerWidget {
  const _CartAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartCountProvider);
    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(
          icon: const Icon(AppIcons.shopping_cart_outlined),
          onPressed: () => context.push(RoutePaths.cart),
        ),
        if (count > 0)
          Positioned(
            right: 6,
            top: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: context.colors.primary,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text('$count',
                  style: context.text.labelSmall?.copyWith(color: context.colors.onPrimary)),
            ),
          ),
      ],
    );
  }
}

class _PlaceholderTab extends StatelessWidget {
  const _PlaceholderTab({required this.boot, required this.navKey});

  final Bootstrap boot;
  final String navKey;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.s32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('“$navKey” lands in a later phase',
                textAlign: TextAlign.center, style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            Text(
              'Tenant: ${boot.platform.name} · auction ${boot.hasFeature('auction') ? 'enabled' : 'disabled'} · '
              'catalog ${boot.features['catalog.scope'] ?? 'all'}',
              textAlign: TextAlign.center,
              style: context.text.bodyMedium?.copyWith(color: c.textMed),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountTab extends ConsumerWidget {
  const _AccountTab({required this.boot});

  final Bootstrap boot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final c = context.colors;

    return ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: c.primaryContainer,
              child: Text(
                (auth.user?.displayName ?? 'A').characters.first.toUpperCase(),
                style: context.text.titleLarge?.copyWith(color: c.onPrimaryContainer),
              ),
            ),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(auth.user?.displayName ?? 'Your account',
                      style: context.text.titleMedium),
                  Text('Acting as ${auth.activeRole ?? 'CUSTOMER'}',
                      style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s20),
        if (auth.roles.length > 1)
          _Tile(
            icon: AppIcons.swap_horiz,
            label: 'Switch role',
            onTap: () => showRoleSwitcher(context, ref),
          ),
        _Tile(
          icon: AppIcons.storefront_outlined,
          label: 'Sell on Stall',
          onTap: () => context.push(RoutePaths.sell),
        ),
        if (auth.activeRole == 'VENDOR') ...[
          if (boot.hasFeature('advertising'))
            _Tile(
              icon: AppIcons.campaign_outlined,
              label: 'Advertising',
              onTap: () => context.push(RoutePaths.advertising),
            ),
          _Tile(
            icon: AppIcons.insights_outlined,
            label: 'Analytics',
            onTap: () => context.push(RoutePaths.vendorAnalytics),
          ),
        ],
        if (auth.activeRole == 'COURIER')
          _Tile(
            icon: AppIcons.timeline_outlined,
            label: 'Performance history',
            onTap: () => context.push(RoutePaths.courierHistory),
          ),
        _Tile(
          icon: AppIcons.card_giftcard_outlined,
          label: 'Refer & earn',
          onTap: () => context.push(RoutePaths.referrals),
        ),
        _Tile(
          icon: AppIcons.receipt_long_outlined,
          label: 'My orders',
          onTap: () => context.push(RoutePaths.orders),
        ),
        _Tile(
          icon: AppIcons.account_balance_wallet_outlined,
          label: 'Wallet',
          onTap: () => context.push(RoutePaths.wallet),
        ),
        _Tile(
          icon: AppIcons.credit_card,
          label: 'Payment methods',
          onTap: () => context.push(RoutePaths.paymentMethods),
        ),
        _Tile(
          icon: AppIcons.local_offer_outlined,
          label: 'Coupons',
          onTap: () => context.push(RoutePaths.coupons),
        ),
        if (boot.hasFeature('auction')) ...[
          _Tile(
            icon: AppIcons.emoji_events_outlined,
            label: 'Inverse Draws',
            onTap: () => context.push(RoutePaths.auctions),
          ),
          _Tile(
            icon: AppIcons.confirmation_number_outlined,
            label: 'My tickets',
            onTap: () => context.push(RoutePaths.myTickets),
          ),
        ],
        _Tile(
          icon: AppIcons.location_on_outlined,
          label: 'Addresses',
          onTap: () => context.push(RoutePaths.addresses),
        ),
        _Tile(
          icon: AppIcons.favorite_border,
          label: 'Wishlist',
          onTap: () => context.push(RoutePaths.wishlist),
        ),
        _Tile(
          icon: AppIcons.forum_outlined,
          label: 'Messages',
          onTap: () => context.push(RoutePaths.inbox),
        ),
        _Tile(
          icon: AppIcons.gavel_outlined,
          label: 'Disputes',
          onTap: () => context.push(RoutePaths.disputes),
        ),
        _Tile(
          icon: AppIcons.support_agent_outlined,
          label: 'Help & support',
          onTap: () => context.push(RoutePaths.support),
        ),
        _Tile(
          icon: AppIcons.security,
          label: 'Security centre',
          onTap: () => context.push(RoutePaths.securityCentre),
        ),
        _Tile(
          icon: AppIcons.devices,
          label: 'Signed-in devices',
          onTap: () => context.push(RoutePaths.sessions),
        ),
        _Tile(
          icon: AppIcons.password,
          label: 'Set a password',
          onTap: () => context.push(RoutePaths.createPassword),
        ),
        _Tile(
          icon: AppIcons.pin_outlined,
          label: 'Set transaction PIN',
          onTap: () => setTransactionPin(context, ref),
        ),
        _Tile(
          icon: AppIcons.shield_outlined,
          label: 'Enable two-factor',
          onTap: () => enrollTwoFactor(context, ref),
        ),
        const SizedBox(height: AppSpace.s20),
        SecondaryButton(
          label: 'Sign out',
          onPressed: () async {
            await ref.read(authControllerProvider.notifier).logout();
            if (context.mounted) context.go(RoutePaths.welcome);
          },
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: c.textMed),
      title: Text(label, style: context.text.bodyLarge),
      trailing: Icon(AppIcons.chevron_right, color: c.textLow),
      onTap: onTap,
    );
  }
}
