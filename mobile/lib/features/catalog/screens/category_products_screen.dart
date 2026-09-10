import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

const _sorts = <(String, String)>[
  ('relevance', 'Recommended'),
  ('newest', 'Newest'),
  ('price_asc', 'Price ↑'),
  ('price_desc', 'Price ↓'),
  ('rating', 'Top rated'),
];

/// Screens 21/26–31 style — a product grid for one category, with sort.
class CategoryProductsScreen extends ConsumerStatefulWidget {
  const CategoryProductsScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<CategoryProductsScreen> createState() => _CategoryProductsScreenState();
}

class _CategoryProductsScreenState extends ConsumerState<CategoryProductsScreen> {
  String _sort = 'relevance';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(productPageProvider((category: widget.slug, sort: _sort)));

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        title: Text(widget.slug.replaceAll('-', ' ')),
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
                      selected: _sort == value,
                      onSelected: (_) => setState(() => _sort = value),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => CenteredState.error(
                title: 'Couldn\'t load products',
                action: PrimaryButton(
                  label: 'Retry',
                  onPressed: () => ref.invalidate(productPageProvider),
                ),
              ),
              data: (page) => page.items.isEmpty
                  ? const CenteredState(icon: AppIcons.inventory_2_outlined, title: 'Nothing here yet')
                  : ProductGrid(
                      items: page.items,
                      onOpen: (p) => context.push(RoutePaths.product(p.slug)),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
