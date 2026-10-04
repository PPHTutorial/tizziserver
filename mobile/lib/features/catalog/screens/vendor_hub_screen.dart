import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../api/commerce_models.dart' show SellerOrderDto;
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../selling/selling_providers.dart' show sellerOrdersProvider;
import '../../selling/screens/vendor_orders_screen.dart' show SellerStatusPill;
import '../catalog_providers.dart';
import 'sell_onboarding.dart';
import '../../../design/icons.dart';

/// §25 (vendor) screens 435–462 subset — the seller hub: onboarding →
/// KYC-pending → product management. Used both as a pushed screen and a
/// HomeShell tab body ([VendorHubBody]).
class VendorHubScreen extends ConsumerWidget {
  const VendorHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final platformName =
        ref.watch(bootstrapProvider).valueOrNull?.platform.name ?? 'Stall';
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader('Sell on $platformName'),
            const Expanded(child: VendorHubBody()),
          ],
        ),
      ),
    );
  }
}

class VendorHubBody extends ConsumerWidget {
  const VendorHubBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vendorStatusProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => CenteredState.error(
        title: 'Couldn\'t load your seller account',
        action: PrimaryButton(
          label: 'Retry',
          onPressed: () => ref.invalidate(vendorStatusProvider),
        ),
      ),
      data: (status) {
        if (!status.onboarded) {
          return SellOnboardingFlow(
            onDone: () => ref.invalidate(vendorStatusProvider),
          );
        }
        if (status.isApproved) return const VendorDashboardBody();
        return _KycPending(status: status);
      },
    );
  }
}

class _KycPending extends StatelessWidget {
  const _KycPending({required this.status});
  final VendorStatus status;

  @override
  Widget build(BuildContext context) {
    final rejected = status.kycStatus == 'REJECTED';
    return CenteredState(
      icon: rejected ? AppIcons.gpp_bad : AppIcons.hourglass_top,
      title: rejected
          ? 'Your application needs changes'
          : 'We\'re reviewing your application',
      body: rejected
          ? (status.note ?? 'Please review your business details and resubmit.')
          : 'This usually takes under a business day. You\'ll be able to list products once approved.',
    );
  }
}

/// Pushable wrapper for [VendorDashboardBody] — lets a deep link (or the
/// storefront's own CTAs) reach the seller overview without switching bottom
/// tabs.
class VendorDashboardScreen extends StatelessWidget {
  const VendorDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.colors.bg,
    body: const SafeArea(
      child: Column(
        children: [
          AppScreenHeader('Dashboard'),
          Expanded(child: VendorDashboardBody()),
        ],
      ),
    ),
  );
}

/// The approved vendor's overview — stats, quick links into the other seller
/// screens, and a peek at the most recent incoming orders. No product
/// inventory here; that split out into [VendorProductsBody] since this
/// screen and the full inventory list used to be one long scrolling body.
/// Embedded as the VENDOR nav's "dashboard" tab, and as [VendorHubBody]'s
/// terminal state once a CUSTOMER-role seller is onboarded + approved.
class VendorDashboardBody extends ConsumerWidget {
  const VendorDashboardBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(vendorStatsProvider);
        ref.invalidate(sellerOrdersProvider(null));
      },
      child: ListView(
        padding: const EdgeInsets.all(AppSpace.s16),
        children: [
          const _StatsCard(),
          const SizedBox(height: AppSpace.s20),
          Text('Quick links', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s10),
          const _QuickLinkGrid(),
          const SizedBox(height: AppSpace.s8),
          TextButton.icon(
            onPressed: () => context.push(RoutePaths.sellProfile),
            icon: const Icon(AppIcons.storefront_outlined, size: 18),
            label: const Text('Edit shop profile'),
          ),
          TextButton.icon(
            onPressed: () => context.push(RoutePaths.sellDocuments),
            icon: const Icon(AppIcons.description_outlined, size: 18),
            label: const Text('Verification'),
          ),
          const SizedBox(height: AppSpace.s16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Recent orders', style: context.text.titleMedium),
              TextButton(
                onPressed: () => context.push(RoutePaths.sellOrders),
                child: const Text('See all'),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s8),
          const _RecentOrdersPreview(),
        ],
      ),
    );
  }
}

/// Two rows of tappable cards into the other seller screens — Products,
/// Orders, Analytics, Wallet.
class _QuickLinkGrid extends StatelessWidget {
  const _QuickLinkGrid();

  @override
  Widget build(BuildContext context) {
    Widget link(IconData icon, String label, String route) => Expanded(
      child: AppCard(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.s12,
          vertical: AppSpace.s14,
        ),
        onTap: () => context.push(route),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: context.colors.primary),
            const SizedBox(width: AppSpace.s8),
            Flexible(
              child: Text(
                label,
                style: context.text.titleSmall,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
    return Column(
      children: [
        Row(
          children: [
            link(
              AppIcons.inventory_2_outlined,
              'Products',
              RoutePaths.sellProducts,
            ),
            const SizedBox(width: AppSpace.s12),
            link(
              AppIcons.receipt_long_outlined,
              'Orders',
              RoutePaths.sellOrders,
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s12),
        Row(
          children: [
            link(
              AppIcons.insights_outlined,
              'Analytics',
              RoutePaths.vendorAnalytics,
            ),
            const SizedBox(width: AppSpace.s12),
            link(
              AppIcons.account_balance_wallet_outlined,
              'Wallet',
              RoutePaths.vendorWallet,
            ),
          ],
        ),
      ],
    );
  }
}

/// A cheap peek at the seller's most recent orders — reuses the very same
/// [sellerOrdersProvider] the Orders tab fetches (just trimmed to 3 rows),
/// so this preview never triggers a network call of its own.
class _RecentOrdersPreview extends ConsumerWidget {
  const _RecentOrdersPreview();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sellerOrdersProvider(null));
    return async.when(
      loading: () => const SkeletonList(rows: 3, rowHeight: 64),
      // A preview shouldn't block the whole dashboard on an orders-fetch
      // error — "See all" above still reaches the full list (with retry).
      error: (e, _) => const SizedBox.shrink(),
      data: (list) {
        if (list.isEmpty) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpace.s16),
            child: EmptyState(
              icon: AppIcons.receipt_long_outlined,
              title: 'No orders yet',
              message: 'Orders from shoppers will show up here.',
            ),
          );
        }
        return Column(
          children: [for (final o in list.take(3)) _RecentOrderRow(order: o)],
        );
      },
    );
  }
}

class _RecentOrderRow extends StatelessWidget {
  const _RecentOrderRow({required this.order});
  final SellerOrderDto order;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s10),
      child: AppCard(
        onTap: () => context.push(RoutePaths.sellOrder(order.id)),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(order.orderNumber, style: context.text.titleSmall),
                  const SizedBox(height: 2),
                  Text(
                    formatMoney(order.payoutMinor, order.currency),
                    style: context.text.bodySmall?.copyWith(color: c.textMed),
                  ),
                ],
              ),
            ),
            SellerStatusPill(status: order.status),
          ],
        ),
      ),
    );
  }
}

/// Pushable wrapper for [VendorProductsBody] — e.g. the storefront's own
/// "empty shop" CTA reaches this directly rather than switching bottom tabs.
class VendorProductsScreen extends StatelessWidget {
  const VendorProductsScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.colors.bg,
    body: const SafeArea(
      child: Column(
        children: [
          AppScreenHeader('Products'),
          Expanded(child: VendorProductsBody()),
        ],
      ),
    ),
  );
}

const _inventoryTabs = <(String, String)>[
  ('all', 'All'),
  ('active', 'Active'),
  ('paused', 'Paused'),
];

/// The vendor's full inventory — search, All/Active/Paused tabs, "Add
/// product". Split out of the old combined seller-dashboard screen so the
/// VENDOR nav's "products" tab (and this pushable wrapper) show inventory
/// only; [VendorDashboardBody] carries the stats/quick-links overview.
class VendorProductsBody extends ConsumerStatefulWidget {
  const VendorProductsBody({super.key});

  @override
  ConsumerState<VendorProductsBody> createState() =>
      _VendorProductsBodyState();
}

class _VendorProductsBodyState extends ConsumerState<VendorProductsBody> {
  String _tab = 'all';
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(myProductsProvider(null));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myProductsProvider(null)),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [
            const SizedBox(height: 120),
            CenteredState.error(
              title: 'Couldn\'t load your products',
              action: PrimaryButton(
                label: 'Retry',
                onPressed: () => ref.invalidate(myProductsProvider(null)),
              ),
            ),
          ],
        ),
        data: (items) {
          final counts = {
            'all': items.length,
            'active': items.where((p) => p.offerStatus == 'ACTIVE').length,
            'paused': items.where((p) => p.offerStatus == 'PAUSED').length,
          };
          var visible = switch (_tab) {
            'active' => items.where((p) => p.offerStatus == 'ACTIVE').toList(),
            'paused' => items.where((p) => p.offerStatus == 'PAUSED').toList(),
            _ => items,
          };
          final q = _query.trim().toLowerCase();
          if (q.isNotEmpty) {
            visible = visible
                .where((p) => p.title.toLowerCase().contains(q))
                .toList();
          }
          return ListView(
            padding: const EdgeInsets.all(AppSpace.s16),
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Your products', style: context.text.titleMedium),
                  FilledButton.icon(
                    onPressed: () => context.push(RoutePaths.newProduct),
                    icon: const Icon(AppIcons.add, size: 18),
                    label: const Text('Add'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 40),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.s12),
              AppField(
                label: 'Search',
                hintText: 'Search your products',
                controller: _search,
                prefix: const Icon(AppIcons.search, size: 16),
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: AppSpace.s12),
              Row(
                children: [
                  for (final (value, label) in _inventoryTabs) ...[
                    ChoiceChip(
                      label: Text('$label (${counts[value]})'),
                      selected: _tab == value,
                      onSelected: (_) => setState(() => _tab = value),
                    ),
                    const SizedBox(width: AppSpace.s8),
                  ],
                ],
              ),
              const SizedBox(height: AppSpace.s12),
              if (visible.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpace.s40),
                  child: CenteredState(
                    icon: AppIcons.inventory_2_outlined,
                    title: 'No products here',
                  ),
                ),
              for (final p in visible)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpace.s12),
                  child: AppCard(
                    onTap: () => context.push(RoutePaths.editProduct(p.id)),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.titleSmall,
                              ),
                              const SizedBox(height: AppSpace.s4),
                              Text(
                                [
                                  formatMoney(p.priceMinor, p.currency),
                                  'Stock: ${p.quantity}',
                                  'Views: ${p.viewCount}',
                                ].join(' · '),
                                style: context.text.bodySmall?.copyWith(
                                  color: c.textMed,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpace.s8),
                        _StatusChip(status: p.status),
                        const SizedBox(width: AppSpace.s4),
                        Icon(AppIcons.chevron_right, color: c.textLow),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _StatsCard extends ConsumerWidget {
  const _StatsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(vendorStatsProvider);
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s16),
      child: async.when(
        loading: () => const SizedBox(
          height: 48,
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (e, _) => Text(
          'Stats unavailable',
          style: context.text.bodyMedium?.copyWith(color: c.textMed),
        ),
        data: (s) => Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _Stat(label: 'Live', value: '${s.published}'),
            _Stat(label: 'Drafts', value: '${s.draft}'),
            _Stat(label: 'Offers', value: '${s.activeOffers}'),
            _Stat(label: 'Views', value: '${s.productViews}'),
            _Stat(
              label: 'Rating',
              value: s.reviews == 0 ? '—' : s.ratingAvg.toStringAsFixed(1),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: context.text.titleLarge),
        Text(
          label,
          style: context.text.labelSmall?.copyWith(
            color: context.colors.textMed,
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final tone = switch (status) {
      'PUBLISHED' => BadgeTone.success,
      'DRAFT' => BadgeTone.neutral,
      _ => BadgeTone.danger,
    };
    return StatusBadge(status, tone: tone);
  }
}
