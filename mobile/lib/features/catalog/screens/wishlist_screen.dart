import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

/// Screen 76 — saved / wishlist items. A 2-column photo grid (Figma
/// `wishlist-screen`), not the plain list this used to be.
class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(wishlistProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              'My Wishlist',
              trailing: _CircleButton(
                icon: AppIcons.shopping_cart_outlined,
                onTap: () => context.push(RoutePaths.cart),
              ),
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load your wishlist',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(wishlistProvider),
                  ),
                ),
                data: (items) => items.isEmpty
                    ? const CenteredState(
                        icon: AppIcons.favorite_border,
                        title: 'Nothing saved yet',
                        body: 'Tap the heart on any product to save it here.',
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(
                              AppSpace.s16,
                              0,
                              AppSpace.s16,
                              AppSpace.s8,
                            ),
                            child: Text(
                              'Manage your saved items (${items.length})',
                              style: context.text.bodyMedium?.copyWith(
                                color: c.textMed,
                              ),
                            ),
                          ),
                          Expanded(
                            child: MasonryGridView.count(
                              padding: const EdgeInsets.fromLTRB(
                                AppSpace.s16,
                                0,
                                AppSpace.s16,
                                AppSpace.s16,
                              ),
                              crossAxisCount: 2,
                              mainAxisSpacing: AppSpace.s16,
                              crossAxisSpacing: AppSpace.s16,
                              itemCount: items.length,
                              itemBuilder: (context, i) =>
                                  _WishlistCard(item: items[i]),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(
                              bottom: AppSpace.s16,
                            ),
                            child: Text(
                              'Tap the heart to remove a saved item.',
                              textAlign: TextAlign.center,
                              style: context.text.bodySmall?.copyWith(
                                color: c.textLow,
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WishlistCard extends ConsumerWidget {
  const _WishlistCard({required this.item});
  final WishlistItemDto item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Material(
      color: c.surface,
      borderRadius: BorderRadius.circular(AppRadius.r2xl),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(RoutePaths.product(item.slug)),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: c.border.withValues(alpha: 0.5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ProductThumb(
                      seed: item.productId,
                      label: item.title,
                      imageKey: item.image,
                      size: double.infinity,
                    ),
                    Positioned(
                      top: AppSpace.s8,
                      right: AppSpace.s8,
                      child: _CircleButton(
                        icon: AppIcons.favorite,
                        iconColor: c.error,
                        small: true,
                        onTap: () async {
                          await ref
                              .read(stallApiProvider)
                              .toggleWishlist(item.productId, add: false);
                          ref.invalidate(wishlistProvider);
                        },
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.s10,
                  AppSpace.s8,
                  AppSpace.s10,
                  4,
                ),
                child: Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.titleSmall,
                ),
              ),
              if (item.fromPriceMinor != null)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpace.s10,
                  ),
                  child: Text(
                    formatMoney(item.fromPriceMinor!, item.currency),
                    style: context.text.titleMedium?.copyWith(
                      color: c.primary,
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.all(AppSpace.s10),
                // Adds to cart from the product page rather than guessing an
                // offer here — a wishlist entry is product-level, but adding
                // to cart needs a specific vendor offer, which only the
                // product page actually resolves.
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => context.push(RoutePaths.product(item.slug)),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: AppSpace.s8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                    ),
                    child: const Text('View & Add'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    required this.icon,
    required this.onTap,
    this.iconColor,
    this.small = false,
  });
  final IconData icon;
  final VoidCallback onTap;
  final Color? iconColor;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      shape: const CircleBorder(),
      elevation: small ? 1 : 0,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.all(small ? 7 : 10),
          child: Icon(icon, size: small ? 15 : 18, color: iconColor ?? c.textHi),
        ),
      ),
    );
  }
}
