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

final homeRailsProvider = FutureProvider.autoDispose<HomeRails>(
  (ref) => ref.watch(stallApiProvider).home(),
);

final promotionProvider =
    FutureProvider.autoDispose.family<PromotionView, String>(
  (ref, slug) => ref.watch(stallApiProvider).promotion(slug),
);

final promotionsProvider =
    FutureProvider.autoDispose.family<List<PromotionView>, String?>(
  (ref, kind) => ref.watch(stallApiProvider).promotions(kind: kind),
);

final similarProvider =
    FutureProvider.autoDispose.family<List<ProductCard>, String>(
  (ref, slug) => ref.watch(stallApiProvider).similar(slug),
);

final vendorStatsProvider = FutureProvider.autoDispose<VendorStats>(
  (ref) => ref.watch(stallApiProvider).vendorStats(),
);

final businessDocsProvider = FutureProvider.autoDispose<List<BusinessDocumentDto>>(
  (ref) => ref.watch(stallApiProvider).businessDocuments(),
);

/// Accra fallback centre; a geolocator dep can replace this later.
const kDefaultLatLng = (lat: 5.6037, lng: -0.187);

final nearbyVendorsProvider = FutureProvider.autoDispose
    .family<List<NearbyVendorDto>, ({double lat, double lng, int radiusM})>(
  (ref, a) => ref.watch(stallApiProvider).nearbyVendors(lat: a.lat, lng: a.lng, radiusM: a.radiusM),
);

/// Recent search terms — session-local (kept alive across screen visits), newest first.
class RecentSearches extends Notifier<List<String>> {
  @override
  List<String> build() => const [];

  void add(String term) {
    final t = term.trim();
    if (t.isEmpty) return;
    state = [t, ...state.where((s) => s.toLowerCase() != t.toLowerCase())].take(8).toList();
  }

  void clear() => state = const [];
}

final recentSearchesProvider =
    NotifierProvider<RecentSearches, List<String>>(RecentSearches.new);

// --- search --------------------------------------------------------

class ProductSearchState {
  const ProductSearchState({
    this.query = '',
    this.sort = 'relevance',
    this.minPrice,
    this.maxPrice,
    this.loading = false,
    this.results = const [],
    this.total = 0,
    this.error,
    this.ran = false,
  });

  final String query;
  final String sort;
  final int? minPrice; // major units (whole currency)
  final int? maxPrice;
  final bool loading;
  final List<ProductCard> results;
  final int total;
  final String? error;
  final bool ran;

  bool get hasFilters => minPrice != null || maxPrice != null;

  ProductSearchState copyWith({
    String? query,
    String? sort,
    Object? minPrice = _sentinel,
    Object? maxPrice = _sentinel,
    bool? loading,
    List<ProductCard>? results,
    int? total,
    String? error,
    bool? ran,
  }) =>
      ProductSearchState(
        query: query ?? this.query,
        sort: sort ?? this.sort,
        minPrice: minPrice == _sentinel ? this.minPrice : minPrice as int?,
        maxPrice: maxPrice == _sentinel ? this.maxPrice : maxPrice as int?,
        loading: loading ?? this.loading,
        results: results ?? this.results,
        total: total ?? this.total,
        error: error,
        ran: ran ?? this.ran,
      );
}

const _sentinel = Object();

class ProductSearchController extends AutoDisposeNotifier<ProductSearchState> {
  @override
  ProductSearchState build() => const ProductSearchState();

  void setQuery(String q) => state = state.copyWith(query: q);

  void setSort(String s) {
    state = state.copyWith(sort: s);
    if (state.query.trim().isNotEmpty) run();
  }

  void setPriceRange({int? min, int? max}) {
    state = state.copyWith(minPrice: min, maxPrice: max);
    if (state.query.trim().isNotEmpty) run();
  }

  void clearFilters() {
    state = state.copyWith(minPrice: null, maxPrice: null);
    if (state.query.trim().isNotEmpty) run();
  }

  Future<void> run() async {
    final q = state.query.trim();
    if (q.isEmpty) {
      state = state.copyWith(results: const [], total: 0, ran: false, error: null);
      return;
    }
    ref.read(recentSearchesProvider.notifier).add(q);
    state = state.copyWith(loading: true, error: null);
    try {
      final res = await ref.read(stallApiProvider).search(
            q,
            sort: state.sort,
            minPrice: state.minPrice == null ? null : state.minPrice! * 100,
            maxPrice: state.maxPrice == null ? null : state.maxPrice! * 100,
          );
      state = state.copyWith(loading: false, results: res.items, total: res.total, ran: true);
    } catch (_) {
      state = state.copyWith(loading: false, error: 'Search failed. Try again.', ran: true);
    }
  }
}

final productSearchProvider =
    AutoDisposeNotifierProvider<ProductSearchController, ProductSearchState>(ProductSearchController.new);
