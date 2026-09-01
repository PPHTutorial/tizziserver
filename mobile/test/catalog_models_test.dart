import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/catalog_models.dart';

void main() {
  test('ProductDetail parses offers, variants, gas listing', () {
    final d = ProductDetail.fromJson({
      'id': 'p1',
      'slug': 'gas-12',
      'title': '12.5kg Cylinder',
      'description': 'Full cylinder.',
      'brand': 'SwiftGas',
      'condition': 'NEW',
      'ratingAvg': 4.5,
      'ratingCount': 8,
      'category': {'id': 'c1', 'slug': 'cyl', 'name': 'Cylinders', 'path': '/cyl'},
      'media': [
        {'kind': 'IMAGE', 'fileKey': 'a.jpg', 'alt': null},
        {'kind': 'IMAGE', 'fileKey': 'b.jpg', 'alt': null},
      ],
      'variants': [
        {'id': 'v1', 'name': 'Default', 'sku': 's1', 'priceMinor': 28000, 'compareAtMinor': null, 'options': {}},
      ],
      'fromPriceMinor': 28000,
      'currency': 'GHS',
      'offers': [
        {
          'id': 'o1',
          'priceMinor': 28000,
          'currency': 'GHS',
          'condition': 'NEW',
          'fulfilment': {},
          'vendor': {'id': 'v1', 'displayName': 'SwiftGas Depot', 'logo': null, 'ratingAvg': 0, 'ratingCount': 0},
          'gas': {
            'cylinderType': 'STANDARD',
            'weightKg': 12.5,
            'capacityL': 26.2,
            'requiresExchange': true,
            'depositMinor': 0,
          },
        },
      ],
      'reviewCount': 8,
      'questionCount': 0,
      'reviews': <dynamic>[],
      'questions': <dynamic>[],
    });

    expect(d.images, ['a.jpg', 'b.jpg']);
    expect(d.offers.single.vendorName, 'SwiftGas Depot');
    expect(d.offers.single.gas!.weightKg, 12.5);
    expect(d.offers.single.gas!.requiresExchange, isTrue);
  });

  test('formatMoney groups thousands', () {
    expect(formatMoney(184900, 'GHS'), 'GHS 1,849.00');
    expect(formatMoney(null, 'GHS'), '—');
    expect(formatMoney(50, 'USD'), 'USD 0.50');
  });

  test('ProductCard tolerates missing optional fields', () {
    final p = ProductCard.fromJson({'id': 'x', 'slug': 's', 'title': 'T'});
    expect(p.fromPriceMinor, isNull);
    expect(p.offerCount, 0);
    expect(p.currency, 'GHS');
  });

  test('VendorStatus.isApproved / isPending', () {
    expect(VendorStatus.fromJson({'onboarded': true, 'kycStatus': 'APPROVED'}).isApproved, isTrue);
    expect(VendorStatus.fromJson({'onboarded': true, 'kycStatus': 'PENDING'}).isPending, isTrue);
    expect(VendorStatus.fromJson({'onboarded': false}).onboarded, isFalse);
  });
}
