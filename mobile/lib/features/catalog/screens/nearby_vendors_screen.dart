import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/product_card_tile.dart';

/// Screens 34–37 — Nearby Vendors: a map + list of vendors around a point.
/// Centre defaults to Accra (`kDefaultLatLng`); wire a geolocator later.
class NearbyVendorsScreen extends ConsumerStatefulWidget {
  const NearbyVendorsScreen({super.key});

  @override
  ConsumerState<NearbyVendorsScreen> createState() => _NearbyVendorsScreenState();
}

class _NearbyVendorsScreenState extends ConsumerState<NearbyVendorsScreen> {
  int _radiusM = 5000;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final centre = kDefaultLatLng;
    final async = ref.watch(nearbyVendorsProvider((lat: centre.lat, lng: centre.lng, radiusM: _radiusM)));

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        title: const Text('Nearby vendors'),
        actions: [
          PopupMenuButton<int>(
            initialValue: _radiusM,
            onSelected: (v) => setState(() => _radiusM = v),
            itemBuilder: (context) => const [
              PopupMenuItem(value: 2000, child: Text('Within 2 km')),
              PopupMenuItem(value: 5000, child: Text('Within 5 km')),
              PopupMenuItem(value: 15000, child: Text('Within 15 km')),
            ],
            icon: const Icon(Icons.social_distance),
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 220,
            child: async.maybeWhen(
              orElse: () => Container(color: c.surfaceSunken),
              data: (vendors) => GoogleMap(
                initialCameraPosition: CameraPosition(
                  target: LatLng(centre.lat, centre.lng),
                  zoom: 12,
                ),
                markers: {
                  for (var i = 0; i < vendors.length; i++)
                    Marker(
                      markerId: MarkerId(vendors[i].id),
                      // No per-vendor coords in the DTO — fan out around the centre.
                      position: LatLng(centre.lat + (i - vendors.length / 2) * 0.004, centre.lng + i * 0.003),
                      infoWindow: InfoWindow(title: vendors[i].displayName, snippet: vendors[i].distanceLabel),
                    ),
                },
                myLocationButtonEnabled: false,
                zoomControlsEnabled: false,
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
                      icon: Icons.storefront_outlined,
                      title: 'No vendors in range',
                      body: 'Try widening the search radius.',
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(AppSpace.s16),
                      itemCount: vendors.length,
                      separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
                      itemBuilder: (context, i) {
                        final v = vendors[i];
                        return InkWell(
                          onTap: () => context.push(RoutePaths.vendor(v.id)),
                          borderRadius: BorderRadius.circular(AppRadius.lg),
                          child: Row(
                            children: [
                              ProductThumb(seed: v.id, label: v.displayName, size: 52),
                              const SizedBox(width: AppSpace.s12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(v.displayName, style: context.text.titleSmall),
                                    Text(
                                      [
                                        v.distanceLabel,
                                        if (v.ratingCount > 0) '★ ${v.ratingAvg.toStringAsFixed(1)}',
                                      ].join(' · '),
                                      style: context.text.bodyMedium?.copyWith(color: c.textMed),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(Icons.chevron_right),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
