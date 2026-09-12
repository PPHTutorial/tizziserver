import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../core/location.dart';
import '../../../design/app_map.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';
import '../../../design/icons.dart';

/// Screens 34–37 — Nearby Vendors: a map + list of vendors around a point.
/// Uses the device location when granted; otherwise falls back to Accra
/// (`kDefaultLatLng`). Vendor markers use real business coordinates from the API.
class NearbyVendorsScreen extends ConsumerStatefulWidget {
  const NearbyVendorsScreen({super.key});

  @override
  ConsumerState<NearbyVendorsScreen> createState() =>
      _NearbyVendorsScreenState();
}

class _NearbyVendorsScreenState extends ConsumerState<NearbyVendorsScreen> {
  int _radiusM = 5000;
  LatLngRec _centre = kDefaultLatLng;
  bool _usingDeviceLocation = false;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    _locate(initial: true);
  }

  Future<void> _locate({bool initial = false}) async {
    setState(() => _locating = true);
    final loc = await DeviceLocation.current();
    if (!mounted) return;
    setState(() {
      _locating = false;
      if (loc != null) {
        _centre = loc;
        _usingDeviceLocation = true;
      } else if (!initial) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Location unavailable — showing Accra')),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final centre = _centre;
    final async = ref.watch(
      nearbyVendorsProvider((
        lat: centre.lat,
        lng: centre.lng,
        radiusM: _radiusM,
      )),
    );

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(
              'Nearby vendors',
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Use my location',
                    onPressed: _locating ? null : () => _locate(),
                    icon: _locating
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            _usingDeviceLocation
                                ? AppIcons.my_location
                                : AppIcons.location_searching,
                          ),
                  ),
                  PopupMenuButton<int>(
                    initialValue: _radiusM,
                    onSelected: (v) => setState(() => _radiusM = v),
                    itemBuilder: (context) => const [
                      PopupMenuItem(value: 2000, child: Text('Within 2 km')),
                      PopupMenuItem(value: 5000, child: Text('Within 5 km')),
                      PopupMenuItem(value: 15000, child: Text('Within 15 km')),
                    ],
                    icon: const Icon(AppIcons.social_distance),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 220,
              child: async.maybeWhen(
                orElse: () => Container(color: c.surfaceSunken),
                data: (vendors) => AppMap(
                  center: (lat: centre.lat, lng: centre.lng),
                  zoom: 12,
                  markers: [
                    AppMapMarker(
                      id: '_me',
                      lat: centre.lat,
                      lng: centre.lng,
                      color: Colors.blue,
                      icon: AppIcons.my_location,
                      label: _usingDeviceLocation
                          ? 'You are here'
                          : 'Accra (default)',
                    ),
                    for (var i = 0; i < vendors.length; i++)
                      AppMapMarker(
                        id: vendors[i].id,
                        lat: vendors[i].hasLocation
                            ? vendors[i].lat!
                            : centre.lat + (i - vendors.length / 2) * 0.004,
                        // Vendor has no geocoded address — fan out around the centre.
                        lng: vendors[i].hasLocation
                            ? vendors[i].lng!
                            : centre.lng + i * 0.003,
                        icon: AppIcons.storefront_outlined,
                        label: vendors[i].displayName,
                      ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load nearby vendors',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(nearbyVendorsProvider),
                  ),
                ),
                data: (vendors) => vendors.isEmpty
                    ? const CenteredState(
                        icon: AppIcons.storefront_outlined,
                        title: 'No vendors in range',
                        body: 'Try widening the search radius.',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppSpace.s16),
                        itemCount: vendors.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpace.s12),
                        itemBuilder: (context, i) {
                          final v = vendors[i];
                          return AppCard(
                            onTap: () => context.push(RoutePaths.vendor(v.id)),
                            child: Row(
                              children: [
                                ProductThumb(
                                  seed: v.id,
                                  label: v.displayName,
                                  size: 52,
                                ),
                                const SizedBox(width: AppSpace.s12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        v.displayName,
                                        style: context.text.titleSmall,
                                      ),
                                      Text(
                                        [
                                          v.distanceLabel,
                                          if (v.ratingCount > 0)
                                            '★ ${v.ratingAvg.toStringAsFixed(1)} (${v.ratingCount})',
                                        ].join(' · '),
                                        style: context.text.bodyMedium
                                            ?.copyWith(color: c.textMed),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(AppIcons.chevron_right),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
