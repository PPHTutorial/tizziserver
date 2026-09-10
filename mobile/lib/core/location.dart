import 'package:geolocator/geolocator.dart';

typedef LatLngRec = ({double lat, double lng});

/// Device location, best-effort. Returns `null` (caller falls back to a default
/// centre) when location services are off, permission is denied, or a fix
/// can't be obtained in time. Never throws.
class DeviceLocation {
  const DeviceLocation._();

  static Future<LatLngRec?> current({
    Duration timeout = const Duration(seconds: 8),
  }) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;

      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        return null;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: timeout),
      );
      return (lat: pos.latitude, lng: pos.longitude);
    } catch (_) {
      return null;
    }
  }
}
