import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../shell/app_bottom_nav.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';

/// Screens 21–22 — the customer home feed (no Scaffold; hosted by HomeShell).
class CatalogHomeBody extends ConsumerWidget {
  const CatalogHomeBody({super.key, required this.platformName});
  final String platformName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final cats = ref.watch(categoriesProvider);
    final featured = ref.watch(productPageProvider((category: null, sort: 'newest')));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(categoriesProvider);
        ref.invalidate(productPageProvider);
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: AppSpace.s12),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            child: InkWell(
              onTap: () => context.push(RoutePaths.search),
              borderRadius: BorderRadius.circular(AppRadius.lg),
              child: Container(
                padding: const EdgeInsets.all(AppSpace.s14),
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  border: Border.all(color: c.border),
                ),
                child: Row(children: [
                  Icon(Icons.search, color: c.textLow, size: 20),
                  const SizedBox(width: AppSpace.s8),
                  Text('Search $platformName',
                      style: context.text.bodyLarge?.copyWith(color: c.textLow)),
                ]),
              ),
            ),
          ),
          const SizedBox(height: AppSpace.s16),
          cats.when(
            loading: () => const SizedBox(height: 88, child: Center(child: CircularProgressIndicator())),
            error: (e, _) => const SizedBox.shrink(),
            data: (roots) => SizedBox(
              height: 92,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12),
                children: [
                  for (final cat in roots)
                    GestureDetector(
                      onTap: () => context.push(RoutePaths.category(cat.slug)),
                      child: Container(
                        width: 76,
                        margin: const EdgeInsets.symmetric(horizontal: AppSpace.s4),
                        child: Column(
                          children: [
                            CircleAvatar(
                              radius: 26,
                              backgroundColor: c.primaryContainer,
                              child: FaIcon(navIconFor(cat.icon ?? 'circle'),
                                  size: 18, color: c.onPrimaryContainer),
                            ),
                            const SizedBox(height: AppSpace.s4),
                            Text(cat.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.labelSmall),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpace.s16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
            child: Text('Fresh arrivals', style: context.text.titleMedium),
          ),
          const SizedBox(height: AppSpace.s8),
          featured.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpace.s32),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(AppSpace.s16),
              child: CenteredState.error(
                title: 'Couldn\'t load products',
                action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(productPageProvider)),
              ),
            ),
            data: (page) => GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 220,
                mainAxisSpacing: AppSpace.s12,
                crossAxisSpacing: AppSpace.s12,
                childAspectRatio: 0.66,
              ),
              itemCount: page.items.length,
              itemBuilder: (context, i) => ProductCardTile(
                product: page.items[i],
                onTap: () => context.push(RoutePaths.product(page.items[i].slug)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Explore tab body — the category tree, inline.
class CatalogExploreBody extends ConsumerWidget {
  const CatalogExploreBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(categoriesProvider);
    final c = context.colors;
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => CenteredState.error(
        title: 'Couldn\'t load categories',
        action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(categoriesProvider)),
      ),
      data: (roots) => ListView(
        padding: const EdgeInsets.all(AppSpace.s12),
        children: [
          for (final root in roots)
            Card(
              elevation: 0,
              color: c.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.lg),
                side: BorderSide(color: c.border),
              ),
              child: ExpansionTile(
                shape: const Border(),
                leading: FaIcon(navIconFor(root.icon ?? 'circle'), size: 18, color: c.primary),
                title: Text(root.name, style: context.text.titleMedium),
                children: [
                  ListTile(
                    dense: true,
                    title: Text('All ${root.name}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push(RoutePaths.category(root.slug)),
                  ),
                  for (final child in root.children)
                    ListTile(
                      dense: true,
                      title: Text(child.name),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push(RoutePaths.category(child.slug)),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
