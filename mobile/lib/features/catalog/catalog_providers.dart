import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/catalog_models.dart';
import '../../app/providers.dart';

/// Category tree for the current tenant.
final categoriesProvider = FutureProvider.autoDispose<List<CategoryDto>>(
  (ref) => ref.watch(stallApiProvider).categories(tree: true),
);

/// Flat category list (for pickers).
final flatCategoriesProvider = FutureProvider.autoDispose<List<CategoryDto>>(
  (ref) => ref.watch(stallApiProvider).categories(),
);

/// First page of products, optionally scoped to a category slug.
final productPageProvider = FutureProvider.autoDispose
    .family<PageResult<ProductCard>, ({String? category, String sort})>(
  (ref, args) => ref.watch(stallApiProvider).products(category: args.category, sort: args.sort),
);

final productDetailProvider =
    FutureProvider.autoDispose.family<ProductDetail, String>(
  (ref, slug) => ref.watch(stallApiProvider).product(slug),
);

final vendorPageProvider = FutureProvider.autoDispose.family<VendorPage, String>(
  (ref, id) => ref.watch(stallApiProvider).vendor(id),
);

final vendorProductsProvider =
    FutureProvider.autoDispose.family<PageResult<ProductCard>, String>(
  (ref, id) => ref.watch(stallApiProvider).vendorProducts(id),
);

/// Caller's vendor onboarding / KYC status.
final vendorStatusProvider = FutureProvider.autoDispose<VendorStatus>(
  (ref) => ref.watch(stallApiProvider).vendorMe(),
);

final myProductsProvider =
    FutureProvider.autoDispose.family<List<MyProduct>, String?>(
  (ref, status) => ref.watch(stallApiProvider).myProducts(status: status),
);

final wishlistProvider = FutureProvider.autoDispose<List<WishlistItemDto>>(
  (ref) => ref.watch(stallApiProvider).wishlist(),
);

// --- search --------------------------------------------------------

class ProductSearchState {
  const ProductSearchState({
    this.query = '',
    this.sort = 'relevance',
    this.loading = false,
    this.results = const [],
    this.total = 0,
    this.error,
    this.ran = false,
  });

  final String query;
  final String sort;
  final bool loading;
  final List<ProductCard> results;
  final int total;
  final String? error;
  final bool ran;

  ProductSearchState copyWith({
    String? query,
    String? sort,
    bool? loading,
    List<ProductCard>? results,
    int? total,
    String? error,
    bool? ran,
  }) =>
      ProductSearchState(
        query: query ?? this.query,
        sort: sort ?? this.sort,
        loading: loading ?? this.loading,
        results: results ?? this.results,
        total: total ?? this.total,
        error: error,
        ran: ran ?? this.ran,
      );
}

class ProductSearchController extends AutoDisposeNotifier<ProductSearchState> {
  @override
  ProductSearchState build() => const ProductSearchState();

  void setQuery(String q) => state = state.copyWith(query: q);

  void setSort(String s) {
    state = state.copyWith(sort: s);
    if (state.query.trim().isNotEmpty) run();
  }

  Future<void> run() async {
    final q = state.query.trim();
    if (q.isEmpty) {
      state = state.copyWith(results: const [], total: 0, ran: false, error: null);
      return;
    }
    state = state.copyWith(loading: true, error: null);
    try {
      final res = await ref.read(stallApiProvider).search(q, sort: state.sort);
      state = state.copyWith(loading: false, results: res.items, total: res.total, ran: true);
    } catch (_) {
      state = state.copyWith(loading: false, error: 'Search failed. Try again.', ran: true);
    }
  }
}

final productSearchProvider =
    AutoDisposeNotifierProvider<ProductSearchController, ProductSearchState>(ProductSearchController.new);
