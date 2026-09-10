import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
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
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();

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
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            hintText: 'Search products',
            border: InputBorder.none,
          ),
          onChanged: ctrl.setQuery,
          onSubmitted: (_) => ctrl.run(),
        ),
        actions: [
          IconButton(
            icon: Badge(
              isLabelVisible: state.hasFilters,
              child: const Icon(AppIcons.tune),
            ),
            onPressed: () => _openFilters(context, state, ctrl),
          ),
          IconButton(icon: const Icon(AppIcons.search), onPressed: ctrl.run),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12),
              children: [
                for (final (value, label) in _sorts)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpace.s8),
                    child: ChoiceChip(
                      label: Text(label),
                      selected: state.sort == value,
                      onSelected: (_) => ctrl.setSort(value),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(child: _body(context, state, ctrl)),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, ProductSearchState state, ProductSearchController ctrl) {
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
                onPressed: () => ref.read(recentSearchesProvider.notifier).clear(),
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
          padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s8, AppSpace.s16, 0),
          child: Text('${state.total} result${state.total == 1 ? '' : 's'}',
              style: context.text.bodyMedium?.copyWith(color: context.colors.textMed)),
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
                Expanded(child: AppField(label: 'Min', controller: min, keyboardType: TextInputType.number)),
                const SizedBox(width: AppSpace.s12),
                Expanded(child: AppField(label: 'Max', controller: max, keyboardType: TextInputType.number)),
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
