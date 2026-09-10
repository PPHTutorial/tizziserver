import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/delivery_models.dart';
import '../../app/providers.dart';
import '../../core/location.dart';

final courierMeProvider = FutureProvider.autoDispose<CourierMeDto>(
  (ref) => ref.watch(stallApiProvider).courierMe(),
);

final courierDashboardProvider = FutureProvider.autoDispose<CourierDashboardDto>(
  (ref) => ref.watch(stallApiProvider).courierDashboard(),
);

final courierJobsProvider = FutureProvider.autoDispose<List<JobCardDto>>((ref) async {
  final here = await DeviceLocation.current();
  return ref.watch(stallApiProvider).courierJobs(lat: here?.lat, lng: here?.lng);
});

final courierActiveDeliveryProvider = FutureProvider.autoDispose<DeliveryDto?>((ref) async {
  final list = await ref.watch(stallApiProvider).courierDeliveries(active: true);
  return list.isEmpty ? null : list.first;
});

final courierDeliveryProvider =
    FutureProvider.autoDispose.family<DeliveryDto, String>((ref, id) => ref.watch(stallApiProvider).courierDelivery(id));

final courierEarningsProvider = FutureProvider.autoDispose<EarningsSummaryDto>(
  (ref) => ref.watch(stallApiProvider).courierEarnings(),
);

final courierEarningTxnsProvider = FutureProvider.autoDispose<List<EarningTxnDto>>(
  (ref) => ref.watch(stallApiProvider).courierEarningTxns(),
);

/// Online toggle + a lightweight position heartbeat while online.
class CourierPresence extends Notifier<String> {
  Timer? _hb;

  @override
  String build() {
    ref.onDispose(() => _hb?.cancel());
    return 'OFFLINE';
  }

  Future<void> hydrate() async {
    final me = await ref.read(stallApiProvider).courierMe();
    state = me.onlineStatus ?? 'OFFLINE';
    if (state != 'OFFLINE') _startHeartbeat();
  }

  Future<void> goOnline() async {
    final here = await DeviceLocation.current() ?? (lat: 5.6037, lng: -0.187);
    state = await ref.read(stallApiProvider).courierGoOnline(here.lat, here.lng);
    _startHeartbeat();
    ref.invalidate(courierDashboardProvider);
    ref.invalidate(courierJobsProvider);
  }

  Future<void> goOffline() async {
    _hb?.cancel();
    state = await ref.read(stallApiProvider).courierGoOffline();
    ref.invalidate(courierDashboardProvider);
  }

  void _startHeartbeat() {
    _hb?.cancel();
    _hb = Timer.periodic(const Duration(seconds: 20), (_) async {
      final here = await DeviceLocation.current();
      if (here == null) return;
      try {
        await ref.read(stallApiProvider).courierHeartbeat(here.lat, here.lng);
      } catch (_) {/* transient */}
    });
  }
}

final courierPresenceProvider = NotifierProvider<CourierPresence, String>(CourierPresence.new);
