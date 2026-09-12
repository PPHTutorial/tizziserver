import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/delivery_models.dart';
import '../../../app/providers.dart';
import '../../../core/location.dart';
import '../../../core/realtime.dart';
import '../../../design/app_map.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../courier_providers.dart';
import '../../../design/icons.dart';

/// The courier's active-delivery screen: a map of pickup/drop-off, the current
/// step, the one-tap "advance" action, and the pickup/drop-off verifications.
class ActiveDeliveryScreen extends ConsumerWidget {
  const ActiveDeliveryScreen({super.key, required this.deliveryId});
  final String deliveryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(courierDeliveryProvider(deliveryId));
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Active delivery'),
            Expanded(
              child: d.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (dl) => _Body(delivery: dl),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.delivery});
  final DeliveryDto delivery;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  Timer? _locationTimer;
  sio.Socket? _locationSocket;

  DeliveryDto get d => widget.delivery;

  @override
  void initState() {
    super.initState();
    if (!widget.delivery.isFinal) {
      final config = ref.read(apiConfigProvider);
      _locationSocket = connectTrackingSocket(config.realtimeUrl, ref.read(tokenStoreProvider).access);
      _locationTimer = Timer.periodic(const Duration(seconds: 6), (_) => _reportLocation());
      _reportLocation();
    }
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    _locationSocket?.dispose();
    super.dispose();
  }

  /// Pushes the courier's current position to the customer's live-tracking
  /// map: via the realtime socket when connected (matches
  /// `apps/realtime`'s `/tracking` `location` handler), falling back to the
  /// REST breadcrumb endpoint otherwise so a flaky socket doesn't go silent.
  Future<void> _reportLocation() async {
    if (widget.delivery.isFinal) {
      _locationTimer?.cancel();
      _locationSocket?.dispose();
      return;
    }
    final here = await DeviceLocation.current();
    if (here == null || !mounted) return;
    final socket = _locationSocket;
    if (socket != null && socket.connected) {
      socket.emitWithAck(
        'location',
        {'deliveryId': widget.delivery.id, 'lat': here.lat, 'lng': here.lng},
        ack: (_) {},
      );
    } else {
      await ref
          .read(stallApiProvider)
          .courierBreadcrumb(widget.delivery.id, here.lat, here.lng)
          .catchError((_) {});
    }
  }

  Future<void> _do(Future<void> Function() op) async {
    setState(() => _busy = true);
    try {
      await op();
      ref.invalidate(courierDeliveryProvider(d.id));
      ref.invalidate(courierActiveDeliveryProvider);
      ref.invalidate(courierDashboardProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _advance(String to) async {
    final here = await DeviceLocation.current();
    await _do(() => ref.read(stallApiProvider).advanceDelivery(d.id, to, lat: here?.lat, lng: here?.lng));
  }

  Future<void> _verifyPickup() async {
    final code = await _askCode(context, 'Pickup code', 'Ask the sender for the 4-digit pickup code');
    if (code == null) return;
    await _do(() => ref.read(stallApiProvider).verifyPickup(d.id, code: code, packageCount: d.items.length));
  }

  Future<void> _verifyDropoff() async {
    final code = await _askCode(context, 'Delivery code', 'Ask the recipient for their 4-digit code');
    if (code == null) return;
    await _do(() => ref.read(stallApiProvider).verifyDropoff(d.id, code: code));
  }

  Future<void> _pod() async {
    await _do(() => ref
        .read(stallApiProvider)
        .submitPod(d.id, photoKeys: ['pod/${DateTime.now().millisecondsSinceEpoch}.jpg'], notes: 'Handed to recipient'));
  }

  Future<void> _fail() async {
    final reason = await _askCode(context, 'Report a problem', 'Reason (e.g. recipient unavailable)', numeric: false);
    if (reason == null || reason.isEmpty) return;
    await _do(() => ref.read(stallApiProvider).failDelivery(d.id, reason: reason));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final next = courierNextStatus(d.status);
    final needsPickup = d.status == 'ARRIVED_PICKUP' && !d.pickupVerified;
    final needsDropoff = d.status == 'ARRIVED_DROPOFF' && !d.dropoffVerified;
    final needsPod = d.status == 'DELIVERED' && d.podPhotos.isEmpty;

    return Column(
      children: [
        SizedBox(
          height: 220,
          child: AppMap(
            center: (lat: d.pickup.lat, lng: d.pickup.lng),
            zoom: 12.5,
            polylines: [
              AppMapPolyline(
                id: 'route',
                points: [(lat: d.pickup.lat, lng: d.pickup.lng), (lat: d.dropoff.lat, lng: d.dropoff.lng)],
                color: c.primary,
                width: 3,
              ),
            ],
            markers: [
              AppMapMarker(id: 'p', lat: d.pickup.lat, lng: d.pickup.lng, icon: AppIcons.storefront_outlined, label: 'Pickup'),
              AppMapMarker(id: 'd', lat: d.dropoff.lat, lng: d.dropoff.lng, color: c.success, label: 'Drop-off'),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpace.s16),
            children: [
              Row(
                children: [
                  Expanded(child: Text(deliveryStatusLabel(d.status), style: context.text.titleLarge)),
                  Text(formatMoney(d.courierPayoutMinor ?? 0, d.currency),
                      style: context.text.titleMedium?.copyWith(color: c.primary)),
                ],
              ),
              Text('#${d.code}', style: context.text.bodySmall?.copyWith(color: c.textMed)),
              const SizedBox(height: AppSpace.s16),
              _leg(context, AppIcons.store_mall_directory_outlined, 'Pickup',
                  '${d.pickup.addressLine}\n${d.pickup.contactName} · ${d.pickup.contactPhone}'),
              _leg(context, AppIcons.location_on_outlined, 'Drop-off',
                  '${d.dropoff.addressLine}\n${d.dropoff.contactName} · ${d.dropoff.contactPhone}'),
              const SizedBox(height: AppSpace.s12),
              if (d.items.isNotEmpty)
                Text('Items: ${d.items.map((i) => '${i.qty}× ${i.description}').join(', ')}',
                    style: context.text.bodyMedium),
              const SizedBox(height: AppSpace.s24),
              if (needsPickup)
                PrimaryButton(label: 'Verify pickup code', loading: _busy, onPressed: _verifyPickup)
              else if (needsDropoff)
                PrimaryButton(label: 'Verify delivery code', loading: _busy, onPressed: _verifyDropoff)
              else if (needsPod)
                PrimaryButton(label: 'Add proof of delivery', loading: _busy, onPressed: _pod)
              else if (next != null)
                PrimaryButton(label: _actionLabel(next), loading: _busy, onPressed: () => _advance(next))
              else
                _DoneCard(delivery: d),
              const SizedBox(height: AppSpace.s8),
              if (!d.isFinal && d.status != 'PICKED_UP' && !d.status.startsWith('EN_ROUTE') && d.status != 'ARRIVED_DROPOFF')
                SecondaryButton(label: 'Report a problem', onPressed: _busy ? null : _fail),
            ],
          ),
        ),
      ],
    );
  }

  String _actionLabel(String to) {
    switch (to) {
      case 'COURIER_EN_ROUTE_PICKUP':
        return 'Start — head to pickup';
      case 'ARRIVED_PICKUP':
        return 'I\'ve arrived at pickup';
      case 'PICKED_UP':
        return 'Package collected';
      case 'EN_ROUTE_DROPOFF':
        return 'Start delivery';
      case 'ARRIVED_DROPOFF':
        return 'I\'ve arrived at the drop-off';
      case 'DELIVERED':
        return 'Mark delivered';
      case 'COMPLETED':
        return 'Complete delivery';
      default:
        return 'Continue';
    }
  }

  Widget _leg(BuildContext context, IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.s12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: context.colors.textMed),
            const SizedBox(width: AppSpace.s8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: context.text.labelMedium?.copyWith(color: context.colors.textMed)),
                  Text(value, style: context.text.bodyMedium),
                ],
              ),
            ),
          ],
        ),
      );
}

class _DoneCard extends ConsumerWidget {
  const _DoneCard({required this.delivery});
  final DeliveryDto delivery;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final rated = delivery.ratings.any((r) => r.role == 'COURIER');
    return Container(
      padding: const EdgeInsets.all(AppSpace.s16),
      decoration: BoxDecoration(color: c.successContainer, borderRadius: BorderRadius.circular(AppRadius.lg)),
      child: Column(
        children: [
          Icon(AppIcons.check_circle, color: c.success, size: 40),
          const SizedBox(height: AppSpace.s8),
          Text(deliveryStatusLabel(delivery.status), style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s4),
          Text('Earned ${formatMoney(delivery.courierPayoutMinor ?? 0, delivery.currency)}',
              style: context.text.bodyMedium?.copyWith(color: c.textMed)),
          const SizedBox(height: AppSpace.s12),
          if (!rated && delivery.status == 'COMPLETED')
            FilledButton(
              onPressed: () async {
                await ref.read(stallApiProvider).courierRateCustomer(delivery.id, stars: 5);
                ref.invalidate(courierDeliveryProvider(delivery.id));
              },
              child: const Text('Rate the customer'),
            ),
          TextButton(onPressed: () => context.pop(), child: const Text('Back to dashboard')),
        ],
      ),
    );
  }
}

Future<String?> _askCode(BuildContext context, String title, String hint, {bool numeric = true}) {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: AppField(
        label: hint,
        hintText: numeric ? '4-digit code' : 'Enter value',
        controller: ctrl,
        keyboardType: numeric ? TextInputType.number : TextInputType.text,
        autofocus: true,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(context, ctrl.text.trim()), child: const Text('Confirm')),
      ],
    ),
  );
}

/// Embeddable version for the shell "Active" tab.
class CourierActiveBody extends ConsumerWidget {
  const CourierActiveBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(courierActiveDeliveryProvider);
    return active.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('$e')),
      data: (d) {
        if (d == null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpace.s32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(AppIcons.route_outlined, size: 48, color: context.colors.textLow),
                  const SizedBox(height: AppSpace.s8),
                  Text('No active delivery', style: context.text.bodyMedium),
                  const SizedBox(height: AppSpace.s4),
                  Text('Accept a job to get started',
                      style: context.text.bodySmall?.copyWith(color: context.colors.textMed)),
                ],
              ),
            ),
          );
        }
        return _Body(delivery: d);
      },
    );
  }
}
