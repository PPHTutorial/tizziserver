import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' as ll;

import 'context_ext.dart';
import 'icons.dart';

/// A pin to render on [AppMap].
class AppMapMarker {
  const AppMapMarker({
    required this.id,
    required this.lat,
    required this.lng,
    this.color,
    this.icon = AppIcons.location_on_outlined,
    this.label,
    this.heading,
    this.size = 34,
  });
  final String id;
  final double lat;
  final double lng;
  final Color? color;
  final IconData icon;
  final String? label;

  /// Degrees clockwise from north — rotates the pin (e.g. a moving courier).
  final double? heading;
  final double size;
}

/// A path to render on [AppMap] (e.g. a courier's breadcrumb trail).
class AppMapPolyline {
  const AppMapPolyline({required this.id, required this.points, required this.color, this.width = 4});
  final String id;
  final List<({double lat, double lng})> points;
  final Color color;
  final double width;
}

/// OpenStreetMap-tile map view — no API key, no per-load billing (unlike
/// Google Maps). Tile source is swappable via the `MAP_TILE_URL_TEMPLATE`
/// dart-define (defaults to CartoDB's free Voyager basemap, which — unlike
/// tile.openstreetmap.org — is meant for exactly this kind of production
/// use). Self-host a tile server later (e.g. add one to
/// `infra/docker/docker-compose.yml`) by pointing that define at it — no
/// call-site changes needed. Never point this at tile.openstreetmap.org for
/// production traffic; their usage policy disallows heavy/commercial use
/// without self-hosting.
class AppMap extends StatelessWidget {
  const AppMap({
    super.key,
    required this.center,
    this.zoom = 13,
    this.markers = const [],
    this.polylines = const [],
    this.interactive = true,
  });

  final ({double lat, double lng}) center;
  final double zoom;
  final List<AppMapMarker> markers;
  final List<AppMapPolyline> polylines;
  final bool interactive;

  static const String _tileUrlTemplate = String.fromEnvironment(
    'MAP_TILE_URL_TEMPLATE',
    defaultValue: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  );

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      options: MapOptions(
        initialCenter: ll.LatLng(center.lat, center.lng),
        initialZoom: zoom,
        interactionOptions: InteractionOptions(
          flags: interactive ? InteractiveFlag.all : InteractiveFlag.none,
        ),
      ),
      children: [
        TileLayer(
          urlTemplate: _tileUrlTemplate,
          subdomains: const ['a', 'b', 'c', 'd'],
          userAgentPackageName: 'com.stall.app',
        ),
        if (polylines.isNotEmpty)
          PolylineLayer(
            polylines: [
              for (final p in polylines)
                Polyline(
                  points: [for (final pt in p.points) ll.LatLng(pt.lat, pt.lng)],
                  color: p.color,
                  strokeWidth: p.width,
                ),
            ],
          ),
        MarkerLayer(
          markers: [
            for (final m in markers)
              Marker(
                point: ll.LatLng(m.lat, m.lng),
                width: m.size + 16,
                height: m.size + 16,
                child: _MapPin(marker: m),
              ),
          ],
        ),
      ],
    );
  }
}

class _MapPin extends StatelessWidget {
  const _MapPin({required this.marker});
  final AppMapMarker marker;

  @override
  Widget build(BuildContext context) {
    final color = marker.color ?? context.colors.primary;
    final pin = Icon(marker.icon, color: color, size: marker.size);
    final rotated = marker.heading != null
        ? Transform.rotate(angle: marker.heading! * (3.1415926535 / 180), child: pin)
        : pin;
    final label = marker.label;
    if (label == null) return Center(child: rotated);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(6),
            boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 3, offset: Offset(0, 1))],
          ),
          child: Text(label, style: const TextStyle(fontSize: 10, color: Colors.black87)),
        ),
        rotated,
      ],
    );
  }
}
