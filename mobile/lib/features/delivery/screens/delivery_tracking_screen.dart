import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/delivery_models.dart';
import '../../../app/providers.dart';
import '../../../design/app_map.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../../design/components.dart';
import '../delivery_providers.dart';
import '../../../design/icons.dart';
import '../../../design/responsive.dart';
import '../../trust/report_sheet.dart';

/// Customer live tracking — a map with the courier moving toward you, a status
/// stepper, ETA, the courier card, the drop-off code, and cancel / rate.
class DeliveryTrackingScreen extends ConsumerWidget {
  const DeliveryTrackingScreen({super.key, required this.deliveryId});
  final String deliveryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(deliveryDetailProvider(deliveryId));
    final track = ref.watch(deliveryTrackProvider(deliveryId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Track delivery'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'report') {
                showReportSheet(context, ref,
                    targetType: 'DELIVERY', targetId: deliveryId, targetLabel: 'delivery');
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'report', child: Text('Report a problem')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (d) {
            final t = track.valueOrNull;
            final map = _Map(delivery: d, track: t);
            final panel = ListView(
              padding: const EdgeInsets.all(AppSpace.s16),
              children: [
                _StatusHeader(delivery: d, track: t),
                const SizedBox(height: AppSpace.s16),
                _Stepper(status: t?.status ?? d.status),
                const SizedBox(height: AppSpace.s16),
                if (d.courier != null) _CourierCard(courier: d.courier!),
                if ((t?.status ?? d.status) != 'COMPLETED' && d.dropoffCode != null) ...[
                  const SizedBox(height: AppSpace.s12),
                  _CodeChip(code: d.dropoffCode!),
                ],
                const SizedBox(height: AppSpace.s20),
                _Actions(delivery: d, status: t?.status ?? d.status, deliveryId: deliveryId),
              ],
            );
            // §30 — map + details side by side on tablets, stacked on phones.
            if (context.isWide) {
              return Row(
                children: [
                  Expanded(flex: 5, child: map),
                  Expanded(flex: 4, child: MaxWidth(maxWidth: 480, child: panel)),
                ],
              );
            }
            return Column(
              children: [
                SizedBox(height: 240, child: map),
                Expanded(child: panel),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Map extends StatelessWidget {
  const _Map({required this.delivery, required this.track});
  final DeliveryDto delivery;
  final DeliveryTrackDto? track;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final courier = track?.courier;
    final trail = track?.trail.map((p) => (lat: p.lat, lng: p.lng)).toList() ?? const [];

    return AppMap(
      center: (lat: delivery.dropoff.lat, lng: delivery.dropoff.lng),
      zoom: 12.5,
      polylines: [
        if (trail.length > 1) AppMapPolyline(id: 'trail', points: trail, color: c.primary),
      ],
      markers: [
        AppMapMarker(
          id: 'pickup',
          lat: delivery.pickup.lat,
          lng: delivery.pickup.lng,
          icon: AppIcons.storefront_outlined,
          label: 'Pickup',
        ),
        AppMapMarker(
          id: 'drop',
          lat: delivery.dropoff.lat,
          lng: delivery.dropoff.lng,
          color: c.success,
          label: 'You',
        ),
        if (courier != null)
          AppMapMarker(
            id: 'courier',
            lat: courier.lat,
            lng: courier.lng,
            heading: courier.heading,
            color: Colors.orange,
            icon: AppIcons.two_wheeler,
            label: 'Courier',
          ),
      ],
    );
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.delivery, required this.track});
  final DeliveryDto delivery;
  final DeliveryTrackDto? track;

  @override
  Widget build(BuildContext context) {
    final status = track?.status ?? delivery.status;
    final eta = track?.etaAt ?? delivery.etaAt;
    String etaText = '';
    if (eta != null && !const {'COMPLETED', 'DELIVERED'}.contains(status)) {
      final mins = eta.difference(DateTime.now()).inMinutes;
      etaText = mins <= 0 ? 'Arriving now' : 'ETA ~$mins min';
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(deliveryStatusLabel(status), style: context.text.headlineSmall),
        if (etaText.isNotEmpty)
          Text(etaText, style: context.text.bodyMedium?.copyWith(color: context.colors.primary)),
        Text('#${delivery.code}', style: context.text.bodySmall?.copyWith(color: context.colors.textMed)),
      ],
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.status});
  final String status;

  static const _steps = ['SEARCHING_COURIER', 'COURIER_ASSIGNED', 'PICKED_UP', 'EN_ROUTE_DROPOFF', 'DELIVERED'];
  static const _labels = ['Finding courier', 'Assigned', 'Picked up', 'On the way', 'Delivered'];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final idx = kDeliveryStatusFlow.indexOf(status);
    return Row(
      children: List.generate(_steps.length, (i) {
        final reached = idx >= kDeliveryStatusFlow.indexOf(_steps[i]);
        return Expanded(
          child: Column(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: reached ? c.primary : c.surfaceSunken,
                  shape: BoxShape.circle,
                ),
                child: reached ? const Icon(AppIcons.check, size: 14, color: Colors.white) : null,
              ),
              const SizedBox(height: 4),
              Text(_labels[i],
                  textAlign: TextAlign.center,
                  style: context.text.labelSmall?.copyWith(color: reached ? c.textHi : c.textLow)),
            ],
          ),
        );
      }),
    );
  }
}

class _CourierCard extends StatelessWidget {
  const _CourierCard({required this.courier});
  final DeliveryCourierDto courier;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s12),
      child: Row(
        children: [
          CircleAvatar(radius: 22, backgroundColor: c.primaryContainer, child: Icon(AppIcons.person, color: c.onPrimaryContainer)),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(courier.name, style: context.text.titleSmall),
                Text(
                  '${courier.ratingAvg.toStringAsFixed(1)}★ · ${courier.completedDeliveries} trips'
                  '${courier.vehicle != null ? ' · ${courier.vehicle!.label} ${courier.vehicle!.plate ?? ''}' : ''}',
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
              ],
            ),
          ),
          if (courier.phone != null)
            IconButton(
              icon: Icon(AppIcons.call, color: c.primary),
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Call courier'),
                  content: SelectableText(courier.phone!),
                  actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CodeChip extends StatelessWidget {
  const _CodeChip({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpace.s16),
      decoration: BoxDecoration(color: c.primaryContainer, borderRadius: BorderRadius.circular(AppRadius.lg)),
      child: Row(
        children: [
          Icon(AppIcons.pin, color: c.onPrimaryContainer),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Delivery code', style: context.text.bodySmall?.copyWith(color: c.onPrimaryContainer)),
                Text(code, style: context.text.headlineSmall?.copyWith(color: c.onPrimaryContainer, letterSpacing: 4)),
              ],
            ),
          ),
          Text('Share with the courier', style: context.text.bodySmall?.copyWith(color: c.onPrimaryContainer)),
        ],
      ),
    );
  }
}

class _Actions extends ConsumerWidget {
  const _Actions({required this.delivery, required this.status, required this.deliveryId});
  final DeliveryDto delivery;
  final String status;
  final String deliveryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canCancel = const {'REQUESTED', 'SEARCHING_COURIER', 'COURIER_ASSIGNED', 'COURIER_EN_ROUTE_PICKUP', 'ARRIVED_PICKUP'}
        .contains(status);
    final canRate = const {'DELIVERED', 'COMPLETED'}.contains(status) && !delivery.ratings.any((r) => r.role == 'CUSTOMER');

    if (canRate) {
      return PrimaryButton(
        label: 'Rate your courier',
        onPressed: () async {
          final stars = await showModalBottomSheet<int>(
            context: context,
            builder: (_) => _RateSheet(),
          );
          if (stars == null) return;
          await ref.read(stallApiProvider).rateDelivery(deliveryId, stars: stars);
          ref.invalidate(deliveryDetailProvider(deliveryId));
        },
      );
    }
    if (canCancel) {
      return SecondaryButton(
        label: 'Cancel delivery',
        onPressed: () async {
          final ok = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Cancel this delivery?'),
              content: const Text('The delivery fee is refunded to your wallet.'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
                TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel delivery')),
              ],
            ),
          );
          if (ok != true) return;
          try {
            await ref.read(stallApiProvider).cancelDelivery(deliveryId);
            ref.invalidate(deliveryDetailProvider(deliveryId));
          } catch (e) {
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
          }
        },
      );
    }
    return const SizedBox.shrink();
  }
}

class _RateSheet extends StatefulWidget {
  @override
  State<_RateSheet> createState() => _RateSheetState();
}

class _RateSheetState extends State<_RateSheet> {
  int _stars = 5;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpace.s24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('How was your delivery?', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              5,
              (i) => IconButton(
                icon: Icon(i < _stars ? AppIcons.star : AppIcons.star_border, color: context.colors.rating, size: 32),
                onPressed: () => setState(() => _stars = i + 1),
              ),
            ),
          ),
          const SizedBox(height: AppSpace.s12),
          PrimaryButton(label: 'Submit', onPressed: () => Navigator.pop(context, _stars)),
        ],
      ),
    );
  }
}
