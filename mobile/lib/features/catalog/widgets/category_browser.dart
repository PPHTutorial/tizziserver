import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../category_images.dart';

const _filters = <(String, String)>[
  ('all', 'All'),
  ('trending', 'Trending'),
  ('new', 'New'),
  ('auction', 'Auction Eligible'),
];

/// The category filter row + 2-column photo grid — the real body content
/// behind both `/categories` ([CategoriesScreen]) and the bottom-nav Explore
/// tab, so the two never drift into two different designs of the same
/// screen. No `Scaffold`/header of its own; the caller supplies chrome.
class CategoryBrowser extends ConsumerStatefulWidget {
  const CategoryBrowser({super.key});

  @override
  ConsumerState<CategoryBrowser> createState() => _CategoryBrowserState();
}

class _CategoryBrowserState extends ConsumerState<CategoryBrowser> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(rootCategoriesProvider(_filter));
    return Column(
      children: [
        SizedBox(
          height: 48,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            itemCount: _filters.length,
            separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s8),
            itemBuilder: (_, i) => AppChip(
              _filters[i].$2,
              selected: _filter == _filters[i].$1,
              onTap: () => setState(() => _filter = _filters[i].$1),
            ),
          ),
        ),
        const SizedBox(height: AppSpace.s8),
        Expanded(
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => AppErrorView(
              e,
              onRetry: () => ref.invalidate(rootCategoriesProvider(_filter)),
            ),
            data: (roots) => roots.isEmpty
                ? CenteredState(
                    icon: AppIcons.category_outlined,
                    title: _filter == 'all'
                        ? 'No categories yet'
                        : 'Nothing here right now',
                    body: _filter == 'all'
                        ? null
                        : 'No categories match "${_filters.firstWhere((f) => f.$1 == _filter).$2}" at the moment.',
                  )
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.s16,
                      0,
                      AppSpace.s16,
                      AppSpace.s16,
                    ),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: AppSpace.s16,
                      crossAxisSpacing: AppSpace.s16,
                      childAspectRatio: 0.82,
                    ),
                    itemCount: roots.length,
                    itemBuilder: (context, i) => _CategoryCard(category: roots[i]),
                  ),
          ),
        ),
      ],
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.category});
  final CategoryDto category;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      borderRadius: BorderRadius.circular(AppRadius.r2xl),
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      child: InkWell(
        onTap: () => context.push(RoutePaths.category(category.slug)),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: c.border.withValues(alpha: 0.5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Image.network(
                  categoryImage(category.slug),
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(color: c.surfaceSunken),
                  loadingBuilder: (context, child, progress) => progress == null
                      ? child
                      : Container(color: c.surfaceSunken),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpace.s12),
                child: Text(
                  category.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.titleSmall,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
