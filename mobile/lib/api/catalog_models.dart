// Phase 2 catalog models — mirrors packages/contracts/src/catalog.ts.

int? _int(dynamic v) => v == null ? null : (v as num).toInt();

/// One field in a category's product field template
/// (`Category.attributeSchema`). `type` is one of "text"/"number"/"boolean"/
/// "select"; `options` is only present (and only meaningful) for "select".
class CategoryAttributeField {
  const CategoryAttributeField({
    required this.key,
    required this.label,
    required this.type,
    this.required = false,
    this.options = const [],
  });

  final String key;
  final String label;
  final String type;
  final bool required;
  final List<String> options;

  factory CategoryAttributeField.fromJson(Map<String, dynamic> j) =>
      CategoryAttributeField(
        key: j['key'] as String,
        label: j['label'] as String,
        type: j['type'] as String,
        required: j['required'] as bool? ?? false,
        options: (j['options'] as List<dynamic>? ?? const [])
            .map((e) => e as String)
            .toList(growable: false),
      );
}

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
    this.count,
    this.attributeSchema,
  });

  final String id;
  final String? parentId;
  final String slug;
  final String name;
  final String? icon;
  final String path;
  final int sortOrder;
  final List<CategoryDto> children;

  /// Present (non-null) only when fetched via a ranked `rootCategories`
  /// filter — the real signal (order volume / recent publishes / live
  /// auctions) that ranking is sorted by.
  final int? count;

  /// This category's product field template, or `null` if it has none — a
  /// category with no schema just gets the generic listing form, nothing
  /// category-specific.
  final List<CategoryAttributeField>? attributeSchema;

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
        count: _int(j['count']),
        attributeSchema: (j['attributeSchema'] as List<dynamic>?)
            ?.map((e) => CategoryAttributeField.fromJson(e as Map<String, dynamic>))
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
    this.activeAuction,
    this.description,
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

  /// The live Inverse Draw for this exact product, if the platform links
  /// one — lets the card show a green "Spot: ¤X" auction-seat price
  /// alongside the retail price.
  final ProductActiveAuction? activeAuction;

  /// Short blurb shown under the title (2–3 lines, then ellipsis). Not every
  /// card source provides one (e.g. wishlist/recently-viewed thin cards).
  final String? description;

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
        description: j['description'] as String?,
        activeAuction: (j['activeAuction'] as Map<String, dynamic>?) == null
            ? null
            : ProductActiveAuction.fromJson(
                j['activeAuction'] as Map<String, dynamic>,
              ),
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

class RecentlyViewedItemDto extends WishlistItemDto {
  const RecentlyViewedItemDto({
    required super.productId,
    required super.slug,
    required super.title,
    required this.viewedAt,
    super.image,
    super.fromPriceMinor,
    super.currency = 'GHS',
  });

  final DateTime viewedAt;

  factory RecentlyViewedItemDto.fromJson(Map<String, dynamic> j) =>
      RecentlyViewedItemDto(
        productId: j['productId'] as String,
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String? ?? '',
        image: j['image'] as String?,
        fromPriceMinor: _int(j['fromPriceMinor']),
        currency: (j['currency'] as String?) ?? 'GHS',
        viewedAt:
            DateTime.tryParse(j['viewedAt'] as String? ?? '') ??
            DateTime.now(),
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

class RatingBar {
  const RatingBar({required this.star, required this.count, required this.pct});
  final int star;
  final int count;
  final int pct;

  factory RatingBar.fromJson(Map<String, dynamic> j) => RatingBar(
        star: _int(j['star']) ?? 0,
        count: _int(j['count']) ?? 0,
        pct: _int(j['pct']) ?? 0,
      );
}

class ReviewsPage {
  const ReviewsPage({
    required this.items,
    this.nextCursor,
    this.total = 0,
    this.distribution = const [],
  });
  final List<ReviewDto> items;
  final String? nextCursor;
  final int total;
  final List<RatingBar> distribution;

  factory ReviewsPage.fromJson(Map<String, dynamic> j) => ReviewsPage(
        items: (j['items'] as List<dynamic>? ?? const [])
            .map((e) => ReviewDto.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
        nextCursor: j['nextCursor'] as String?,
        total: _int(j['total']) ?? 0,
        distribution: (j['distribution'] as List<dynamic>? ?? const [])
            .map((e) => RatingBar.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
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
    this.brandLogo,
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
    this.activeAuction,
  });

  final String id;
  final String slug;
  final String title;
  final String description;
  final String? brand;

  /// The brand's real logo, auto-resolved server-side (curated map or
  /// Brandfetch) from the free-text [brand] field — null if unresolved.
  final String? brandLogo;
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

  /// The live Inverse Draw for this exact product, when the platform links
  /// one — lets the PDP show a "Join Draw" CTA alongside "Buy Retail".
  final ProductActiveAuction? activeAuction;

  factory ProductDetail.fromJson(Map<String, dynamic> j) => ProductDetail(
        id: j['id'] as String,
        slug: j['slug'] as String,
        title: j['title'] as String,
        description: j['description'] as String? ?? '',
        brand: j['brand'] as String?,
        brandLogo: j['brandLogo'] as String?,
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
        activeAuction: (j['activeAuction'] as Map<String, dynamic>?) == null
            ? null
            : ProductActiveAuction.fromJson(
                j['activeAuction'] as Map<String, dynamic>,
              ),
      );
}

class ProductActiveAuction {
  const ProductActiveAuction({
    required this.slug,
    required this.status,
    required this.ticketPriceMinor,
    required this.winTargetMinor,
    required this.seatsTotal,
    required this.seatsSold,
    required this.currency,
  });

  final String slug;
  final String status;
  final int ticketPriceMinor;
  final int winTargetMinor;
  final int seatsTotal;
  final int seatsSold;
  final String currency;

  double get fillPct => seatsTotal == 0 ? 0 : (seatsSold / seatsTotal) * 100;

  factory ProductActiveAuction.fromJson(Map<String, dynamic> j) =>
      ProductActiveAuction(
        slug: j['slug'] as String,
        status: j['status'] as String,
        ticketPriceMinor: _int(j['ticketPriceMinor']) ?? 0,
        winTargetMinor: _int(j['winTargetMinor']) ?? 0,
        seatsTotal: _int(j['seatsTotal']) ?? 0,
        seatsSold: _int(j['seatsSold']) ?? 0,
        currency: (j['currency'] as String?) ?? 'GHS',
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

/// A top-rated active vendor with at least one live listing — the home
/// feed's "Featured vendors" rail and its "View all" destination screen.
class FeaturedVendorDto {
  const FeaturedVendorDto({
    required this.id,
    required this.displayName,
    this.logo,
    this.banner,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.productCount = 0,
  });

  final String id;
  final String displayName;
  final String? logo;
  final String? banner;
  final double ratingAvg;
  final int ratingCount;
  final int productCount;

  factory FeaturedVendorDto.fromJson(Map<String, dynamic> j) => FeaturedVendorDto(
        id: j['id'] as String,
        displayName: j['displayName'] as String? ?? 'Vendor',
        logo: j['logo'] as String?,
        banner: j['banner'] as String?,
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: _int(j['ratingCount']) ?? 0,
        productCount: _int(j['productCount']) ?? 0,
      );
}

class VendorStatus {
  const VendorStatus({
    required this.onboarded,
    this.kycStatus,
    this.profileStatus,
    this.vendorId,
    this.note,
    this.displayName,
    this.bio,
    this.logo,
    this.banner,
  });
  final bool onboarded;
  final String? kycStatus; // NONE | PENDING | APPROVED | REJECTED
  final String? profileStatus;
  final String? vendorId;
  final String? note;
  final String? displayName;
  final String? bio;
  final String? logo;
  final String? banner;

  bool get isApproved => kycStatus == 'APPROVED';
  bool get isPending => kycStatus == 'PENDING' || kycStatus == 'IN_REVIEW';

  factory VendorStatus.fromJson(Map<String, dynamic> j) => VendorStatus(
        onboarded: j['onboarded'] == true,
        kycStatus: j['kycStatus'] as String?,
        profileStatus: j['profileStatus'] as String?,
        vendorId: j['vendorId'] as String?,
        note: j['note'] as String?,
        displayName: j['displayName'] as String?,
        bio: j['bio'] as String?,
        logo: j['logo'] as String?,
        banner: j['banner'] as String?,
      );
}

class MyProduct {
  const MyProduct({
    required this.id,
    required this.slug,
    required this.title,
    required this.status,
    this.offerStatus,
    this.image,
    this.priceMinor,
    this.currency = 'GHS',
    this.quantity = 0,
    this.viewCount = 0,
  });

  final String id;
  final String slug;
  final String title;
  final String status;
  final String? offerStatus;
  final String? image;
  final int? priceMinor;
  final String currency;
  final int quantity;
  final int viewCount;

  factory MyProduct.fromJson(Map<String, dynamic> j) => MyProduct(
        id: j['id'] as String,
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String,
        status: j['status'] as String? ?? 'DRAFT',
        offerStatus: j['offerStatus'] as String?,
        image: j['image'] as String?,
        priceMinor: _int(j['priceMinor']),
        currency: (j['currency'] as String?) ?? 'GHS',
        quantity: _int(j['quantity']) ?? 0,
        viewCount: _int(j['viewCount']) ?? 0,
      );
}

/// Full editable detail for one of the vendor's own products — used to
/// pre-populate the edit-listing form (previously it opened blank).
class VendorProductDetail {
  const VendorProductDetail({
    required this.id,
    required this.slug,
    required this.title,
    required this.description,
    required this.condition,
    required this.categoryId,
    required this.status,
    this.brand,
    this.offerStatus,
    this.priceMinor,
    this.currency = 'GHS',
    this.images = const [],
    this.quantity = 0,
    this.attributes = const {},
  });

  final String id;
  final String slug;
  final String title;
  final String description;
  final String? brand;
  final String condition;
  final String categoryId;
  final String status;
  final String? offerStatus;
  final int? priceMinor;
  final String currency;
  final List<String> images;
  final int quantity;
  final Map<String, dynamic> attributes;

  factory VendorProductDetail.fromJson(Map<String, dynamic> j) =>
      VendorProductDetail(
        id: j['id'] as String,
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String,
        description: j['description'] as String? ?? '',
        brand: j['brand'] as String?,
        condition: j['condition'] as String? ?? 'NEW',
        categoryId: j['categoryId'] as String,
        status: j['status'] as String? ?? 'DRAFT',
        offerStatus: j['offerStatus'] as String?,
        priceMinor: _int(j['priceMinor']),
        currency: (j['currency'] as String?) ?? 'GHS',
        images: (j['images'] as List<dynamic>? ?? const [])
            .map((e) => e as String)
            .toList(growable: false),
        quantity: _int(j['quantity']) ?? 0,
        attributes: (j['attributes'] as Map<String, dynamic>?) ?? const {},
      );
}

// --- promotions ----------------------------------------------------

class PromotionItemCard {
  const PromotionItemCard({
    required this.productId,
    required this.slug,
    required this.title,
    this.brand,
    this.description,
    this.image,
    this.currency = 'GHS',
    this.priceMinor,
    this.dealPriceMinor,
    this.discountBps,
    this.activeAuction,
  });

  final String productId;
  final String slug;
  final String title;
  final String? brand;
  final String? description;
  final String? image;
  final String currency;
  final int? priceMinor;
  final int? dealPriceMinor;
  final ProductActiveAuction? activeAuction;
  final int? discountBps;

  int? get effectivePriceMinor => dealPriceMinor ?? priceMinor;
  double? get discountPct => discountBps == null ? null : discountBps! / 100;

  factory PromotionItemCard.fromJson(Map<String, dynamic> j) => PromotionItemCard(
        productId: j['productId'] as String,
        slug: j['slug'] as String,
        title: j['title'] as String,
        brand: j['brand'] as String?,
        description: j['description'] as String?,
        image: j['image'] as String?,
        currency: (j['currency'] as String?) ?? 'GHS',
        priceMinor: _int(j['priceMinor']),
        dealPriceMinor: _int(j['dealPriceMinor']),
        discountBps: _int(j['discountBps']),
        activeAuction: (j['activeAuction'] as Map<String, dynamic>?) == null
            ? null
            : ProductActiveAuction.fromJson(
                j['activeAuction'] as Map<String, dynamic>,
              ),
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
    this.featuredVendors = const [],
    this.recentlyViewed = const [],
  });

  final List<PromotionView> flashDeals;
  final List<PromotionView> campaigns;
  final List<PromotionView> banners;
  final List<ProductCard> newArrivals;
  final List<ProductCard> topRated;
  final List<FeaturedVendorDto> featuredVendors;
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
        featuredVendors: _list(j['featuredVendors'], FeaturedVendorDto.fromJson),
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
