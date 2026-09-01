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

/// Screens 23–25 — category explorer (server-driven tree).
class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(categoriesProvider);
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Browse categories')),
      body: async.when(
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
                  childrenPadding: const EdgeInsets.only(bottom: AppSpace.s8),
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
      ),
    );
  }
}
