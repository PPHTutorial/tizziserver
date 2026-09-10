import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/commerce_models.dart';

void main() {
  test('CartDto groups + totals + unavailable flag', () {
    final cart = CartDto.fromJson({
      'id': 'cart1',
      'currency': 'GHS',
      'couponCode': 'WELCOME10',
      'couponValid': true,
      'couponDiscountMinor': 1849,
      'freeDelivery': false,
      'itemCount': 3,
      'subtotalMinor': 184900,
      'groups': [
        {
          'vendorId': 'v1',
          'vendorName': 'Kumasi Gadget Store',
          'subtotalMinor': 184900,
          'items': [
            {
              'id': 'ci1',
              'offerId': 'o1',
              'productId': 'p1',
              'productSlug': 'orbit-a54-phone',
              'variantId': null,
              'title': 'Orbit A54',
              'image': null,
              'qty': 1,
              'unitPriceMinor': 184900,
              'lineTotalMinor': 184900,
              'currentUnitPriceMinor': 184900,
              'priceChanged': false,
              'available': true,
            },
          ],
        },
      ],
      'savedForLater': [
        {
          'id': 'ci2',
          'offerId': 'o2',
          'productId': 'p2',
          'productSlug': 'thing',
          'variantId': null,
          'title': 'Saved thing',
          'image': null,
          'qty': 2,
          'unitPriceMinor': 5000,
          'lineTotalMinor': 10000,
          'currentUnitPriceMinor': 5000,
          'priceChanged': false,
          'available': false,
        },
      ],
    });

    expect(cart.groups, hasLength(1));
    expect(cart.groups.first.items.first.title, 'Orbit A54');
    expect(cart.itemCount, 3);
    expect(cart.couponValid, isTrue);
    expect(cart.savedForLater, hasLength(1));
    expect(cart.hasUnavailable, isFalse); // saved-for-later items don't block checkout
    expect(CartDto.empty.isEmpty, isTrue);
  });

  test('CheckoutQuoteDto parses fee lines', () {
    final q = CheckoutQuoteDto.fromJson({
      'currency': 'GHS',
      'fulfilmentMethod': 'DELIVERY',
      'itemsSubtotalMinor': 100000,
      'discountMinor': 10000,
      'deliveryFeeMinor': 1500,
      'serviceFeeMinor': 1800,
      'taxMinor': 0,
      'totalMinor': 93300,
      'lines': [
        {'key': 'subtotal', 'label': 'Items subtotal', 'amountMinor': 100000},
        {'key': 'discount', 'label': 'Discount', 'amountMinor': -10000},
        {'key': 'total', 'label': 'Total', 'amountMinor': 93300},
      ],
      'couponCode': 'SAVE20',
      'couponValid': true,
      'couponReason': null,
      'freeDelivery': false,
      'itemCount': 2,
      'unavailableItemIds': <String>[],
    });
    expect(q.totalMinor, 93300);
    expect(q.lines.map((l) => l.key), containsAll(['subtotal', 'discount', 'total']));
    expect(q.lines.firstWhere((l) => l.key == 'discount').amountMinor, -10000);
  });

  test('OrderDto rolls up item count across vendor sub-orders', () {
    final o = OrderDto.fromJson({
      'id': 'o1',
      'number': 'ST-260902-ABC123',
      'status': 'PLACED',
      'currency': 'GHS',
      'itemsSubtotalMinor': 374800,
      'discountMinor': 0,
      'deliveryFeeMinor': 0,
      'serviceFeeMinor': 7496,
      'taxMinor': 0,
      'totalMinor': 382296,
      'fulfilmentMethod': 'PICKUP',
      'paymentMethod': 'wallet',
      'placedAt': '2026-09-02T01:00:00.000Z',
      'createdAt': '2026-09-02T01:00:00.000Z',
      'vendorOrders': [
        {
          'id': 'vo1',
          'number': 'ST-260902-ABC123-V1',
          'vendorName': 'A',
          'status': 'NEW',
          'subtotalMinor': 184900,
          'fulfilment': {'method': 'PICKUP', 'status': 'PENDING', 'pickupCode': 'X1Y2Z3'},
          'items': [
            {'title': 'Orbit A54', 'image': null, 'qty': 1, 'unitPriceMinor': 184900, 'totalMinor': 184900},
          ],
        },
        {
          'id': 'vo2',
          'number': 'ST-260902-ABC123-V2',
          'vendorName': 'B',
          'status': 'NEW',
          'subtotalMinor': 189900,
          'fulfilment': null,
          'items': [
            {'title': 'Orbit A54', 'image': null, 'qty': 1, 'unitPriceMinor': 189900, 'totalMinor': 189900},
          ],
        },
      ],
      'events': [
        {'type': 'CREATED', 'actorType': 'USER', 'at': '2026-09-02T01:00:00.000Z', 'data': null},
        {'type': 'PAID', 'actorType': 'USER', 'at': '2026-09-02T01:00:01.000Z', 'data': null},
      ],
      'invoice': {'number': 'INV-ST-260902-ABC123', 'issuedAt': '2026-09-02T02:00:00.000Z'},
    });
    expect(o.vendorOrders, hasLength(2));
    expect(o.itemCount, 2);
    expect(o.vendorOrders.first.pickupCode, 'X1Y2Z3');
    expect(o.events.map((e) => e.type), ['CREATED', 'PAID']);
    expect(o.invoiceNumber, 'INV-ST-260902-ABC123');
  });

  test('WalletTxnDto direction helper', () {
    final credit = WalletTxnDto.fromJson({
      'id': 't1',
      'direction': 'credit',
      'amountMinor': 50000,
      'balanceAfterMinor': 50000,
      'description': 'Wallet top-up',
      'at': '2026-09-02T01:00:00.000Z',
    });
    final debit = WalletTxnDto.fromJson({
      'id': 't2',
      'direction': 'debit',
      'amountMinor': 38230,
      'balanceAfterMinor': 11770,
      'description': 'Order ST-260902-ABC123',
      'at': '2026-09-02T01:01:00.000Z',
    });
    expect(credit.isCredit, isTrue);
    expect(debit.isCredit, isFalse);
  });

  test('CouponDto blurb', () {
    expect(CouponDto.fromJson({'code': 'W', 'type': 'PERCENT', 'value': 1000}).blurb, '10% off');
    expect(CouponDto.fromJson({'code': 'F', 'type': 'FREE_DELIVERY', 'value': 0}).blurb, 'Free delivery');
  });

  test('ReturnDto parses items + resolution', () {
    final r = ReturnDto.fromJson({
      'id': 'ret1',
      'reason': 'wrong size',
      'status': 'REQUESTED',
      'items': [
        {'orderItemId': 'oi1', 'qty': 1},
      ],
      'resolution': null,
      'createdAt': '2026-09-02T01:00:00.000Z',
    });
    expect(r.status, 'REQUESTED');
    expect(r.items.single.orderItemId, 'oi1');
    expect(r.items.single.qty, 1);
  });

  test('VendorOrderDto embeds its returns', () {
    final vo = VendorOrderDto.fromJson({
      'id': 'vo1',
      'number': 'ST-1-V1',
      'vendorName': 'A',
      'status': 'COMPLETED',
      'subtotalMinor': 184900,
      'fulfilment': null,
      'items': [
        {'id': 'oi1', 'title': 'Orbit A54', 'image': null, 'qty': 2, 'unitPriceMinor': 92450, 'totalMinor': 184900},
      ],
      'returns': [
        {
          'id': 'ret1',
          'reason': 'wrong size',
          'status': 'APPROVED',
          'items': [
            {'orderItemId': 'oi1', 'qty': 1},
          ],
          'resolution': null,
          'createdAt': '2026-09-02T01:00:00.000Z',
        },
      ],
    });
    expect(vo.items.single.id, 'oi1');
    expect(vo.returns, hasLength(1));
    expect(vo.returns.single.status, 'APPROVED');
  });

  test('VendorReturnDto parses the vendor return-queue row', () {
    final r = VendorReturnDto.fromJson({
      'id': 'ret1',
      'vendorOrderId': 'vo1',
      'vendorOrderNumber': 'ST-1-V1',
      'orderNumber': 'ST-1',
      'reason': 'wrong size',
      'status': 'REQUESTED',
      'items': [
        {'orderItemId': 'oi1', 'qty': 1},
      ],
      'resolution': null,
      'createdAt': '2026-09-02T01:00:00.000Z',
    });
    expect(r.orderNumber, 'ST-1');
    expect(r.items.single.qty, 1);
  });

  test('PayoutDto parses a payout-history row', () {
    final p = PayoutDto.fromJson({
      'id': 'po1',
      'amountMinor': 50000,
      'currency': 'GHS',
      'status': 'PENDING',
      'at': '2026-09-08T01:00:00.000Z',
    });
    expect(p.amountMinor, 50000);
    expect(p.status, 'PENDING');
  });

  test('AddressDto one-line formatting', () {
    final a = AddressDto.fromJson({
      'id': 'a1',
      'recipientName': 'Ama',
      'phone': '+233200000000',
      'line1': '1 Ring Rd',
      'line2': null,
      'city': 'Accra',
      'region': null,
      'country': 'GH',
      'kind': 'HOME',
      'isDefault': true,
    });
    expect(a.oneLine, '1 Ring Rd, Accra, GH');
    expect(a.isDefault, isTrue);
  });
}
