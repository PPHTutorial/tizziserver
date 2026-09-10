import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/delivery_models.dart';

void main() {
  test('DeliveryDto parses endpoints, courier, verification flags + codes', () {
    final d = DeliveryDto.fromJson({
      'id': 'dlv1',
      'code': 'DLV-260902-ABCDE',
      'status': 'EN_ROUTE_DROPOFF',
      'active': true,
      'vehicleType': 'MOTORBIKE',
      'distanceM': 5400,
      'durationS': 900,
      'feeMinor': 2450,
      'courierPayoutMinor': 1960,
      'tipMinor': 0,
      'currency': 'GHS',
      'pickup': {
        'lat': 5.6037,
        'lng': -0.187,
        'address': {'name': 'Accra Mall', 'city': 'Accra'},
        'contact': {'name': 'Shop', 'phone': '+233200000900'},
      },
      'dropoff': {
        'lat': 5.62,
        'lng': -0.17,
        'address': {'line1': 'East Legon'},
        'contact': {'name': 'Me', 'phone': '+233200000901'},
      },
      'items': [
        {'id': 'it1', 'description': 'Parcel', 'qty': 2, 'photoKey': null, 'valueMinor': null, 'fragile': true},
      ],
      'courier': {
        'id': 'c1',
        'name': 'Kofi Mensah',
        'phone': '+233200000010',
        'avatar': null,
        'ratingAvg': 4.8,
        'ratingCount': 24,
        'completedDeliveries': 42,
        'vehicle': {'type': 'MOTORBIKE', 'make': 'Honda', 'model': 'ACE 110', 'color': 'Red', 'plate': 'GR-0010-24'},
      },
      'pickupVerification': {'method': 'OTP', 'verified': true, 'packageCount': 2, 'photoKeys': []},
      'dropoffVerification': {'method': 'OTP', 'verified': false, 'recipientName': null},
      'proofOfDelivery': null,
      'dropoffCode': '4821',
      'etaAt': '2026-09-02T10:15:00.000Z',
      'events': [
        {'type': 'CREATED', 'actorType': 'SYSTEM', 'at': '2026-09-02T09:00:00.000Z', 'data': null, 'lat': null, 'lng': null},
      ],
      'ratings': [],
    });

    expect(d.code, 'DLV-260902-ABCDE');
    expect(d.pickup.contactPhone, '+233200000900');
    expect(d.pickup.addressLine, 'Accra Mall, Accra');
    expect(d.items.single.qty, 2);
    expect(d.items.single.fragile, true);
    expect(d.courier!.vehicle!.label, 'Red Honda ACE 110');
    expect(d.pickupVerified, true);
    expect(d.dropoffVerified, false);
    expect(d.dropoffCode, '4821');
    expect(d.isFinal, false);
  });

  test('courierNextStatus walks the happy path and stops at COMPLETED', () {
    expect(courierNextStatus('COURIER_ASSIGNED'), 'COURIER_EN_ROUTE_PICKUP');
    expect(courierNextStatus('ARRIVED_PICKUP'), 'PICKED_UP');
    expect(courierNextStatus('DELIVERED'), 'COMPLETED');
    expect(courierNextStatus('COMPLETED'), isNull);
  });

  test('JobCardDto remaining countdown + fields', () {
    final j = JobCardDto.fromJson({
      'offerId': 'of1',
      'deliveryId': 'dlv1',
      'state': 'OFFERED',
      'payoutMinor': 1960,
      'currency': 'GHS',
      'pickupArea': 'Greater Accra',
      'dropoffArea': '~5.62, -0.17',
      'distanceM': 5400,
      'durationS': 900,
      'vehicleType': 'MOTORBIKE',
      'itemCount': 1,
      'requirements': null,
      'expiresAt': DateTime.now().add(const Duration(seconds: 20)).toIso8601String(),
      'pickupDistanceM': 540,
    });
    expect(j.pickupArea, 'Greater Accra');
    expect(j.remaining.inSeconds, greaterThan(10));
  });

  test('CourierDashboardDto flattens nested earnings + activeDelivery', () {
    final d = CourierDashboardDto.fromJson({
      'onboarded': true,
      'status': 'ACTIVE',
      'onlineStatus': 'ON_JOB',
      'ratingAvg': 4.8,
      'completedDeliveries': 42,
      'acceptanceRate': 92,
      'earnings': {'balanceMinor': 12000, 'today': 3400, 'week': 21000, 'currency': 'GHS'},
      'todayOffers': 6,
      'activeDelivery': {'id': 'dlv1', 'code': 'DLV-1', 'status': 'PICKED_UP', 'etaAt': null, 'payoutMinor': 1960},
    });
    expect(d.isOnline, true);
    expect(d.balanceMinor, 12000);
    expect(d.activeDeliveryId, 'dlv1');
    expect(d.activePayoutMinor, 1960);
  });
}
