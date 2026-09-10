// Phase 2 catalog models — mirrors packages/contracts/src/catalog.ts.

int? _int(dynamic v) => v == null ? null : (v as num).toInt();

class CategoryDto {
  const CategoryDto({
    required this.id,
    this.parentId,
    required this.slug,
    required this.name,
    this.icon,
    required this.path,
    this.sortOrder = 0,
    this.children = const [],
  });

  final String id;
  final String? parentId;
  final String slug;
  final String name;
  final String? icon;
  final String path;
  final int sortOrder;
  final List<CategoryDto> children;

  factory CategoryDto.fromJson(Map<String, dynamic> j) => CategoryDto(
        id: j['id'] as String,
        parentId: j['parentId'] as String?,
        slug: j['slug'] as String,
        name: j['name'] as String,
        icon: j['icon'] as String?,
        path: (j['path'] as String?) ?? '/',
        sortOrder: _int(j['sortOrder']) ?? 0,
        children: (j['children'] as List<dynamic>? ?? const [])
            .map((e) => CategoryDto.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
      );
}

class ProductCard {
  const ProductCard({
    required this.id,
    required this.slug,
    required this.title,
    this.brand,
    this.image,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.fromPriceMinor,
    this.currency = 'GHS',
    this.offerCount = 0,
    this.vendorCount = 0,
  });

  final String id;
  final String slug;
  final String title;
  final String? brand;
  final String? image;
  final double ratingAvg;
  final int ratingCount;
  final int? fromPriceMinor;
  final String currency;
  final int offerCount;
  final int vendorCount;

  factory ProductCard.fromJson(Map<String, dynamic> j) => ProductCard(
        id: j['id'] as String,
        slug: j['slug'] as String,
        title: j['title'] as String,
        brand: j['brand'] as String?,
        image: j['image'] as String?,
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: _int(j['ratingCount']) ?? 0,
        fromPriceMinor: _int(j['fromPriceMinor']),
        currency: (j['currency'] as String?) ?? 'GHS',
        offerCount: _int(j['offerCount']) ?? 0,
        vendorCount: _int(j['vendorCount']) ?? 0,
      );
}

class PageResult<T> {
  const PageResult({required this.items, this.nextCursor});
  final List<T> items;
  final String? nextCursor;
}

/// Wishlist / recently-viewed entry (a thin product card).
class WishlistItemDto {
  const WishlistItemDto({
    required this.productId,
    required this.slug,
    required this.title,
    this.image,
    this.fromPriceMinor,
    this.currency = 'GHS',
  });

  final String productId;
  final String slug;
  final String title;
  final String? image;
  final int? fromPriceMinor;
  final String currency;

  factory WishlistItemDto.fromJson(Map<String, dynamic> j) => WishlistItemDto(
        productId: j['productId'] as String,
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String? ?? '',
        image: j['image'] as String?,
        fromPriceMinor: _int(j['fromPriceMinor']),
        currency: (j['currency'] as String?) ?? 'GHS',
      );
}

class OfferView {
  const OfferView({
    required this.id,
    required this.priceMinor,
    required this.currency,
    required this.condition,
    required this.vendorId,
    required this.vendorName,
    this.vendorLogo,
    this.vendorRating = 0,
    this.gas,
  });

  final String id;
  final int priceMinor;
  final String currency;
  final String condition;
  final String vendorId;
  final String vendorName;
  final String? vendorLogo;
  final double vendorRating;
  final GasListing? gas;

  factory OfferView.fromJson(Map<String, dynamic> j) {
    final v = (j['vendor'] as Map<String, dynamic>?) ?? const {};
    return OfferView(
      id: j['id'] as String,
      priceMinor: _int(j['priceMinor']) ?? 0,
      currency: (j['currency'] as String?) ?? 'GHS',
      condition: (j['condition'] as String?) ?? 'NEW',
      vendorId: v['id'] as String? ?? '',
      vendorName: v['displayName'] as String? ?? 'Seller',
      vendorLogo: v['logo'] as String?,
      vendorRating: (v['ratingAvg'] as num?)?.toDouble() ?? 0,
      gas: j['gas'] is Map<String, dynamic>
          ? GasListing.fromJson(j['gas'] as Map<String, dynamic>)
          : null,
    );
  }
}

class GasListing {
  const GasListing({
    required this.cylinderType,
    required this.weightKg,
    required this.capacityL,
    required this.requiresExchange,
    required this.depositMinor,
  });

  final String cylinderType;
  final double weightKg;
  final double capacityL;
  final bool requiresExchange;
  final int depositMinor;

  factory GasListing.fromJson(Map<String, dynamic> j) => GasListing(
        cylinderType: j['cylinderType'] as String? ?? '',
        weightKg: (j['weightKg'] as num?)?.toDouble() ?? 0,
        capacityL: (j['capacityL'] as num?)?.toDouble() ?? 0,
        requiresExchange: j['requiresExchange'] == true,
        depositMinor: _int(j['depositMinor']) ?? 0,
      );
}

class ProductVariantDto {
  const ProductVariantDto({required this.id, required this.name, required this.priceMinor, this.compareAtMinor});
  final String id;
  final String name;
  final int priceMinor;
  final int? compareAtMinor;

  factory ProductVariantDto.fromJson(Map<String, dynamic> j) => ProductVariantDto(
        id: j['id'] as String,
        name: j['name'] as String? ?? 'Default',
        priceMinor: _int(j['priceMinor']) ?? 0,
        compareAtMinor: _int(j['compareAtMinor']),
      );
}

class ReviewDto {
  const ReviewDto({required this.id, required this.rating, this.title, this.body, required this.author, this.at});
  final String id;
  final int rating;
  final String? title;
  final String? body;
  final String author;
  final String? at;

  factory ReviewDto.fromJson(Map<String, dynamic> j) => ReviewDto(
        id: j['id'] as String,
        rating: _int(j['rating']) ?? 0,
        title: j['title'] as String?,
        body: j['body'] as String?,
        author: j['author'] as String? ?? 'Customer',
        at: j['at'] as String?,
      );
}

class ProductMediaDto {
  const ProductMediaDto({required this.kind, required this.fileKey, this.alt});

  final String kind; // IMAGE | VIDEO
  final String fileKey;
  final String? alt;

  bool get isVideo => kind == 'VIDEO';

  factory ProductMediaDto.fromJson(Map<String, dynamic> j) => ProductMediaDto(
        kind: j['kind'] as String? ?? 'IMAGE',
        fileKey: j['fileKey'] as String? ?? '',
        alt: j['alt'] as String?,
      );
}

class ProductDetail {
  const ProductDetail({
    required this.id,
    required this.slug,
    required this.title,
    required this.description,
    this.brand,
    required this.condition,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.categoryName,
    this.images = const [],
    this.media = const [],
    this.variants = const [],
    this.fromPriceMinor,
    this.currency = 'GHS',
    this.offers = const [],
    this.reviewCount = 0,
    this.questionCount = 0,
    this.reviews = const [],
  });

  final String id;
  final String slug;
  final String title;
  final String description;
  final String? brand;
  final String condition;
  final double ratingAvg;
  final int ratingCount;
  final String? categoryName;
  final List<String> images;
  final List<ProductMediaDto> media;
  final List<ProductVariantDto> variants;

  /// VIDEO media entries (fileKeys / URLs), in sort order.
  List<String> get videos =>
      media.where((m) => m.isVideo && m.fileKey.isNotEmpty).map((m) => m.fileKey).toList(growable: false);
  final int? fromPriceMinor;
  final String currency;
  final List<OfferView> offers;
  final int reviewCount;
  final int questionCount;
  final List<ReviewDto> reviews;

  factory ProductDetail.fromJson(Map<String, dynamic> j) => ProductDetail(
        id: j['id'] as String,
        slug: j['slug'] as String,
        title: j['title'] as String,
        description: j['description'] as String? ?? '',
        brand: j['brand'] as String?,
        condition: j['condition'] as String? ?? 'NEW',
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: _int(j['ratingCount']) ?? 0,
        categoryName: (j['category'] as Map<String, dynamic>?)?['name'] as String?,
        media: (j['media'] as List<dynamic>? ?? const [])
            .map((m) => ProductMediaDto.fromJson(m as Map<String, dynamic>))
            .toList(growable: false),
        images: (j['media'] as List<dynamic>? ?? const [])
            .map((m) => m as Map<String, dynamic>)
            .where((m) => (m['kind'] as String? ?? 'IMAGE') == 'IMAGE')
            .map((m) => m['fileKey'] as String)
            .toList(growable: false),
        variants: (j['variants'] as List<dynamic>? ?? const [])
            .map((v) => ProductVariantDto.fromJson(v as Map<String, dynamic>))
            .toList(growable: false),
        fromPriceMinor: _int(j['fromPriceMinor']),
        currency: (j['currency'] as String?) ?? 'GHS',
        offers: (j['offers'] as List<dynamic>? ?? const [])
            .map((o) => OfferView.fromJson(o as Map<String, dynamic>))
            .toList(growable: false),
        reviewCount: _int(j['reviewCount']) ?? 0,
        questionCount: _int(j['questionCount']) ?? 0,
        reviews: (j['reviews'] as List<dynamic>? ?? const [])
            .map((r) => ReviewDto.fromJson(r as Map<String, dynamic>))
            .toList(growable: false),
      );
}

class VendorPage {
  const VendorPage({
    required this.id,
    required this.displayName,
    this.bio,
    this.logo,
    this.banner,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.verified = false,
    this.productCount = 0,
    this.location,
  });

  final String id;
  final String displayName;
  final String? bio;
  final String? logo;
  final String? banner;
  final double ratingAvg;
  final int ratingCount;
  final bool verified;
  final int productCount;
  final String? location;

  factory VendorPage.fromJson(Map<String, dynamic> j) => VendorPage(
        id: j['id'] as String,
        displayName: j['displayName'] as String? ?? 'Vendor',
        bio: j['bio'] as String?,
        logo: j['logo'] as String?,
        banner: j['banner'] as String?,
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: _int(j['ratingCount']) ?? 0,
        verified: j['verifiedAt'] != null,
        productCount: _int(j['productCount']) ?? 0,
        location: j['location'] as String?,
      );
}

class NearbyVendorDto {
  const NearbyVendorDto({
    required this.id,
    required this.displayName,
    this.logo,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    required this.distanceM,
    this.lat,
    this.lng,
  });

  final String id;
  final String displayName;
  final String? logo;
  final double ratingAvg;
  final int ratingCount;
  final int distanceM;

  /// Business location (WGS84). Null when the vendor's address isn't geocoded.
  final double? lat;
  final double? lng;

  bool get hasLocation => lat != null && lng != null;

  String get distanceLabel =>
      distanceM < 1000 ? '$distanceM m' : '${(distanceM / 1000).toStringAsFixed(1)} km';

  factory NearbyVendorDto.fromJson(Map<String, dynamic> j) => NearbyVendorDto(
        id: j['id'] as String,
        displayName: j['displayName'] as String? ?? 'Vendor',
        logo: j['logo'] as String?,
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: _int(j['ratingCount']) ?? 0,
        distanceM: _int(j['distanceM']) ?? 0,
        lat: (j['lat'] as num?)?.toDouble(),
        lng: (j['lng'] as num?)?.toDouble(),
      );
}

class VendorStatus {
  const VendorStatus({required this.onboarded, this.kycStatus, this.profileStatus, this.vendorId, this.note});
  final bool onboarded;
  final String? kycStatus; // NONE | PENDING | APPROVED | REJECTED
  final String? profileStatus;
  final String? vendorId;
  final String? note;

  bool get isApproved => kycStatus == 'APPROVED';
  bool get isPending => kycStatus == 'PENDING' || kycStatus == 'IN_REVIEW';

  factory VendorStatus.fromJson(Map<String, dynamic> j) => VendorStatus(
        onboarded: j['onboarded'] == true,
        kycStatus: j['kycStatus'] as String?,
        profileStatus: j['profileStatus'] as String?,
        vendorId: j['vendorId'] as String?,
        note: j['note'] as String?,
      );
}

class MyProduct {
  const MyProduct({
    required this.id,
    required this.slug,
    required this.title,
    required this.status,
    this.image,
    this.priceMinor,
    this.currency = 'GHS',
  });

  final String id;
  final String slug;
  final String title;
  final String status;
  final String? image;
  final int? priceMinor;
  final String currency;

  factory MyProduct.fromJson(Map<String, dynamic> j) => MyProduct(
        id: j['id'] as String,
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String,
        status: j['status'] as String? ?? 'DRAFT',
        image: j['image'] as String?,
        priceMinor: _int(j['priceMinor']),
        currency: (j['currency'] as String?) ?? 'GHS',
      );
}

// --- promotions ----------------------------------------------------

class PromotionItemCard {
  const PromotionItemCard({
    required this.productId,
    required this.slug,
    required this.title,
    this.brand,
    this.image,
    this.currency = 'GHS',
    this.priceMinor,
    this.dealPriceMinor,
    this.discountBps,
  });

  final String productId;
  final String slug;
  final String title;
  final String? brand;
  final String? image;
  final String currency;
  final int? priceMinor;
  final int? dealPriceMinor;
  final int? discountBps;

  int? get effectivePriceMinor => dealPriceMinor ?? priceMinor;
  double? get discountPct => discountBps == null ? null : discountBps! / 100;

  factory PromotionItemCard.fromJson(Map<String, dynamic> j) => PromotionItemCard(
        productId: j['productId'] as String,
        slug: j['slug'] as String,
        title: j['title'] as String,
        brand: j['brand'] as String?,
        image: j['image'] as String?,
        currency: (j['currency'] as String?) ?? 'GHS',
        priceMinor: _int(j['priceMinor']),
        dealPriceMinor: _int(j['dealPriceMinor']),
        discountBps: _int(j['discountBps']),
      );
}

class PromotionView {
  const PromotionView({
    required this.slug,
    required this.kind,
    required this.title,
    this.subtitle,
    this.imageKey,
    this.ctaRoute,
    this.endsAt,
    this.items = const [],
  });

  final String slug;
  final String kind; // FLASH_DEAL | CAMPAIGN | BANNER
  final String title;
  final String? subtitle;
  final String? imageKey;
  final String? ctaRoute;
  final String? endsAt;
  final List<PromotionItemCard> items;

  DateTime? get endsAtDate => endsAt == null ? null : DateTime.tryParse(endsAt!);

  factory PromotionView.fromJson(Map<String, dynamic> j) => PromotionView(
        slug: j['slug'] as String,
        kind: j['kind'] as String? ?? 'CAMPAIGN',
        title: j['title'] as String,
        subtitle: j['subtitle'] as String?,
        imageKey: j['imageKey'] as String?,
        ctaRoute: j['ctaRoute'] as String?,
        endsAt: j['endsAt'] as String?,
        items: (j['items'] as List<dynamic>? ?? const [])
            .map((e) => PromotionItemCard.fromJson((e as Map).cast<String, dynamic>()))
            .toList(growable: false),
      );
}

class HomeRails {
  const HomeRails({
    this.flashDeals = const [],
    this.campaigns = const [],
    this.banners = const [],
    this.newArrivals = const [],
    this.topRated = const [],
    this.recentlyViewed = const [],
  });

  final List<PromotionView> flashDeals;
  final List<PromotionView> campaigns;
  final List<PromotionView> banners;
  final List<ProductCard> newArrivals;
  final List<ProductCard> topRated;
  final List<WishlistItemDto> recentlyViewed;

  bool get isEmpty =>
      flashDeals.isEmpty &&
      campaigns.isEmpty &&
      banners.isEmpty &&
      newArrivals.isEmpty &&
      topRated.isEmpty;

  static List<T> _list<T>(dynamic v, T Function(Map<String, dynamic>) map) =>
      (v as List<dynamic>? ?? const [])
          .map((e) => map((e as Map).cast<String, dynamic>()))
          .toList(growable: false);

  factory HomeRails.fromJson(Map<String, dynamic> j) => HomeRails(
        flashDeals: _list(j['flashDeals'], PromotionView.fromJson),
        campaigns: _list(j['campaigns'], PromotionView.fromJson),
        banners: _list(j['banners'], PromotionView.fromJson),
        newArrivals: _list(j['newArrivals'], ProductCard.fromJson),
        topRated: _list(j['topRated'], ProductCard.fromJson),
        recentlyViewed: _list(j['recentlyViewed'], WishlistItemDto.fromJson),
      );
}

// --- vendor extras ----------------------------------------------

class BusinessDocumentDto {
  const BusinessDocumentDto({
    required this.id,
    required this.type,
    required this.fileKey,
    required this.status,
    this.note,
    this.at,
  });

  final String id;
  final String type;
  final String fileKey;
  final String status;
  final String? note;
  final String? at;

  factory BusinessDocumentDto.fromJson(Map<String, dynamic> j) => BusinessDocumentDto(
        id: j['id'] as String,
        type: j['type'] as String? ?? '',
        fileKey: j['fileKey'] as String? ?? '',
        status: j['status'] as String? ?? 'PENDING',
        note: j['note'] as String?,
        at: j['at'] as String?,
      );
}

class VendorStats {
  const VendorStats({
    this.draft = 0,
    this.published = 0,
    this.archived = 0,
    this.activeOffers = 0,
    this.reviews = 0,
    this.ratingAvg = 0,
    this.productViews = 0,
  });

  final int draft;
  final int published;
  final int archived;
  final int activeOffers;
  final int reviews;
  final double ratingAvg;
  final int productViews;

  factory VendorStats.fromJson(Map<String, dynamic> j) {
    final p = (j['products'] as Map<String, dynamic>?) ?? const {};
    return VendorStats(
      draft: _int(p['DRAFT']) ?? 0,
      published: _int(p['PUBLISHED']) ?? 0,
      archived: _int(p['ARCHIVED']) ?? 0,
      activeOffers: _int(j['activeOffers']) ?? 0,
      reviews: _int(j['reviews']) ?? 0,
      ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
      productViews: _int(j['productViews']) ?? 0,
    );
  }
}

/// Minor units → "GHS 1,899.00"-ish. Keeps it dependency-free.
String formatMoney(int? minor, String currency) {
  if (minor == null) return '—';
  final major = (minor / 100).toStringAsFixed(2);
  final parts = major.split('.');
  final withSep = parts[0].replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (m) => ',',
  );
  return '$currency $withSep.${parts[1]}';
}
