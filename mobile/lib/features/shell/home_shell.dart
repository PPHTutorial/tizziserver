import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/catalog_models.dart' show formatMoney;
import '../../api/models.dart';
import '../../app/providers.dart';
import '../../app/router.dart';
import '../auctions/auction_providers.dart';
import '../../design/components.dart';
import '../../design/context_ext.dart';
import '../../design/responsive.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';
import '../auth/screens/select_role_screen.dart';
import '../auth/security_actions.dart';
import '../catalog/screens/catalog_home_body.dart';
import '../catalog/screens/vendor_hub_screen.dart';
import '../commerce/commerce_providers.dart';
import '../commerce/screens/cart_screen.dart';
import '../commerce/screens/orders_screen.dart';
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
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
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
          'profile' when boot.activeRole == 'COURIER' =>
            const CourierProfileBody(),
          'profile' => _AccountTab(boot: boot),
          'home' when boot.activeRole == 'CUSTOMER' => CatalogHomeBody(
            platformName: boot.platform.name,
          ),
          'home' when boot.activeRole == 'COURIER' =>
            const CourierDashboardBody(),
          'jobs' => const CourierJobsBody(),
          'active' => const CourierActiveBody(),
          'earnings' => const CourierEarningsBody(),
          'explore' => const CatalogExploreBody(),
          'cart' => const CartBody(),
          'orders' when boot.activeRole == 'VENDOR' => const VendorOrdersBody(),
          'orders' => const OrdersBody(),
          'dashboard' || 'products' => const VendorHubBody(),
          _ => _PlaceholderTab(boot: boot, navKey: key),
        };

        // §30 — a nav rail replaces the bottom bar on tablet-width viewports.
        final wide = context.isWide && nav.length >= 2;

        // Home wears its own brand header (wordmark + cart, per Figma's
        // `home-discover` frame — no bell/chat there); every other tab gets a
        // plain AppScreenHeader with its nav label. Notifications/Messages
        // move to the Account tab instead of living in a persistent app-bar.
        final isHome = (current?.key ?? 'home') == 'home';
        final header = isHome
            ? _HomeHeader(
                platformName: boot.platform.name,
                showCart: boot.activeRole == 'CUSTOMER',
              )
            : AppScreenHeader(
                current?.label ?? boot.platform.name,
                showBack: false,
              );
        final content = Column(
          children: [
            header,
            Expanded(child: body),
          ],
        );

        return Scaffold(
          backgroundColor: c.bg,
          body: SafeArea(
            child: wide
                ? Row(
                    children: [
                      NavigationRail(
                        selectedIndex: index,
                        onDestinationSelected: (i) =>
                            setState(() => _index = i),
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
                      Expanded(child: content),
                    ],
                  )
                : content,
          ),
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

/// Home's own header — brand wordmark + (customer-only) cart button, matching
/// Figma's `home-discover` frame exactly (no bell/chat there; those moved to
/// the Account tab's list rows).
class _HomeHeader extends StatelessWidget {
  const _HomeHeader({required this.platformName, required this.showCart});
  final String platformName;
  final bool showCart;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.s16,
        AppSpace.s8,
        AppSpace.s12,
        AppSpace.s8,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              platformName,
              style: context.text.displayLarge?.copyWith(fontSize: 26),
            ),
          ),
          if (showCart) const _CartAction(),
        ],
      ),
    );
  }
}

class _CartAction extends ConsumerWidget {
  const _CartAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final count = ref.watch(cartCountProvider);
    return Stack(
      alignment: Alignment.center,
      children: [
        Material(
          color: c.surface,
          shape: CircleBorder(
            side: BorderSide(color: c.border.withValues(alpha: 0.5)),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => context.push(RoutePaths.cart),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                AppIcons.shopping_cart_outlined,
                size: 18,
                color: c.textHi,
              ),
            ),
          ),
        ),
        if (count > 0)
          Positioned(
            right: 0,
            top: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: c.primary,
                borderRadius: BorderRadius.circular(AppRadius.pill),
                border: Border.all(color: c.bg, width: 1.5),
              ),
              child: Text(
                '$count',
                style: context.text.labelSmall?.copyWith(color: c.onPrimary),
              ),
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
            Text(
              '“$navKey” lands in a later phase',
              textAlign: TextAlign.center,
              style: context.text.titleMedium,
            ),
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

/// The account's real `UserStatus`, not a decorative always-on "VERIFIED".
class _AccountStatusBadge extends StatelessWidget {
  const _AccountStatusBadge({required this.status});
  final String? status;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = switch (status) {
      'ACTIVE' => ('ACTIVE', BadgeTone.success),
      'PENDING_VERIFICATION' => ('PENDING VERIFICATION', BadgeTone.warning),
      'SUSPENDED' => ('SUSPENDED', BadgeTone.danger),
      'BANNED' => ('BANNED', BadgeTone.danger),
      'INACTIVE' => ('INACTIVE', BadgeTone.neutral),
      _ => (null, BadgeTone.neutral),
    };
    if (label == null) return const SizedBox.shrink();
    return StatusBadge(label, tone: tone);
  }
}

/// Total Tickets / Amount Won / Active Entries — Figma's `profile-screen`
/// frame designs this row; nothing computed it before since every existing
/// ticket/win endpoint was scoped to one auction, not aggregated across all
/// of the user's draws.
class _TicketStatsCard extends ConsumerWidget {
  const _TicketStatsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(myTicketStatsProvider);
    return stats.maybeWhen(
      data: (s) => AppCard(
        child: Row(
          children: [
            Expanded(
              child: _Stat(value: '${s.totalTickets}', label: 'Total tickets'),
            ),
            Expanded(
              child: _Stat(
                value: formatMoney(s.amountWonMinor, s.currency),
                label: 'Amount won',
              ),
            ),
            Expanded(
              child: _Stat(
                value: '${s.activeEntries}',
                label: 'Active entries',
              ),
            ),
          ],
        ),
      ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(value, style: context.text.titleLarge),
      const SizedBox(height: 2),
      Text(
        label,
        style: context.text.labelSmall?.copyWith(
          color: context.colors.textMed,
        ),
        textAlign: TextAlign.center,
      ),
    ],
  );
}

class _AccountTab extends ConsumerWidget {
  const _AccountTab({required this.boot});

  final Bootstrap boot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final c = context.colors;
    final role = auth.activeRole ?? 'CUSTOMER';

    List<Widget> divided(List<Widget> rows) {
      final out = <Widget>[];
      for (var i = 0; i < rows.length; i++) {
        out.add(rows[i]);
        if (i != rows.length - 1) {
          out.add(
            Divider(
              height: 1,
              thickness: 1,
              color: c.border.withValues(alpha: 0.6),
              indent: AppSpace.s16,
              endIndent: AppSpace.s16,
            ),
          );
        }
      }
      return out;
    }

    final shopping = <Widget>[
      AppListRow(
        icon: AppIcons.receipt_long_outlined,
        label: 'My orders',
        onTap: () => context.push(RoutePaths.orders),
      ),
      AppListRow(
        icon: AppIcons.account_balance_wallet_outlined,
        label: 'Wallet',
        onTap: () => context.push(RoutePaths.wallet),
      ),
      AppListRow(
        icon: AppIcons.credit_card,
        label: 'Payment methods',
        onTap: () => context.push(RoutePaths.paymentMethods),
      ),
      AppListRow(
        icon: AppIcons.local_offer_outlined,
        label: 'Coupons',
        onTap: () => context.push(RoutePaths.coupons),
      ),
      AppListRow(
        icon: AppIcons.location_on_outlined,
        label: 'Addresses',
        onTap: () => context.push(RoutePaths.addresses),
      ),
      AppListRow(
        icon: AppIcons.favorite_border,
        label: 'Wishlist',
        onTap: () => context.push(RoutePaths.wishlist),
      ),
      AppListRow(
        icon: AppIcons.card_giftcard_outlined,
        label: 'Refer & earn',
        onTap: () => context.push(RoutePaths.referrals),
      ),
    ];

    final selling = <Widget>[
      AppListRow(
        icon: AppIcons.storefront_outlined,
        label: 'Sell on Stall',
        onTap: () => context.push(RoutePaths.sell),
      ),
      if (role == 'VENDOR' && boot.hasFeature('advertising'))
        AppListRow(
          icon: AppIcons.campaign_outlined,
          label: 'Advertising',
          onTap: () => context.push(RoutePaths.advertising),
        ),
      if (role == 'VENDOR')
        AppListRow(
          icon: AppIcons.insights_outlined,
          label: 'Analytics',
          onTap: () => context.push(RoutePaths.vendorAnalytics),
        ),
      if (role == 'COURIER')
        AppListRow(
          icon: AppIcons.timeline_outlined,
          label: 'Performance history',
          onTap: () => context.push(RoutePaths.courierHistory),
        ),
    ];

    final play = <Widget>[
      if (boot.hasFeature('auction')) ...[
        AppListRow(
          icon: AppIcons.emoji_events_outlined,
          label: 'Inverse Draws',
          onTap: () => context.push(RoutePaths.auctions),
        ),
        AppListRow(
          icon: AppIcons.confirmation_number_outlined,
          label: 'My tickets',
          onTap: () => context.push(RoutePaths.myTickets),
        ),
      ],
    ];

    final account = <Widget>[
      AppListRow(
        icon: AppIcons.settings_outlined,
        label: 'Settings',
        onTap: () => context.push(RoutePaths.settings),
      ),
      if (auth.roles.length > 1)
        AppListRow(
          icon: AppIcons.swap_horiz,
          label: 'Switch role',
          onTap: () => showRoleSwitcher(context, ref),
        ),
      AppListRow(
        icon: AppIcons.forum_outlined,
        label: 'Messages',
        onTap: () => context.push(RoutePaths.inbox),
      ),
      AppListRow(
        icon: AppIcons.notifications_none,
        label: 'Notifications',
        onTap: () => context.push(RoutePaths.notifications),
      ),
      AppListRow(
        icon: AppIcons.gavel_outlined,
        label: 'Disputes',
        onTap: () => context.push(RoutePaths.disputes),
      ),
      AppListRow(
        icon: AppIcons.support_agent_outlined,
        label: 'Help & support',
        onTap: () => context.push(RoutePaths.support),
      ),
      AppListRow(
        icon: AppIcons.security,
        label: 'Security centre',
        onTap: () => context.push(RoutePaths.securityCentre),
      ),
      AppListRow(
        icon: AppIcons.devices,
        label: 'Signed-in devices',
        onTap: () => context.push(RoutePaths.sessions),
      ),
      AppListRow(
        icon: AppIcons.password,
        label: 'Set a password',
        onTap: () => context.push(RoutePaths.createPassword),
      ),
      AppListRow(
        icon: AppIcons.pin_outlined,
        label: 'Set transaction PIN',
        onTap: () => setTransactionPin(context, ref),
      ),
      AppListRow(
        icon: AppIcons.shield_outlined,
        label: 'Enable two-factor',
        onTap: () => enrollTwoFactor(context, ref),
      ),
    ];

    Widget section(List<Widget> rows) => rows.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(bottom: AppSpace.s12),
            child: AppCard(
              padding: EdgeInsets.zero,
              child: Column(children: divided(rows)),
            ),
          );

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.s16,
        AppSpace.s4,
        AppSpace.s16,
        AppSpace.s24,
      ),
      children: [
        AppCard(
          onTap: () => context.push(RoutePaths.editProfile),
          child: Row(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: c.primaryContainer,
                child: Text(
                  (auth.user?.displayName ?? 'A').characters.first
                      .toUpperCase(),
                  style: context.text.headlineMedium?.copyWith(
                    color: c.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(width: AppSpace.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            auth.user?.displayName ?? 'Your account',
                            style: context.text.titleLarge,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: AppSpace.s8),
                        _AccountStatusBadge(status: auth.user?.status),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Acting as ${role[0]}${role.substring(1).toLowerCase()}',
                      style: context.text.bodyMedium?.copyWith(
                        color: c.textMed,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(AppIcons.chevron_right, color: c.textLow, size: 18),
            ],
          ),
        ),
        if (boot.hasFeature('auction')) ...[
          const SizedBox(height: AppSpace.s12),
          const _TicketStatsCard(),
        ],
        const SizedBox(height: AppSpace.s12),
        section(shopping),
        section(selling),
        section(play),
        section(account),
        AppCard(
          padding: EdgeInsets.zero,
          child: AppListRow(
            icon: AppIcons.logout,
            label: 'Log out',
            tint: c.primary,
            showChevron: false,
            onTap: () async {
              await ref.read(authControllerProvider.notifier).logout();
              if (context.mounted) context.go(RoutePaths.welcome);
            },
          ),
        ),
      ],
    );
  }
}
