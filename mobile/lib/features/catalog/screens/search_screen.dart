import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../ads/widgets/sponsored_rail.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

const _sorts = <(String, String)>[
  ('relevance', 'Best match'),
  ('price_asc', 'Price ↑'),
  ('price_desc', 'Price ↓'),
  ('newest', 'Newest'),
];

/// Screens 41–59 — search: query field, sort chips, results, empty/error.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, this.initialQuery});

  /// Pre-filled and auto-run — used by voice search and barcode-miss fallback.
  final String? initialQuery;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final _controller = TextEditingController(text: widget.initialQuery);

  @override
  void initState() {
    super.initState();
    final q = widget.initialQuery?.trim();
    if (q != null && q.isNotEmpty) {
      Future.microtask(() {
        if (!mounted) return;
        ref.read(productSearchProvider.notifier).setQuery(q);
        ref.read(productSearchProvider.notifier).run();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final state = ref.watch(productSearchProvider);
    final ctrl = ref.read(productSearchProvider.notifier);

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s16,
                AppSpace.s8,
                AppSpace.s16,
                AppSpace.s12,
              ),
              child: Row(
                children: [
                  _CircleIcon(
                    icon: AppIcons.chevron_left,
                    onTap: () => Navigator.of(context).maybePop(),
                  ),
                  const SizedBox(width: AppSpace.s10),
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: c.surface,
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                        border: Border.all(
                          color: _controller.text.isNotEmpty
                              ? c.primary
                              : c.border,
                          width: _controller.text.isNotEmpty ? 1.5 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          const SizedBox(width: AppSpace.s16),
                          Icon(AppIcons.search, size: 16, color: c.primary),
                          Expanded(
                            child: TextField(
                              controller: _controller,
                              textInputAction: TextInputAction.search,
                              style: context.text.bodyLarge,
                              decoration: const InputDecoration(
                                hintText: 'Search products',
                                border: InputBorder.none,
                                isDense: true,
                                contentPadding: EdgeInsets.symmetric(
                                  horizontal: AppSpace.s10,
                                  vertical: AppSpace.s16,
                                ),
                              ),
                              onChanged: (v) {
                                ctrl.setQuery(v);
                                setState(() {});
                              },
                              onSubmitted: (_) => ctrl.run(),
                            ),
                          ),
                          if (_controller.text.isNotEmpty)
                            IconButton(
                              icon: const Icon(AppIcons.close, size: 14),
                              onPressed: () {
                                _controller.clear();
                                ctrl.setQuery('');
                                setState(() {});
                              },
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpace.s8),
                  _CircleIcon(
                    icon: AppIcons.tune,
                    badge: state.hasFilters,
                    onTap: () => _openFilters(context, state, ctrl),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 48,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
                itemCount: _sorts.length,
                separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s8),
                itemBuilder: (_, i) => AppChip(
                  _sorts[i].$2,
                  selected: state.sort == _sorts[i].$1,
                  onTap: () => ctrl.setSort(_sorts[i].$1),
                ),
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            Expanded(child: _body(context, state, ctrl)),
          ],
        ),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    ProductSearchState state,
    ProductSearchController ctrl,
  ) {
    if (state.loading) return const Center(child: CircularProgressIndicator());
    if (state.error != null) {
      return CenteredState.error(
        title: state.error!,
        action: PrimaryButton(label: 'Retry', onPressed: ctrl.run),
      );
    }
    if (!state.ran) {
      final recents = ref.watch(recentSearchesProvider);
      if (recents.isEmpty) {
        return const CenteredState(
          icon: AppIcons.search,
          title: 'Find anything',
          body: 'Search across every product on this marketplace.',
        );
      }
      return ListView(
        padding: const EdgeInsets.all(AppSpace.s16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Recent', style: context.text.titleSmall),
              TextButton(
                onPressed: () =>
                    ref.read(recentSearchesProvider.notifier).clear(),
                child: const Text('Clear'),
              ),
            ],
          ),
          Wrap(
            spacing: AppSpace.s8,
            children: [
              for (final term in recents)
                ActionChip(
                  label: Text(term),
                  avatar: const Icon(AppIcons.history, size: 16),
                  onPressed: () {
                    _controller.text = term;
                    ctrl.setQuery(term);
                    ctrl.run();
                  },
                ),
            ],
          ),
        ],
      );
    }
    if (state.results.isEmpty) {
      return CenteredState(
        icon: AppIcons.search_off,
        title: 'No matches for “${state.query}”',
        body: 'Check the spelling or try a broader term.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.s16,
            AppSpace.s8,
            AppSpace.s16,
            0,
          ),
          child: Text(
            '${state.total} result${state.total == 1 ? '' : 's'}',
            style: context.text.bodyMedium?.copyWith(
              color: context.colors.textMed,
            ),
          ),
        ),
        const SponsoredRail(slot: 'SEARCH_TOP'),
        Expanded(
          child: ProductGrid(
            items: state.results,
            onOpen: (p) => context.push(RoutePaths.product(p.slug)),
          ),
        ),
      ],
    );
  }

  Future<void> _openFilters(
    BuildContext context,
    ProductSearchState state,
    ProductSearchController ctrl,
  ) async {
    final min = TextEditingController(text: state.minPrice?.toString() ?? '');
    final max = TextEditingController(text: state.maxPrice?.toString() ?? '');
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
      ),
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpace.s16,
          0,
          AppSpace.s16,
          MediaQuery.of(context).viewInsets.bottom + AppSpace.s16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Price range', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s12),
            Row(
              children: [
                Expanded(
                  child: AppField(
                    label: 'Min',
                    hintText: '0',
                    controller: min,
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: AppSpace.s12),
                Expanded(
                  child: AppField(
                    label: 'Max',
                    hintText: 'Any',
                    controller: max,
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.s16),
            PrimaryButton(
              label: 'Apply',
              onPressed: () {
                ctrl.setPriceRange(
                  min: int.tryParse(min.text.trim()),
                  max: int.tryParse(max.text.trim()),
                );
                Navigator.of(context).pop();
              },
            ),
            const SizedBox(height: AppSpace.s8),
            TextButton(
              onPressed: () {
                ctrl.clearFilters();
                Navigator.of(context).pop();
              },
              child: const Text('Clear filters'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CircleIcon extends StatelessWidget {
  const _CircleIcon({
    required this.icon,
    required this.onTap,
    this.badge = false,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool badge;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      shape: CircleBorder(
        side: BorderSide(color: c.border.withValues(alpha: 0.5)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Badge(
            isLabelVisible: badge,
            smallSize: 8,
            child: Icon(icon, size: 16, color: c.textHi),
          ),
        ),
      ),
    );
  }
}
