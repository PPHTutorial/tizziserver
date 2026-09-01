import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';

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
          IconButton(icon: const Icon(Icons.search), onPressed: ctrl.run),
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
      return const CenteredState(
        icon: Icons.search,
        title: 'Find anything',
        body: 'Search across every product on this marketplace.',
      );
    }
    if (state.results.isEmpty) {
      return CenteredState(
        icon: Icons.search_off,
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
        Expanded(
          child: ProductGrid(
            items: state.results,
            onOpen: (p) => context.push(RoutePaths.product(p.slug)),
          ),
        ),
      ],
    );
  }
}
