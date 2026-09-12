// Phase 3 commerce models — mirrors packages/contracts/src/commerce.ts.

int _i(dynamic v) => v == null ? 0 : (v as num).toInt();
int? _iN(dynamic v) => v == null ? null : (v as num).toInt();
String _s(dynamic v) => (v as String?) ?? '';
List<Map<String, dynamic>> _list(dynamic v) =>
    (v as List<dynamic>? ?? const []).map((e) => (e as Map).cast<String, dynamic>()).toList();

// --- addresses ------------------------------------------------------
class AddressDto {
  const AddressDto({
    required this.id,
    this.label,
    required this.recipientName,
    required this.phone,
    required this.line1,
    this.line2,
    required this.city,
    this.region,
    required this.country,
    this.postalCode,
    required this.kind,
    required this.isDefault,
  });

  final String id;
  final String? label;
  final String recipientName;
  final String phone;
  final String line1;
  final String? line2;
  final String city;
  final String? region;
  final String country;
  final String? postalCode;
  final String kind;
  final bool isDefault;

  String get oneLine => [line1, line2, city, region, country].where((s) => (s ?? '').isNotEmpty).join(', ');

  factory AddressDto.fromJson(Map<String, dynamic> j) => AddressDto(
        id: _s(j['id']),
        label: j['label'] as String?,
        recipientName: _s(j['recipientName']),
        phone: _s(j['phone']),
        line1: _s(j['line1']),
        line2: j['line2'] as String?,
        city: _s(j['city']),
        region: j['region'] as String?,
        country: _s(j['country']),
        postalCode: j['postalCode'] as String?,
        kind: j['kind'] as String? ?? 'HOME',
        isDefault: j['isDefault'] == true,
      );
}

// --- cart ----------------------------------------------------------
class CartItemDto {
  const CartItemDto({
    required this.id,
    required this.offerId,
    required this.productId,
    required this.productSlug,
    this.variantId,
    required this.title,
    this.image,
    required this.qty,
    required this.unitPriceMinor,
    required this.lineTotalMinor,
    required this.currentUnitPriceMinor,
    required this.priceChanged,
    required this.available,
  });

  final String id;
  final String offerId;
  final String productId;
  final String productSlug;
  final String? variantId;
  final String title;
  final String? image;
  final int qty;
  final int unitPriceMinor;
  final int lineTotalMinor;
  final int currentUnitPriceMinor;
  final bool priceChanged;
  final bool available;

  factory CartItemDto.fromJson(Map<String, dynamic> j) => CartItemDto(
        id: _s(j['id']),
        offerId: _s(j['offerId']),
        productId: _s(j['productId']),
        productSlug: _s(j['productSlug']),
        variantId: j['variantId'] as String?,
        title: _s(j['title']),
        image: j['image'] as String?,
        qty: _i(j['qty']),
        unitPriceMinor: _i(j['unitPriceMinor']),
        lineTotalMinor: _i(j['lineTotalMinor']),
        currentUnitPriceMinor: _i(j['currentUnitPriceMinor']),
        priceChanged: j['priceChanged'] == true,
        available: j['available'] == true,
      );
}

class CartGroupDto {
  const CartGroupDto({required this.vendorId, required this.vendorName, required this.items, required this.subtotalMinor});
  final String vendorId;
  final String vendorName;
  final List<CartItemDto> items;
  final int subtotalMinor;

  factory CartGroupDto.fromJson(Map<String, dynamic> j) => CartGroupDto(
        vendorId: _s(j['vendorId']),
        vendorName: _s(j['vendorName']),
        items: _list(j['items']).map(CartItemDto.fromJson).toList(),
        subtotalMinor: _i(j['subtotalMinor']),
      );
}

class CartDto {
  const CartDto({
    required this.id,
    required this.currency,
    this.couponCode,
    required this.couponValid,
    required this.couponDiscountMinor,
    required this.freeDelivery,
    required this.groups,
    required this.itemCount,
    required this.subtotalMinor,
    required this.savedForLater,
  });

  final String id;
  final String currency;
  final String? couponCode;
  final bool couponValid;
  final int couponDiscountMinor;
  final bool freeDelivery;
  final List<CartGroupDto> groups;
  final int itemCount;
  final int subtotalMinor;
  final List<CartItemDto> savedForLater;

  bool get isEmpty => groups.isEmpty;
  bool get hasUnavailable => groups.any((g) => g.items.any((i) => !i.available));

  static const empty = CartDto(
    id: '',
    currency: 'GHS',
    couponValid: false,
    couponDiscountMinor: 0,
    freeDelivery: false,
    groups: [],
    itemCount: 0,
    subtotalMinor: 0,
    savedForLater: [],
  );

  factory CartDto.fromJson(Map<String, dynamic> j) => CartDto(
        id: _s(j['id']),
        currency: j['currency'] as String? ?? 'GHS',
        couponCode: j['couponCode'] as String?,
        couponValid: j['couponValid'] == true,
        couponDiscountMinor: _i(j['couponDiscountMinor']),
        freeDelivery: j['freeDelivery'] == true,
        groups: _list(j['groups']).map(CartGroupDto.fromJson).toList(),
        itemCount: _i(j['itemCount']),
        subtotalMinor: _i(j['subtotalMinor']),
        savedForLater: _list(j['savedForLater']).map(CartItemDto.fromJson).toList(),
      );
}

// --- coupons -----------------------------------------------------
class CouponEvalDto {
  const CouponEvalDto({required this.valid, this.reason, this.code, this.type, required this.discountMinor, required this.freeDelivery});
  final bool valid;
  final String? reason;
  final String? code;
  final String? type;
  final int discountMinor;
  final bool freeDelivery;

  factory CouponEvalDto.fromJson(Map<String, dynamic> j) => CouponEvalDto(
        valid: j['valid'] == true,
        reason: j['reason'] as String?,
        code: j['code'] as String?,
        type: j['type'] as String?,
        discountMinor: _i(j['discountMinor']),
        freeDelivery: j['freeDelivery'] == true,
      );
}

class CouponDto {
  const CouponDto({required this.code, required this.type, required this.value, this.minSpendMinor, this.endsAt});
  final String code;
  final String type;
  final int value;
  final int? minSpendMinor;
  final String? endsAt;

  String get blurb => switch (type) {
        'PERCENT' => '${(value / 100).toStringAsFixed(value % 100 == 0 ? 0 : 1)}% off',
        'FREE_DELIVERY' => 'Free delivery',
        _ => 'Discount',
      };

  factory CouponDto.fromJson(Map<String, dynamic> j) => CouponDto(
        code: _s(j['code']),
        type: _s(j['type']),
        value: _i(j['value']),
        minSpendMinor: _iN(j['minSpendMinor']),
        endsAt: j['endsAt'] as String?,
      );
}

// --- checkout ---------------------------------------------------
class QuoteLineDto {
  const QuoteLineDto({required this.key, required this.label, required this.amountMinor});
  final String key;
  final String label;
  final int amountMinor;
  factory QuoteLineDto.fromJson(Map<String, dynamic> j) =>
      QuoteLineDto(key: _s(j['key']), label: _s(j['label']), amountMinor: _i(j['amountMinor']));
}

class CheckoutQuoteDto {
  const CheckoutQuoteDto({
    required this.currency,
    required this.fulfilmentMethod,
    required this.itemsSubtotalMinor,
    required this.discountMinor,
    required this.deliveryFeeMinor,
    required this.serviceFeeMinor,
    required this.taxMinor,
    required this.totalMinor,
    required this.lines,
    this.couponCode,
    required this.couponValid,
    this.couponReason,
    required this.freeDelivery,
    required this.itemCount,
    required this.unavailableItemIds,
  });

  final String currency;
  final String fulfilmentMethod;
  final int itemsSubtotalMinor;
  final int discountMinor;
  final int deliveryFeeMinor;
  final int serviceFeeMinor;
  final int taxMinor;
  final int totalMinor;
  final List<QuoteLineDto> lines;
  final String? couponCode;
  final bool couponValid;
  final String? couponReason;
  final bool freeDelivery;
  final int itemCount;
  final List<String> unavailableItemIds;

  factory CheckoutQuoteDto.fromJson(Map<String, dynamic> j) => CheckoutQuoteDto(
        currency: j['currency'] as String? ?? 'GHS',
        fulfilmentMethod: j['fulfilmentMethod'] as String? ?? 'DELIVERY',
        itemsSubtotalMinor: _i(j['itemsSubtotalMinor']),
        discountMinor: _i(j['discountMinor']),
        deliveryFeeMinor: _i(j['deliveryFeeMinor']),
        serviceFeeMinor: _i(j['serviceFeeMinor']),
        taxMinor: _i(j['taxMinor']),
        totalMinor: _i(j['totalMinor']),
        lines: _list(j['lines']).map(QuoteLineDto.fromJson).toList(),
        couponCode: j['couponCode'] as String?,
        couponValid: j['couponValid'] == true,
        couponReason: j['couponReason'] as String?,
        freeDelivery: j['freeDelivery'] == true,
        itemCount: _i(j['itemCount']),
        unavailableItemIds: (j['unavailableItemIds'] as List<dynamic>? ?? const []).map((e) => e as String).toList(),
      );
}

// --- orders ---------------------------------------------------
class OrderItemDto {
  const OrderItemDto({this.id, required this.title, this.image, required this.qty, required this.unitPriceMinor, required this.totalMinor});
  final String? id;
  final String title;
  final String? image;
  final int qty;
  final int unitPriceMinor;
  final int totalMinor;
  factory OrderItemDto.fromJson(Map<String, dynamic> j) => OrderItemDto(
        id: j['id'] as String?,
        title: _s(j['title']),
        image: j['image'] as String?,
        qty: _i(j['qty']),
        unitPriceMinor: _i(j['unitPriceMinor']),
        totalMinor: _i(j['totalMinor']),
      );
}

/// A `Return` request on a completed sub-order.
class ReturnDto {
  const ReturnDto({
    required this.id,
    required this.reason,
    required this.status,
    required this.items,
    this.resolution,
    required this.createdAt,
  });
  final String id;
  final String reason;
  final String status;
  final List<({String orderItemId, int qty})> items;
  final String? resolution;
  final String createdAt;

  factory ReturnDto.fromJson(Map<String, dynamic> j) => ReturnDto(
        id: _s(j['id']),
        reason: _s(j['reason']),
        status: _s(j['status']),
        items: (j['items'] as List<dynamic>? ?? const [])
            .map((e) => (orderItemId: _s((e as Map)['orderItemId']), qty: _i(e['qty'])))
            .toList(),
        resolution: j['resolution'] as String?,
        createdAt: _s(j['createdAt']),
      );
}

/// A row in the vendor's return queue (`GET /vendors/returns`).
class VendorReturnDto {
  const VendorReturnDto({
    required this.id,
    required this.vendorOrderId,
    required this.vendorOrderNumber,
    required this.orderNumber,
    required this.reason,
    required this.status,
    required this.items,
    this.resolution,
    required this.createdAt,
  });
  final String id;
  final String vendorOrderId;
  final String vendorOrderNumber;
  final String orderNumber;
  final String reason;
  final String status;
  final List<({String orderItemId, int qty})> items;
  final String? resolution;
  final String createdAt;

  factory VendorReturnDto.fromJson(Map<String, dynamic> j) => VendorReturnDto(
        id: _s(j['id']),
        vendorOrderId: _s(j['vendorOrderId']),
        vendorOrderNumber: _s(j['vendorOrderNumber']),
        orderNumber: _s(j['orderNumber']),
        reason: _s(j['reason']),
        status: _s(j['status']),
        items: (j['items'] as List<dynamic>? ?? const [])
            .map((e) => (orderItemId: _s((e as Map)['orderItemId']), qty: _i(e['qty'])))
            .toList(),
        resolution: j['resolution'] as String?,
        createdAt: _s(j['createdAt']),
      );
}

class VendorOrderDto {
  const VendorOrderDto({
    required this.id,
    required this.number,
    required this.vendorName,
    required this.status,
    required this.subtotalMinor,
    required this.items,
    this.pickupCode,
    this.deliveryId,
    this.fulfilmentStatus,
    this.returns = const [],
  });
  final String id;
  final String number;
  final String vendorName;
  final String status;
  final int subtotalMinor;
  final List<OrderItemDto> items;
  final String? pickupCode;
  final String? deliveryId;
  final String? fulfilmentStatus;
  final List<ReturnDto> returns;

  factory VendorOrderDto.fromJson(Map<String, dynamic> j) => VendorOrderDto(
        id: _s(j['id']),
        number: _s(j['number']),
        vendorName: _s(j['vendorName']),
        status: _s(j['status']),
        subtotalMinor: _i(j['subtotalMinor']),
        items: _list(j['items']).map(OrderItemDto.fromJson).toList(),
        pickupCode: (j['fulfilment'] as Map?)?['pickupCode'] as String?,
        deliveryId: (j['fulfilment'] as Map?)?['deliveryId'] as String?,
        fulfilmentStatus: (j['fulfilment'] as Map?)?['status'] as String?,
        returns: _list(j['returns']).map(ReturnDto.fromJson).toList(),
      );
}

class OrderEventDto {
  const OrderEventDto({required this.type, required this.at});
  final String type;
  final String at;
  factory OrderEventDto.fromJson(Map<String, dynamic> j) => OrderEventDto(type: _s(j['type']), at: _s(j['at']));
}

class OrderDto {
  const OrderDto({
    required this.id,
    required this.number,
    required this.status,
    required this.currency,
    required this.itemsSubtotalMinor,
    required this.discountMinor,
    required this.deliveryFeeMinor,
    required this.serviceFeeMinor,
    required this.taxMinor,
    required this.totalMinor,
    required this.fulfilmentMethod,
    this.paymentMethod,
    this.placedAt,
    required this.createdAt,
    required this.vendorOrders,
    required this.events,
    this.invoiceNumber,
  });

  final String id;
  final String number;
  final String status;
  final String currency;
  final int itemsSubtotalMinor;
  final int discountMinor;
  final int deliveryFeeMinor;
  final int serviceFeeMinor;
  final int taxMinor;
  final int totalMinor;
  final String fulfilmentMethod;
  final String? paymentMethod;
  final String? placedAt;
  final String createdAt;
  final List<VendorOrderDto> vendorOrders;
  final List<OrderEventDto> events;
  final String? invoiceNumber;

  int get itemCount => vendorOrders.fold(0, (n, vo) => n + vo.items.fold(0, (m, it) => m + it.qty));

  factory OrderDto.fromJson(Map<String, dynamic> j) => OrderDto(
        id: _s(j['id']),
        number: _s(j['number']),
        status: _s(j['status']),
        currency: j['currency'] as String? ?? 'GHS',
        itemsSubtotalMinor: _i(j['itemsSubtotalMinor']),
        discountMinor: _i(j['discountMinor']),
        deliveryFeeMinor: _i(j['deliveryFeeMinor']),
        serviceFeeMinor: _i(j['serviceFeeMinor']),
        taxMinor: _i(j['taxMinor']),
        totalMinor: _i(j['totalMinor']),
        fulfilmentMethod: j['fulfilmentMethod'] as String? ?? 'DELIVERY',
        paymentMethod: j['paymentMethod'] as String?,
        placedAt: j['placedAt'] as String?,
        createdAt: _s(j['createdAt']),
        vendorOrders: _list(j['vendorOrders']).map(VendorOrderDto.fromJson).toList(),
        events: _list(j['events']).map(OrderEventDto.fromJson).toList(),
        invoiceNumber: (j['invoice'] as Map?)?['number'] as String?,
      );
}

class OrderCardDto {
  const OrderCardDto({
    required this.id,
    required this.number,
    required this.status,
    required this.totalMinor,
    required this.currency,
    required this.itemCount,
    required this.vendorCount,
    required this.thumbs,
    required this.createdAt,
  });
  final String id;
  final String number;
  final String status;
  final int totalMinor;
  final String currency;
  final int itemCount;
  final int vendorCount;
  final List<String> thumbs;
  final String createdAt;

  factory OrderCardDto.fromJson(Map<String, dynamic> j) => OrderCardDto(
        id: _s(j['id']),
        number: _s(j['number']),
        status: _s(j['status']),
        totalMinor: _i(j['totalMinor']),
        currency: j['currency'] as String? ?? 'GHS',
        itemCount: _i(j['itemCount']),
        vendorCount: _i(j['vendorCount']),
        thumbs: (j['thumbs'] as List<dynamic>? ?? const []).map((e) => e as String).toList(),
        createdAt: _s(j['createdAt']),
      );
}

// --- seller (vendor) order fulfilment ------------------------

/// A row in the seller's incoming-orders list (`GET /vendors/orders`).
class SellerOrderDto {
  const SellerOrderDto({
    required this.id,
    required this.number,
    required this.orderNumber,
    required this.status,
    required this.fulfilmentMethod,
    required this.currency,
    this.buyerName,
    required this.subtotalMinor,
    required this.commissionMinor,
    required this.payoutMinor,
    required this.itemCount,
    required this.items,
    required this.createdAt,
  });

  final String id;
  final String number;
  final String orderNumber;
  final String status;
  final String fulfilmentMethod;
  final String currency;
  final String? buyerName;
  final int subtotalMinor;
  final int commissionMinor;
  final int payoutMinor;
  final int itemCount;
  final List<({String title, int qty, int totalMinor})> items;
  final String createdAt;

  factory SellerOrderDto.fromJson(Map<String, dynamic> j) => SellerOrderDto(
        id: _s(j['id']),
        number: _s(j['number']),
        orderNumber: _s(j['orderNumber']),
        status: _s(j['status']),
        fulfilmentMethod: j['fulfilmentMethod'] as String? ?? 'DELIVERY',
        currency: j['currency'] as String? ?? 'GHS',
        buyerName: j['buyerName'] as String?,
        subtotalMinor: _i(j['subtotalMinor']),
        commissionMinor: _i(j['commissionMinor']),
        payoutMinor: _i(j['payoutMinor']),
        itemCount: _i(j['itemCount']),
        items: _list(j['items'])
            .map((it) => (title: _s(it['title']), qty: _i(it['qty']), totalMinor: _i(it['totalMinor'])))
            .toList(),
        createdAt: _s(j['createdAt']),
      );
}

/// The seller's full view of one sub-order (`GET /vendors/orders/:id`).
class SellerOrderDetailDto {
  const SellerOrderDetailDto({
    required this.id,
    required this.number,
    required this.orderNumber,
    required this.status,
    required this.fulfilmentMethod,
    required this.currency,
    required this.subtotalMinor,
    required this.commissionMinor,
    required this.payoutMinor,
    required this.items,
    required this.events,
    this.address,
    this.pickupCode,
    this.fulfilmentStatus,
    this.deliveryId,
    this.placedAt,
    required this.createdAt,
    this.returns = const [],
  });

  final String id;
  final String number;
  final String orderNumber;
  final String status;
  final String fulfilmentMethod;
  final String currency;
  final int subtotalMinor;
  final int commissionMinor;
  final int payoutMinor;
  final List<OrderItemDto> items;
  final List<OrderEventDto> events;
  final Map<String, dynamic>? address;
  final String? pickupCode;
  final String? fulfilmentStatus;
  final String? deliveryId;
  final String? placedAt;
  final String createdAt;
  final List<ReturnDto> returns;

  bool get isPickup => fulfilmentMethod == 'PICKUP';

  String get addressLine {
    final a = address;
    if (a == null) return '';
    return [a['name'], a['line1'], a['line2'], a['city'], a['region']]
        .where((s) => (s ?? '').toString().isNotEmpty)
        .join(', ');
  }

  factory SellerOrderDetailDto.fromJson(Map<String, dynamic> j) => SellerOrderDetailDto(
        id: _s(j['id']),
        number: _s(j['number']),
        orderNumber: _s(j['orderNumber']),
        status: _s(j['status']),
        fulfilmentMethod: j['fulfilmentMethod'] as String? ?? 'DELIVERY',
        currency: j['currency'] as String? ?? 'GHS',
        subtotalMinor: _i(j['subtotalMinor']),
        commissionMinor: _i(j['commissionMinor']),
        payoutMinor: _i(j['payoutMinor']),
        items: _list(j['items']).map(OrderItemDto.fromJson).toList(),
        events: _list(j['events']).map(OrderEventDto.fromJson).toList(),
        address: (j['address'] as Map?)?.cast<String, dynamic>(),
        pickupCode: (j['fulfilment'] as Map?)?['pickupCode'] as String?,
        fulfilmentStatus: (j['fulfilment'] as Map?)?['status'] as String?,
        deliveryId: (j['fulfilment'] as Map?)?['deliveryId'] as String?,
        placedAt: j['placedAt'] as String?,
        createdAt: _s(j['createdAt']),
        returns: _list(j['returns']).map(ReturnDto.fromJson).toList(),
      );
}

/// A row in a vendor's or courier's payout history.
class PayoutDto {
  const PayoutDto({required this.id, required this.amountMinor, required this.currency, required this.status, required this.at});
  final String id;
  final int amountMinor;
  final String currency;
  final String status;
  final String at;

  factory PayoutDto.fromJson(Map<String, dynamic> j) => PayoutDto(
        id: _s(j['id']),
        amountMinor: _i(j['amountMinor']),
        currency: j['currency'] as String? ?? 'GHS',
        status: _s(j['status']),
        at: _s(j['at']),
      );
}

// --- payment methods ----------------------------------------
class PaymentMethodDto {
  const PaymentMethodDto({
    required this.id,
    required this.gateway,
    this.brand,
    this.last4,
    this.expMonth,
    this.expYear,
    required this.isDefault,
  });
  final String id;
  final String gateway;
  final String? brand;
  final String? last4;
  final int? expMonth;
  final int? expYear;
  final bool isDefault;

  String get label {
    final b = (brand == null || brand!.isEmpty) ? gateway : brand!;
    return last4 == null || last4!.isEmpty ? b : '$b ···· $last4';
  }

  String? get expiry =>
      (expMonth == null || expYear == null) ? null : '${expMonth.toString().padLeft(2, '0')}/${expYear! % 100}';

  factory PaymentMethodDto.fromJson(Map<String, dynamic> j) => PaymentMethodDto(
        id: _s(j['id']),
        gateway: _s(j['gateway']),
        brand: j['brand'] as String?,
        last4: j['last4'] as String?,
        expMonth: _iN(j['expMonth']),
        expYear: _iN(j['expYear']),
        isDefault: j['isDefault'] == true,
      );
}

// --- wallet ---------------------------------------------------
class WalletDto {
  const WalletDto({required this.currency, required this.balanceMinor, required this.pinRequired});
  final String currency;
  final int balanceMinor;
  final bool pinRequired;
  factory WalletDto.fromJson(Map<String, dynamic> j) => WalletDto(
        currency: j['currency'] as String? ?? 'GHS',
        balanceMinor: _i(j['balanceMinor']),
        pinRequired: j['pinRequired'] == true,
      );
}

class WalletTxnDto {
  const WalletTxnDto({
    required this.id,
    required this.direction,
    required this.amountMinor,
    required this.balanceAfterMinor,
    required this.description,
    required this.at,
  });
  final String id;
  final String direction; // credit | debit
  final int amountMinor;
  final int balanceAfterMinor;
  final String description;
  final String at;
  bool get isCredit => direction == 'credit';

  factory WalletTxnDto.fromJson(Map<String, dynamic> j) => WalletTxnDto(
        id: _s(j['id']),
        direction: _s(j['direction']),
        amountMinor: _i(j['amountMinor']),
        balanceAfterMinor: _i(j['balanceAfterMinor']),
        description: _s(j['description']),
        at: _s(j['at']),
      );
}
