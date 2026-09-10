import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../../api/delivery_models.dart';
import '../../app/providers.dart';
import '../../core/realtime.dart';

final myDeliveriesProvider = FutureProvider.autoDispose.family<List<DeliveryDto>, bool>(
  (ref, active) => ref.watch(stallApiProvider).deliveries(active: active),
);

final deliveryDetailProvider = FutureProvider.autoDispose.family<DeliveryDto, String>(
  (ref, id) => ref.watch(stallApiProvider).delivery(id),
);

const _kTerminalDeliveryStatuses = {
  'COMPLETED',
  'DELIVERED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_COURIER',
  'CANCELLED_BY_SYSTEM',
};

/// Live track — subscribes to `apps/realtime`'s `/tracking` namespace for
/// push updates (courier position on every breadcrumb, a refetch on any
/// status-changing `delivery:event`). Falls back to the original 8s REST
/// poll whenever the socket can't connect or drops, so a flaky connection
/// degrades to the old behavior instead of going stale.
final deliveryTrackProvider = StreamProvider.autoDispose.family<DeliveryTrackDto, String>((ref, id) {
  final api = ref.watch(stallApiProvider);
  final config = ref.watch(apiConfigProvider);
  final tokens = ref.watch(tokenStoreProvider);

  final controller = StreamController<DeliveryTrackDto>();
  DeliveryTrackDto? last;
  Timer? pollTimer;
  sio.Socket? socket;
  var disposed = false;

  void emit(DeliveryTrackDto t) {
    if (disposed || controller.isClosed) return;
    last = t;
    controller.add(t);
    if (_kTerminalDeliveryStatuses.contains(t.status)) {
      pollTimer?.cancel();
      socket?.dispose();
      controller.close();
    }
  }

  Future<void> refetch() async {
    try {
      emit(await api.deliveryTrack(id));
    } catch (_) {
      // Transient — whatever loop (poll or socket) is already running will retry.
    }
  }

  void startPolling() {
    pollTimer ??= Timer.periodic(const Duration(seconds: 8), (_) => refetch());
  }

  void stopPolling() {
    pollTimer?.cancel();
    pollTimer = null;
  }

  Future<void> start() async {
    // A REST round-trip first: it's the guaranteed-fresh initial snapshot,
    // and (as a side effect of the normal 401 handling) refreshes an
    // expired access token before the socket handshake needs one.
    await refetch();
    if (disposed || controller.isClosed || last == null) return;

    socket = connectTrackingSocket(config.realtimeUrl, tokens.access);
    socket!
      ..onConnect((_) {
        stopPolling();
        socket!.emitWithAck('subscribe', {'deliveryId': id}, ack: (res) {
          if (res is Map && res['ok'] == true && res['snapshot'] is Map) {
            try {
              emit(DeliveryTrackDto.fromJson((res['snapshot'] as Map).cast<String, dynamic>()));
              return;
            } catch (_) {
              // fall through to polling below
            }
          }
          startPolling(); // couldn't subscribe — degrade to the REST loop
        });
      })
      ..on('connect_error', (_) => startPolling())
      ..onDisconnect((_) => startPolling())
      ..on('delivery:location', (data) {
        final l = last;
        if (l == null || data is! Map) return;
        final lat = (data['lat'] as num?)?.toDouble();
        final lng = (data['lng'] as num?)?.toDouble();
        if (lat == null || lng == null) return;
        final heading = (data['heading'] as num?)?.toDouble();
        final at = DateTime.tryParse('${data['at']}') ?? DateTime.now();
        final etaAt = data['etaAt'] == null ? l.etaAt : DateTime.tryParse('${data['etaAt']}');
        final trail = [...l.trail, LatLngDto(lat, lng)];
        emit(DeliveryTrackDto(
          status: l.status,
          etaAt: etaAt,
          pickup: l.pickup,
          dropoff: l.dropoff,
          courier: (lat: lat, lng: lng, heading: heading, at: at),
          trail: trail.length > 60 ? trail.sublist(trail.length - 60) : trail,
          distanceRemainingM: l.distanceRemainingM,
        ));
      })
      ..on('delivery:event', (_) => refetch());
  }

  start();

  ref.onDispose(() {
    disposed = true;
    pollTimer?.cancel();
    socket?.dispose();
    if (!controller.isClosed) controller.close();
  });

  return controller.stream;
});
