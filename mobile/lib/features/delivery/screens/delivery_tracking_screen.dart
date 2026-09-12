import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/delivery_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/app_map.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../../design/components.dart';
import '../delivery_providers.dart';
import '../../../design/icons.dart';
import '../../../design/responsive.dart';
import '../../trust/report_sheet.dart';

const kTerminalDeliveryStatuses = {
  'COMPLETED',
  'DELIVERED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_COURIER',
  'CANCELLED_BY_SYSTEM',
};

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
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              'Track Order',
              trailing: PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'report') {
                    showReportSheet(
                      context,
                      ref,
                      targetType: 'DELIVERY',
                      targetId: deliveryId,
                      targetLabel: 'delivery',
                    );
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'report',
                    child: Text('Report a problem'),
                  ),
                ],
              ),
            ),
            detail.maybeWhen(
              data: (d) => Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.s16,
                  0,
                  AppSpace.s16,
                  AppSpace.s12,
                ),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Order ID: #${d.code}',
                    style: context.text.bodyMedium?.copyWith(
                      color: context.colors.textMed,
                    ),
                  ),
                ),
              ),
              orElse: () => const SizedBox.shrink(),
            ),
            Expanded(
              child: detail.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (d) {
                  final t = track.valueOrNull;
                  final map = _MapWithFullscreenToggle(delivery: d, track: t);
                  final panel = ListView(
                    padding: const EdgeInsets.all(AppSpace.s16),
                    children: [
                      _StepperCard(delivery: d, track: t),
                      const SizedBox(height: AppSpace.s16),
                      if (d.courier != null) ...[
                        _CourierCard(courier: d.courier!),
                        const SizedBox(height: AppSpace.s12),
                      ],
                      _EtaAndItemsCard(delivery: d, track: t),
                      if (!kTerminalDeliveryStatuses.contains(t?.status ?? d.status) &&
                          d.dropoffCode != null) ...[
                        const SizedBox(height: AppSpace.s12),
                        _CodeChip(code: d.dropoffCode!),
                      ],
                      const SizedBox(height: AppSpace.s20),
                      _Actions(
                        delivery: d,
                        status: t?.status ?? d.status,
                        deliveryId: deliveryId,
                      ),
                    ],
                  );
                  // §30 — map + details side by side on tablets, stacked on phones.
                  if (context.isWide) {
                    return Row(
                      children: [
                        Expanded(flex: 5, child: map),
                        Expanded(
                          flex: 4,
                          child: MaxWidth(maxWidth: 480, child: panel),
                        ),
                      ],
                    );
                  }
                  return Column(
                    children: [
                      SizedBox(height: 200, child: map),
                      Expanded(child: panel),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Wraps [_Map] with a fullscreen expand/collapse toggle — a small circular
/// button that pushes the same map into its own full-screen route, with a
/// matching button there to collapse back.
class _MapWithFullscreenToggle extends StatelessWidget {
  const _MapWithFullscreenToggle({required this.delivery, required this.track});
  final DeliveryDto delivery;
  final DeliveryTrackDto? track;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      _Map(delivery: delivery, track: track),
      Positioned(
        top: AppSpace.s8,
        right: AppSpace.s8,
        child: _MapIconButton(
          icon: AppIcons.expand,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => _FullscreenMap(delivery: delivery, track: track),
            ),
          ),
        ),
      ),
    ],
  );
}

class _FullscreenMap extends StatelessWidget {
  const _FullscreenMap({required this.delivery, required this.track});
  final DeliveryDto delivery;
  final DeliveryTrackDto? track;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Stack(
        children: [
          Positioned.fill(child: _Map(delivery: delivery, track: track)),
          Positioned(
            top: AppSpace.s8,
            right: AppSpace.s8,
            child: _MapIconButton(
              icon: AppIcons.close,
              onTap: () => Navigator.of(context).pop(),
            ),
          ),
        ],
      ),
    ),
  );
}

class _MapIconButton extends StatelessWidget {
  const _MapIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    shape: const CircleBorder(),
    elevation: 2,
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(9),
        child: Icon(icon, size: 18, color: Colors.black87),
      ),
    ),
  );
}

class _Map extends StatelessWidget {
  const _Map({required this.delivery, required this.track});
  final DeliveryDto delivery;
  final DeliveryTrackDto? track;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Once the delivery is over there's nothing left "en route" — showing a
    // trail/route to a courier who's already finished, or long gone, just
    // reads as a rendering bug rather than history worth keeping visible.
    final isTerminal = kTerminalDeliveryStatuses.contains(track?.status ?? delivery.status);
    final courier = isTerminal ? null : track?.courier;
    final trail = isTerminal
        ? const <({double lat, double lng})>[]
        : track?.trail.map((p) => (lat: p.lat, lng: p.lng)).toList() ?? const [];
    final route = isTerminal
        ? const <({double lat, double lng})>[]
        : track?.route.map((p) => (lat: p.lat, lng: p.lng)).toList() ?? const [];

    return AppMap(
      center: (lat: delivery.dropoff.lat, lng: delivery.dropoff.lng),
      zoom: 12.5,
      polylines: [
        // faint road route for the current leg …
        if (route.length > 1)
          AppMapPolyline(
            id: 'route',
            points: route,
            color: c.primary.withValues(alpha: 0.28),
            width: 7,
          ),
        // … with the recent travelled trail drawn solid on top
        if (trail.length > 1)
          AppMapPolyline(
            id: 'trail',
            points: trail,
            color: c.primary,
            width: 4,
          ),
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

/// A status label above a boxed, connected-line stepper — matches the
/// Figma `delivery-tracking` frame's capsule stepper card. The stage labels
/// track the real delivery lifecycle (`kDeliveryStatusFlow`) rather than
/// Figma's generic order-status wording, since this screen tracks the
/// courier leg specifically.
class _StepperCard extends StatelessWidget {
  const _StepperCard({required this.delivery, required this.track});
  final DeliveryDto delivery;
  final DeliveryTrackDto? track;

  @override
  Widget build(BuildContext context) {
    final status = track?.status ?? delivery.status;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(deliveryStatusLabel(status), style: context.text.headlineSmall),
        const SizedBox(height: AppSpace.s12),
        AppCard(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.s12,
            vertical: AppSpace.s16,
          ),
          child: _Stepper(status: status),
        ),
      ],
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.status});
  final String status;

  static const _steps = [
    'SEARCHING_COURIER',
    'COURIER_ASSIGNED',
    'PICKED_UP',
    'EN_ROUTE_DROPOFF',
    'DELIVERED',
  ];
  static const _labels = [
    'Finding courier',
    'Assigned',
    'Picked up',
    'On the way',
    'Delivered',
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final idx = kDeliveryStatusFlow.indexOf(status);
    final isFinal =
        status == 'DELIVERED' ||
        status == 'COMPLETED' ||
        status.startsWith('CANCELLED');

    // How many coarse steps are fully done, and which one is "in progress" —
    // so the intermediate states (en-route-to-pickup, arrived) still show
    // forward motion instead of a frozen 2/5.
    var doneCount = 0;
    for (final s in _steps) {
      if (idx >= kDeliveryStatusFlow.indexOf(s)) doneCount++;
    }
    final currentStep = (!isFinal && doneCount < _steps.length)
        ? doneCount
        : -1;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(_steps.length * 2 - 1, (j) {
        if (j.isOdd) {
          // Connecting line between step (j-1)/2 and (j+1)/2.
          final segmentDone = (j - 1) ~/ 2 < doneCount;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                height: 2,
                color: segmentDone ? c.primary : c.border,
              ),
            ),
          );
        }
        final i = j ~/ 2;
        final done = i < doneCount;
        final active = i == currentStep;
        return Column(
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: done ? c.primary : c.surfaceSunken,
                shape: BoxShape.circle,
                border: active ? Border.all(color: c.primary, width: 2) : null,
              ),
              child: done
                  ? const Icon(AppIcons.check, size: 14, color: Colors.white)
                  : active
                  ? Center(
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: c.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                    )
                  : null,
            ),
            const SizedBox(height: 4),
            SizedBox(
              width: 56,
              child: Text(
                _labels[i],
                textAlign: TextAlign.center,
                style: context.text.labelSmall?.copyWith(
                  color: done || active ? c.textHi : c.textLow,
                ),
              ),
            ),
          ],
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
          CircleAvatar(
            radius: 22,
            backgroundColor: c.primaryContainer,
            child: Icon(AppIcons.person, color: c.onPrimaryContainer),
          ),
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
            Material(
              color: c.primaryContainer,
              borderRadius: BorderRadius.circular(AppRadius.pill),
              child: InkWell(
                borderRadius: BorderRadius.circular(AppRadius.pill),
                onTap: () => showAppDialog<void>(
                  context,
                  builder: (_) => AppDialog(
                    icon: AppIcons.call,
                    title: 'Call courier',
                    content: SelectableText(
                      courier.phone!,
                      textAlign: TextAlign.center,
                      style: context.text.titleMedium,
                    ),
                    actions: [
                      AppDialogAction(
                        label: 'Close',
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpace.s16,
                    vertical: AppSpace.s10,
                  ),
                  child: Text(
                    'Call driver',
                    style: context.text.labelLarge?.copyWith(
                      color: c.onPrimaryContainer,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
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
      decoration: BoxDecoration(
        color: c.primaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Row(
        children: [
          Icon(AppIcons.pin, color: c.onPrimaryContainer),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Delivery code',
                  style: context.text.bodySmall?.copyWith(
                    color: c.onPrimaryContainer,
                  ),
                ),
                Text(
                  code,
                  style: context.text.headlineSmall?.copyWith(
                    color: c.onPrimaryContainer,
                    letterSpacing: 4,
                  ),
                ),
              ],
            ),
          ),
          Text(
            'Share with the courier',
            style: context.text.bodySmall?.copyWith(
              color: c.onPrimaryContainer,
            ),
          ),
        ],
      ),
    );
  }
}

class _Actions extends ConsumerWidget {
  const _Actions({
    required this.delivery,
    required this.status,
    required this.deliveryId,
  });
  final DeliveryDto delivery;
  final String status;
  final String deliveryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canCancel = const {
      'REQUESTED',
      'SEARCHING_COURIER',
      'COURIER_ASSIGNED',
      'COURIER_EN_ROUTE_PICKUP',
      'ARRIVED_PICKUP',
    }.contains(status);
    final canRate =
        const {'DELIVERED', 'COMPLETED'}.contains(status) &&
        !delivery.ratings.any((r) => r.role == 'CUSTOMER');

    // "Contact Customer Support" is always available — the Figma frame's one
    // prominent CTA for the common case (nothing else actionable mid-transit).
    // When cancel/rate is also available, support becomes the secondary
    // action beneath it instead of competing for primary emphasis.
    final support = canRate || canCancel
        ? Padding(
            padding: const EdgeInsets.only(top: AppSpace.s12),
            child: SecondaryButton(
              label: 'Contact Customer Support',
              onPressed: () => context.push(RoutePaths.support),
            ),
          )
        : PrimaryButton(
            label: 'Contact Customer Support',
            onPressed: () => context.push(RoutePaths.support),
          );

    if (canRate) {
      return Column(
        children: [
          PrimaryButton(
            label: 'Rate your courier',
            onPressed: () async {
              final stars = await showModalBottomSheet<int>(
                context: context,
                showDragHandle: true,
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
                ),
                builder: (_) => _RateSheet(),
              );
              if (stars == null) return;
              await ref
                  .read(stallApiProvider)
                  .rateDelivery(deliveryId, stars: stars);
              ref.invalidate(deliveryDetailProvider(deliveryId));
            },
          ),
          support,
        ],
      );
    }
    if (canCancel) {
      return Column(
        children: [
          SecondaryButton(
            label: 'Cancel delivery',
            onPressed: () async {
              final ok = await confirmDialog(
                context,
                icon: AppIcons.info_outline,
                title: 'Cancel this delivery?',
                message: 'The delivery fee is refunded to your wallet.',
                confirmLabel: 'Cancel delivery',
                cancelLabel: 'Keep it',
                destructive: true,
              );
              if (!ok) return;
              try {
                await ref.read(stallApiProvider).cancelDelivery(deliveryId);
                ref.invalidate(deliveryDetailProvider(deliveryId));
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text('$e')));
                }
              }
            },
          ),
          support,
        ],
      );
    }
    return support;
  }
}

/// ETA on the left, what's actually in the delivery on the right — Figma's
/// "Estimated Arrival / Product" row, adapted to real data: `Delivery` has no
/// product photo (only item descriptions), so this shows the item summary as
/// text instead of inventing a thumbnail.
class _EtaAndItemsCard extends StatelessWidget {
  const _EtaAndItemsCard({required this.delivery, required this.track});
  final DeliveryDto delivery;
  final DeliveryTrackDto? track;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final status = track?.status ?? delivery.status;
    final eta = track?.etaAt ?? delivery.etaAt;
    String etaText = 'Not yet available';
    if (const {'DELIVERED', 'COMPLETED'}.contains(status)) {
      etaText = delivery.deliveredAt != null
          ? _formatWhen(delivery.deliveredAt!)
          : 'Delivered';
    } else if (eta != null) {
      etaText = _formatWhen(eta);
    }
    final items = delivery.items;
    final itemsText = items.isEmpty
        ? '—'
        : items.length == 1
        ? items.first.description
        : '${items.first.description} +${items.length - 1} more';

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Estimated Arrival',
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
                const SizedBox(height: AppSpace.s4),
                Text(etaText, style: context.text.titleMedium),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'Items',
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
                const SizedBox(height: AppSpace.s4),
                Text(
                  itemsText,
                  textAlign: TextAlign.end,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.titleSmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatWhen(DateTime dt) {
    final now = DateTime.now();
    final sameDay =
        dt.year == now.year && dt.month == now.month && dt.day == now.day;
    final tomorrow = now.add(const Duration(days: 1));
    final isTomorrow =
        dt.year == tomorrow.year &&
        dt.month == tomorrow.month &&
        dt.day == tomorrow.day;
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';
    final time = '$h:$m $ampm';
    if (sameDay) return 'Today, $time';
    if (isTomorrow) return 'Tomorrow, $time';
    return '${dt.day}/${dt.month}, $time';
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
                icon: Icon(
                  i < _stars ? AppIcons.star : AppIcons.star_border,
                  color: context.colors.rating,
                  size: 32,
                ),
                onPressed: () => setState(() => _stars = i + 1),
              ),
            ),
          ),
          const SizedBox(height: AppSpace.s12),
          PrimaryButton(
            label: 'Submit',
            onPressed: () => Navigator.pop(context, _stars),
          ),
        ],
      ),
    );
  }
}
