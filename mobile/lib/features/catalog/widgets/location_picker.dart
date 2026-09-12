import 'package:flutter/material.dart';

import '../../../core/location.dart';
import '../../../design/app_map.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../catalog_providers.dart' show kDefaultLatLng;

/// Tap-to-drop-a-pin location picker, built on [AppMap]. Pure lat/lng capture
/// — no geocoding, no reverse lookup; the address stays whatever the vendor
/// typed in the separate street/city/region/country fields.
class LocationPickerField extends StatefulWidget {
  const LocationPickerField({
    super.key,
    this.initialLat,
    this.initialLng,
    required this.onChanged,
  });

  final double? initialLat;
  final double? initialLng;
  final void Function(double lat, double lng) onChanged;

  @override
  State<LocationPickerField> createState() => _LocationPickerFieldState();
}

class _LocationPickerFieldState extends State<LocationPickerField> {
  late double _lat = widget.initialLat ?? kDefaultLatLng.lat;
  late double _lng = widget.initialLng ?? kDefaultLatLng.lng;
  bool _locating = false;

  void _setPoint(double lat, double lng) {
    setState(() {
      _lat = lat;
      _lng = lng;
    });
    widget.onChanged(lat, lng);
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    final pos = await DeviceLocation.current();
    if (!mounted) return;
    setState(() => _locating = false);
    if (pos != null) _setPoint(pos.lat, pos.lng);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          // flutter_map's FlutterMap throws "infinite size during layout" if
          // either axis is left unbounded — bound both explicitly rather than
          // relying on the ancestor chain to happen to constrain width.
          child: SizedBox(
            height: 200,
            width: double.infinity,
            child: Stack(
              alignment: Alignment.center,
              children: [
                AppMap(
                  center: (lat: _lat, lng: _lng),
                  zoom: 15,
                  onTap: (lat, lng) => _setPoint(lat, lng),
                  markers: [
                    AppMapMarker(id: 'pin', lat: _lat, lng: _lng, color: c.primary),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpace.s8),
        Row(
          children: [
            Expanded(
              child: Text(
                '${_lat.toStringAsFixed(5)}, ${_lng.toStringAsFixed(5)}',
                style: context.text.bodySmall?.copyWith(color: c.textMed),
              ),
            ),
            TextButton.icon(
              onPressed: _locating ? null : _useCurrentLocation,
              icon: _locating
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(AppIcons.my_location, size: 16),
              label: const Text('Use my location'),
            ),
          ],
        ),
        Text(
          'Tap the map to drop a pin at your shop\'s location.',
          style: context.text.bodySmall?.copyWith(color: c.textLow),
        ),
      ],
    );
  }
}
