import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

/// Screen 76 — saved / wishlist items.
class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(wishlistProvider);

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Wishlist')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load your wishlist',
          action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(wishlistProvider)),
        ),
        data: (items) => items.isEmpty
            ? const CenteredState(
                icon: AppIcons.favorite_border,
                title: 'Nothing saved yet',
                body: 'Tap the heart on any product to save it here.',
              )
            : ListView.separated(
                padding: const EdgeInsets.all(AppSpace.s16),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
                itemBuilder: (context, i) {
                  final WishlistItemDto w = items[i];
                  return InkWell(
                    onTap: () => context.push(RoutePaths.product(w.slug)),
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    child: Row(
                      children: [
                        ProductThumb(seed: w.productId, label: w.title, size: 64),
                        const SizedBox(width: AppSpace.s12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(w.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                              Text(formatMoney(w.fromPriceMinor, w.currency),
                                  style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer)),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: Icon(AppIcons.close, color: c.textLow),
                          onPressed: () async {
                            await ref.read(stallApiProvider).toggleWishlist(w.productId, add: false);
                            ref.invalidate(wishlistProvider);
                          },
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
