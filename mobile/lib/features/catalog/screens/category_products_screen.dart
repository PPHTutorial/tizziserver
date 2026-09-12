import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/components.dart';
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

/// Screens 21/26–31 style — a product grid, with sort. Scoped to one category
/// (`slug` set) or, with `slug: null` + a [title]/[initialSort] override, the
/// generic "View All" destination for a home rail (Fresh arrivals, Top
/// rated, …) that isn't tied to any single category.
class CategoryProductsScreen extends ConsumerStatefulWidget {
  const CategoryProductsScreen({
    super.key,
    required this.slug,
    this.title,
    this.initialSort,
  });
  final String? slug;
  final String? title;
  final String? initialSort;

  @override
  ConsumerState<CategoryProductsScreen> createState() =>
      _CategoryProductsScreenState();
}

class _CategoryProductsScreenState
    extends ConsumerState<CategoryProductsScreen> {
  late String _sort = widget.initialSort ?? 'relevance';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(
      productPageProvider((category: widget.slug, sort: _sort)),
    );

    final title =
        widget.title ?? widget.slug?.replaceAll('-', ' ') ?? 'Products';
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              title[0].toUpperCase() + title.substring(1),
              trailing: IconButton(
                icon: const Icon(AppIcons.search, size: 18),
                tooltip: 'Search',
                onPressed: () => context.push(RoutePaths.search),
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
                  selected: _sort == _sorts[i].$1,
                  onTap: () => setState(() => _sort = _sorts[i].$1),
                ),
              ),
            ),
            const SizedBox(height: AppSpace.s8),
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
                    ? const CenteredState(
                        icon: AppIcons.inventory_2_outlined,
                        title: 'Nothing here yet',
                      )
                    : ProductGrid(
                        items: page.items,
                        onOpen: (p) => context.push(RoutePaths.product(p.slug)),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
