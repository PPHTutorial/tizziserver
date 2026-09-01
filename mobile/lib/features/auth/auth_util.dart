import '../../api/api_exception.dart';
import '../../design/widgets.dart';

/// Run an API call, mapping any failure to friendly copy for inline display.
/// Returns `null` on success, the message on failure.
Future<String?> runCatching(Future<void> Function() action) async {
  try {
    await action();
    return null;
  } on StallApiException catch (e) {
    return friendlyAuthError(e.code, e.message);
  } catch (_) {
    return 'Something went wrong. Please try again.';
  }
}
