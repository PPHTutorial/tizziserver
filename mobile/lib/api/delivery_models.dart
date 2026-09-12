// Phase 4 delivery + courier models — mirrors packages/contracts/src/delivery.ts.

int _i(dynamic v) => v == null ? 0 : (v as num).toInt();
int? _iN(dynamic v) => v == null ? null : (v as num).toInt();
double _d(dynamic v) => v == null ? 0 : (v as num).toDouble();
double? _dN(dynamic v) => v == null ? null : (v as num).toDouble();
String _s(dynamic v) => (v as String?) ?? '';
DateTime? _dt(dynamic v) => v == null ? null : DateTime.tryParse(v as String);
List<Map<String, dynamic>> _list(dynamic v) =>
    (v as List<dynamic>? ?? const []).map((e) => (e as Map).cast<String, dynamic>()).toList();

class LatLngDto {
  const LatLngDto(this.lat, this.lng);
  final double lat;
  final double lng;
  factory LatLngDto.fromJson(Map<String, dynamic> j) => LatLngDto(_d(j['lat']), _d(j['lng']));
}

class DeliveryEndpointDto {
  const DeliveryEndpointDto({required this.lat, required this.lng, this.address, this.contact});
  final double lat;
  final double lng;
  final Map<String, dynamic>? address;
  final Map<String, dynamic>? contact;

  String get contactName => (contact?['name'] as String?) ?? '';
  String get contactPhone => (contact?['phone'] as String?) ?? '';
  String get addressLine {
    final a = address;
    if (a == null) return '';
    return [a['name'], a['line1'], a['line2'], a['city']].where((s) => (s ?? '').toString().isNotEmpty).join(', ');
  }

  factory DeliveryEndpointDto.fromJson(Map<String, dynamic> j) => DeliveryEndpointDto(
        lat: _d(j['lat']),
        lng: _d(j['lng']),
        address: (j['address'] as Map?)?.cast<String, dynamic>(),
        contact: (j['contact'] as Map?)?.cast<String, dynamic>(),
      );
}

class DeliveryVehicleDto {
  const DeliveryVehicleDto({required this.type, this.make, this.model, this.color, this.plate});
  final String type;
  final String? make;
  final String? model;
  final String? color;
  final String? plate;
  String get label => [color, make, model].where((s) => (s ?? '').isNotEmpty).join(' ').trim();
  factory DeliveryVehicleDto.fromJson(Map<String, dynamic> j) => DeliveryVehicleDto(
        type: _s(j['type']),
        make: j['make'] as String?,
        model: j['model'] as String?,
        color: j['color'] as String?,
        plate: j['plate'] as String?,
      );
}

class DeliveryCourierDto {
  const DeliveryCourierDto({
    required this.id,
    required this.name,
    this.phone,
    this.avatar,
    required this.ratingAvg,
    required this.ratingCount,
    required this.completedDeliveries,
    this.vehicle,
  });
  final String id;
  final String name;
  final String? phone;
  final String? avatar;
  final double ratingAvg;
  final int ratingCount;
  final int completedDeliveries;
  final DeliveryVehicleDto? vehicle;
  factory DeliveryCourierDto.fromJson(Map<String, dynamic> j) => DeliveryCourierDto(
        id: _s(j['id']),
        name: _s(j['name']),
        phone: j['phone'] as String?,
        avatar: j['avatar'] as String?,
        ratingAvg: _d(j['ratingAvg']),
        ratingCount: _i(j['ratingCount']),
        completedDeliveries: _i(j['completedDeliveries']),
        vehicle: j['vehicle'] == null ? null : DeliveryVehicleDto.fromJson((j['vehicle'] as Map).cast<String, dynamic>()),
      );
}

class DeliveryEventDto {
  const DeliveryEventDto({required this.type, required this.actorType, required this.at, this.lat, this.lng});
  final String type;
  final String actorType;
  final DateTime at;
  final double? lat;
  final double? lng;
  factory DeliveryEventDto.fromJson(Map<String, dynamic> j) => DeliveryEventDto(
        type: _s(j['type']),
        actorType: _s(j['actorType']),
        at: _dt(j['at']) ?? DateTime.now(),
        lat: _dN(j['lat']),
        lng: _dN(j['lng']),
      );
}

class DeliveryDto {
  const DeliveryDto({
    required this.id,
    required this.code,
    required this.status,
    required this.active,
    required this.vehicleType,
    required this.distanceM,
    required this.durationS,
    required this.feeMinor,
    this.courierPayoutMinor,
    required this.tipMinor,
    required this.currency,
    required this.pickup,
    required this.dropoff,
    required this.items,
    this.courier,
    this.pickupVerified = false,
    this.dropoffVerified = false,
    this.podPhotos = const [],
    this.pickupCode,
    this.dropoffCode,
    this.etaAt,
    this.scheduledFor,
    this.assignedAt,
    this.deliveredAt,
    this.completedAt,
    this.cancelReason,
    required this.events,
    required this.ratings,
  });

  final String id;
  final String code;
  final String status;
  final bool active;
  final String vehicleType;
  final int distanceM;
  final int durationS;
  final int feeMinor;
  final int? courierPayoutMinor;
  final int tipMinor;
  final String currency;
  final DeliveryEndpointDto pickup;
  final DeliveryEndpointDto dropoff;
  final List<({String description, int qty, bool fragile})> items;
  final DeliveryCourierDto? courier;
  final bool pickupVerified;
  final bool dropoffVerified;
  final List<String> podPhotos;
  final String? pickupCode;
  final String? dropoffCode;
  final DateTime? etaAt;
  final DateTime? scheduledFor;
  final DateTime? assignedAt;
  final DateTime? deliveredAt;
  final DateTime? completedAt;
  final String? cancelReason;
  final List<DeliveryEventDto> events;
  final List<({String role, int stars})> ratings;

  bool get isFinal => const {
        'COMPLETED',
        'CANCELLED_BY_CUSTOMER',
        'CANCELLED_BY_COURIER',
        'CANCELLED_BY_SYSTEM',
      }.contains(status);

  factory DeliveryDto.fromJson(Map<String, dynamic> j) => DeliveryDto(
        id: _s(j['id']),
        code: _s(j['code']),
        status: _s(j['status']),
        active: j['active'] == true,
        vehicleType: j['vehicleType'] as String? ?? 'MOTORBIKE',
        distanceM: _i(j['distanceM']),
        durationS: _i(j['durationS']),
        feeMinor: _i(j['feeMinor']),
        courierPayoutMinor: _iN(j['courierPayoutMinor']),
        tipMinor: _i(j['tipMinor']),
        currency: j['currency'] as String? ?? 'GHS',
        pickup: DeliveryEndpointDto.fromJson((j['pickup'] as Map).cast<String, dynamic>()),
        dropoff: DeliveryEndpointDto.fromJson((j['dropoff'] as Map).cast<String, dynamic>()),
        items: _list(j['items'])
            .map((it) => (description: _s(it['description']), qty: _i(it['qty']), fragile: it['fragile'] == true))
            .toList(),
        courier: j['courier'] == null ? null : DeliveryCourierDto.fromJson((j['courier'] as Map).cast<String, dynamic>()),
        pickupVerified: (j['pickupVerification'] as Map?)?['verified'] == true,
        dropoffVerified: (j['dropoffVerification'] as Map?)?['verified'] == true,
        podPhotos: (((j['proofOfDelivery'] as Map?)?['photoKeys']) as List<dynamic>? ?? const []).cast<String>(),
        pickupCode: j['pickupCode'] as String?,
        dropoffCode: j['dropoffCode'] as String?,
        etaAt: _dt(j['etaAt']),
        scheduledFor: _dt(j['scheduledFor']),
        assignedAt: _dt(j['assignedAt']),
        deliveredAt: _dt(j['deliveredAt']),
        completedAt: _dt(j['completedAt']),
        cancelReason: j['cancelReason'] as String?,
        events: _list(j['events']).map(DeliveryEventDto.fromJson).toList(),
        ratings: _list(j['ratings']).map((r) => (role: _s(r['role']), stars: _i(r['stars']))).toList(),
      );
}

class DeliveryTrackDto {
  const DeliveryTrackDto({
    required this.status,
    this.etaAt,
    required this.pickup,
    required this.dropoff,
    this.courier,
    this.route = const [],
    required this.trail,
    required this.distanceRemainingM,
  });
  final String status;
  final DateTime? etaAt;
  final LatLngDto pickup;
  final LatLngDto dropoff;
  final ({double lat, double lng, double? heading, DateTime at})? courier;

  /// Road route for the courier's current leg (decoded from the server's
  /// encoded polyline); empty when the server had no routing provider.
  final List<LatLngDto> route;
  final List<LatLngDto> trail;
  final int distanceRemainingM;

  factory DeliveryTrackDto.fromJson(Map<String, dynamic> j) {
    final c = (j['courier'] as Map?)?.cast<String, dynamic>();
    return DeliveryTrackDto(
      status: _s(j['status']),
      etaAt: _dt(j['etaAt']),
      pickup: LatLngDto.fromJson((j['pickup'] as Map).cast<String, dynamic>()),
      dropoff: LatLngDto.fromJson((j['dropoff'] as Map).cast<String, dynamic>()),
      courier: c == null ? null : (lat: _d(c['lat']), lng: _d(c['lng']), heading: _dN(c['heading']), at: _dt(c['at']) ?? DateTime.now()),
      route: decodePolyline(j['routePolyline'] as String?),
      trail: (j['trail'] as List<dynamic>? ?? const []).map((e) => LatLngDto.fromJson((e as Map).cast<String, dynamic>())).toList(),
      distanceRemainingM: _i(j['distanceRemainingM']),
    );
  }
}

/// Decodes a Google-encoded polyline string into lat/lng points (precision 5).
List<LatLngDto> decodePolyline(String? encoded) {
  if (encoded == null || encoded.isEmpty) return const [];
  final points = <LatLngDto>[];
  int index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    int shift = 0, result = 0, b;
    do {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    shift = 0;
    result = 0;
    do {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    points.add(LatLngDto(lat / 1e5, lng / 1e5));
  }
  return points;
}

class DeliveryEstimateDto {
  const DeliveryEstimateDto({required this.distanceM, required this.durationS, required this.feeMinor, required this.currency, this.polyline});
  final int distanceM;
  final int durationS;
  final int feeMinor;
  final String currency;
  final String? polyline;
  factory DeliveryEstimateDto.fromJson(Map<String, dynamic> j) => DeliveryEstimateDto(
        distanceM: _i(j['distanceM']),
        durationS: _i(j['durationS']),
        feeMinor: _i(j['feeMinor']),
        currency: j['currency'] as String? ?? 'GHS',
        polyline: j['polyline'] as String?,
      );
}

class JobCardDto {
  const JobCardDto({
    required this.offerId,
    required this.deliveryId,
    required this.payoutMinor,
    required this.currency,
    required this.pickupArea,
    required this.dropoffArea,
    required this.distanceM,
    required this.durationS,
    required this.vehicleType,
    required this.itemCount,
    required this.expiresAt,
    required this.pickupDistanceM,
  });
  final String offerId;
  final String deliveryId;
  final int payoutMinor;
  final String currency;
  final String pickupArea;
  final String dropoffArea;
  final int distanceM;
  final int durationS;
  final String vehicleType;
  final int itemCount;
  final DateTime expiresAt;
  final int pickupDistanceM;

  Duration get remaining => expiresAt.difference(DateTime.now());

  factory JobCardDto.fromJson(Map<String, dynamic> j) => JobCardDto(
        offerId: _s(j['offerId']),
        deliveryId: _s(j['deliveryId']),
        payoutMinor: _i(j['payoutMinor']),
        currency: j['currency'] as String? ?? 'GHS',
        pickupArea: _s(j['pickupArea']),
        dropoffArea: _s(j['dropoffArea']),
        distanceM: _i(j['distanceM']),
        durationS: _i(j['durationS']),
        vehicleType: j['vehicleType'] as String? ?? 'MOTORBIKE',
        itemCount: _i(j['itemCount']),
        expiresAt: _dt(j['expiresAt']) ?? DateTime.now(),
        pickupDistanceM: _i(j['pickupDistanceM']),
      );
}

class EarningsSummaryDto {
  const EarningsSummaryDto({
    required this.currency,
    required this.balanceMinor,
    required this.today,
    required this.week,
    required this.month,
    required this.lifetimeNetMinor,
    required this.deliveries,
  });
  final String currency;
  final int balanceMinor;
  final int today;
  final int week;
  final int month;
  final int lifetimeNetMinor;
  final int deliveries;
  factory EarningsSummaryDto.fromJson(Map<String, dynamic> j) => EarningsSummaryDto(
        currency: j['currency'] as String? ?? 'GHS',
        balanceMinor: _i(j['balanceMinor']),
        today: _i(j['today']),
        week: _i(j['week']),
        month: _i(j['month']),
        lifetimeNetMinor: _i(j['lifetimeNetMinor']),
        deliveries: _i(j['deliveries']),
      );
}

class EarningTxnDto {
  const EarningTxnDto({
    required this.id,
    required this.kind,
    required this.grossMinor,
    required this.deductionMinor,
    required this.netMinor,
    required this.currency,
    this.deliveryCode,
    this.memo,
    required this.at,
  });
  final String id;
  final String kind;
  final int grossMinor;
  final int deductionMinor;
  final int netMinor;
  final String currency;
  final String? deliveryCode;
  final String? memo;
  final DateTime at;
  factory EarningTxnDto.fromJson(Map<String, dynamic> j) => EarningTxnDto(
        id: _s(j['id']),
        kind: _s(j['kind']),
        grossMinor: _i(j['grossMinor']),
        deductionMinor: _i(j['deductionMinor']),
        netMinor: _i(j['netMinor']),
        currency: j['currency'] as String? ?? 'GHS',
        deliveryCode: j['deliveryCode'] as String?,
        memo: j['memo'] as String?,
        at: _dt(j['at']) ?? DateTime.now(),
      );
}

class CourierVehicleDocDto {
  const CourierVehicleDocDto({required this.id, required this.type, required this.status, this.expiresAt});
  final String id;
  final String type;
  final String status;
  final DateTime? expiresAt;
  factory CourierVehicleDocDto.fromJson(Map<String, dynamic> j) => CourierVehicleDocDto(
        id: _s(j['id']),
        type: _s(j['type']),
        status: _s(j['status']),
        expiresAt: _dt(j['expiresAt']),
      );
}

class CourierVehicleViewDto {
  const CourierVehicleViewDto({
    required this.id,
    required this.type,
    this.make,
    this.model,
    this.color,
    this.plate,
    this.year,
    required this.status,
    required this.isActive,
    this.photos = const [],
    this.documents = const [],
  });
  final String id;
  final String type;
  final String? make;
  final String? model;
  final String? color;
  final String? plate;
  final int? year;
  final String status;
  final bool isActive;
  final List<String> photos;
  final List<CourierVehicleDocDto> documents;

  String get label => [color, make, model].where((s) => (s ?? '').isNotEmpty).join(' ').trim();

  factory CourierVehicleViewDto.fromJson(Map<String, dynamic> j) => CourierVehicleViewDto(
        id: _s(j['id']),
        type: _s(j['type']),
        make: j['make'] as String?,
        model: j['model'] as String?,
        color: j['color'] as String?,
        plate: j['plate'] as String?,
        year: _iN(j['year']),
        status: _s(j['status']),
        isActive: j['isActive'] == true,
        photos: (j['photos'] as List<dynamic>? ?? const []).cast<String>(),
        documents: _list(j['documents']).map(CourierVehicleDocDto.fromJson).toList(),
      );
}

class CourierServiceAreaDto {
  const CourierServiceAreaDto({
    required this.id,
    required this.name,
    required this.centerLat,
    required this.centerLng,
    required this.radiusM,
    required this.enabled,
  });
  final String id;
  final String name;
  final double centerLat;
  final double centerLng;
  final int radiusM;
  final bool enabled;
  factory CourierServiceAreaDto.fromJson(Map<String, dynamic> j) => CourierServiceAreaDto(
        id: _s(j['id']),
        name: _s(j['name']),
        centerLat: _d(j['centerLat']),
        centerLng: _d(j['centerLng']),
        radiusM: _i(j['radiusM']),
        enabled: j['enabled'] == true,
      );
}

class CourierAvailabilitySlotDto {
  const CourierAvailabilitySlotDto({
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.enabled,
  });
  final int dayOfWeek; // 0 = Sunday
  final String startTime; // "HH:mm"
  final String endTime;
  final bool enabled;
  factory CourierAvailabilitySlotDto.fromJson(Map<String, dynamic> j) => CourierAvailabilitySlotDto(
        dayOfWeek: _i(j['dayOfWeek']),
        startTime: j['startTime'] as String? ?? '09:00',
        endTime: j['endTime'] as String? ?? '17:00',
        enabled: j['enabled'] == true,
      );

  Map<String, dynamic> toJson() =>
      {'dayOfWeek': dayOfWeek, 'startTime': startTime, 'endTime': endTime, 'enabled': enabled};
}

class CourierMeDto {
  const CourierMeDto({
    required this.onboarded,
    this.courierId,
    this.status,
    this.onlineStatus,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.completedDeliveries = 0,
    this.acceptanceRate = 0,
    this.cancellationRate = 0,
    this.kycStatus,
    this.activeVehicleId,
    this.vehicles = const [],
    this.serviceAreas = const [],
    this.availability = const [],
  });
  final bool onboarded;
  final String? courierId;
  final String? status;
  final String? onlineStatus;
  final double ratingAvg;
  final int ratingCount;
  final int completedDeliveries;
  final double acceptanceRate;
  final double cancellationRate;
  final String? kycStatus;
  final String? activeVehicleId;
  final List<CourierVehicleViewDto> vehicles;
  final List<CourierServiceAreaDto> serviceAreas;
  final List<CourierAvailabilitySlotDto> availability;

  bool get isApproved => status == 'ACTIVE';

  factory CourierMeDto.fromJson(Map<String, dynamic> j) => CourierMeDto(
        onboarded: j['onboarded'] == true,
        courierId: j['courierId'] as String?,
        status: j['status'] as String?,
        onlineStatus: j['onlineStatus'] as String?,
        ratingAvg: _d(j['ratingAvg']),
        ratingCount: _i(j['ratingCount']),
        completedDeliveries: _i(j['completedDeliveries']),
        acceptanceRate: _d(j['acceptanceRate']),
        cancellationRate: _d(j['cancellationRate']),
        kycStatus: (j['kyc'] as Map?)?['status'] as String?,
        activeVehicleId: j['activeVehicleId'] as String?,
        vehicles: _list(j['vehicles']).map(CourierVehicleViewDto.fromJson).toList(),
        serviceAreas: _list(j['serviceAreas']).map(CourierServiceAreaDto.fromJson).toList(),
        availability: _list(j['availability']).map(CourierAvailabilitySlotDto.fromJson).toList(),
      );
}

class CourierDashboardDto {
  const CourierDashboardDto({
    required this.onboarded,
    this.status,
    this.onlineStatus = 'OFFLINE',
    this.ratingAvg = 0,
    this.completedDeliveries = 0,
    this.acceptanceRate = 0,
    this.balanceMinor = 0,
    this.today = 0,
    this.week = 0,
    this.currency = 'GHS',
    this.todayOffers = 0,
    this.activeDeliveryId,
    this.activeDeliveryCode,
    this.activeDeliveryStatus,
    this.activeEtaAt,
    this.activePayoutMinor,
  });
  final bool onboarded;
  final String? status;
  final String onlineStatus;
  final double ratingAvg;
  final int completedDeliveries;
  final double acceptanceRate;
  final int balanceMinor;
  final int today;
  final int week;
  final String currency;
  final int todayOffers;
  final String? activeDeliveryId;
  final String? activeDeliveryCode;
  final String? activeDeliveryStatus;
  final DateTime? activeEtaAt;
  final int? activePayoutMinor;

  bool get isOnline => onlineStatus != 'OFFLINE';

  factory CourierDashboardDto.fromJson(Map<String, dynamic> j) {
    final e = (j['earnings'] as Map?)?.cast<String, dynamic>() ?? const {};
    final a = (j['activeDelivery'] as Map?)?.cast<String, dynamic>();
    return CourierDashboardDto(
      onboarded: j['onboarded'] == true,
      status: j['status'] as String?,
      onlineStatus: j['onlineStatus'] as String? ?? 'OFFLINE',
      ratingAvg: _d(j['ratingAvg']),
      completedDeliveries: _i(j['completedDeliveries']),
      acceptanceRate: _d(j['acceptanceRate']),
      balanceMinor: _i(e['balanceMinor']),
      today: _i(e['today']),
      week: _i(e['week']),
      currency: e['currency'] as String? ?? 'GHS',
      todayOffers: _i(j['todayOffers']),
      activeDeliveryId: a?['id'] as String?,
      activeDeliveryCode: a?['code'] as String?,
      activeDeliveryStatus: a?['status'] as String?,
      activeEtaAt: _dt(a?['etaAt']),
      activePayoutMinor: _iN(a?['payoutMinor']),
    );
  }
}

/// Human labels + ordering for `Delivery.status`.
const kDeliveryStatusFlow = <String>[
  'REQUESTED',
  'SEARCHING_COURIER',
  'COURIER_ASSIGNED',
  'COURIER_EN_ROUTE_PICKUP',
  'ARRIVED_PICKUP',
  'PICKED_UP',
  'EN_ROUTE_DROPOFF',
  'ARRIVED_DROPOFF',
  'DELIVERED',
  'COMPLETED',
];

String deliveryStatusLabel(String s) {
  switch (s) {
    case 'REQUESTED':
      return 'Requested';
    case 'SEARCHING_COURIER':
      return 'Finding a courier';
    case 'COURIER_ASSIGNED':
      return 'Courier assigned';
    case 'COURIER_EN_ROUTE_PICKUP':
      return 'Heading to pickup';
    case 'ARRIVED_PICKUP':
      return 'At the pickup point';
    case 'PICKED_UP':
      return 'Package collected';
    case 'EN_ROUTE_DROPOFF':
      return 'On the way to you';
    case 'ARRIVED_DROPOFF':
      return 'Courier has arrived';
    case 'DELIVERED':
      return 'Delivered';
    case 'COMPLETED':
      return 'Completed';
    case 'FAILED_RECIPIENT_UNAVAILABLE':
      return 'Delivery attempt failed';
    case 'REASSIGNING':
      return 'Reassigning courier';
    case 'RESCHEDULED':
      return 'Rescheduled';
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_COURIER':
    case 'CANCELLED_BY_SYSTEM':
      return 'Cancelled';
    default:
      return s;
  }
}

/// The next forward transition a courier can trigger from [status], or null.
String? courierNextStatus(String status) {
  const map = {
    'COURIER_ASSIGNED': 'COURIER_EN_ROUTE_PICKUP',
    'COURIER_EN_ROUTE_PICKUP': 'ARRIVED_PICKUP',
    'ARRIVED_PICKUP': 'PICKED_UP',
    'PICKED_UP': 'EN_ROUTE_DROPOFF',
    'EN_ROUTE_DROPOFF': 'ARRIVED_DROPOFF',
    'ARRIVED_DROPOFF': 'DELIVERED',
    'DELIVERED': 'COMPLETED',
  };
  return map[status];
}
