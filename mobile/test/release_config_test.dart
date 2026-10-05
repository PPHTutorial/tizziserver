import 'package:flutter_test/flutter_test.dart';
import 'package:stall/app/misconfigured_app.dart';
import 'package:stall/core/api_config.dart';

void main() {
  test('debug/test builds never require the release defines', () {
    expect(missingReleaseDefines(releaseMode: false), isEmpty);
  });

  test('a release build without --dart-define reports every endpoint', () {
    // `flutter test` passes no defines, so this is the misconfigured case.
    expect(missingReleaseDefines(releaseMode: true), [
      'STALL_API_URL',
      'STALL_REALTIME_URL',
      'STALL_MEDIA_URL',
      'STALL_PLATFORM',
    ]);
  });

  testWidgets('MisconfiguredApp lists the missing defines', (tester) async {
    await tester.pumpWidget(
      const MisconfiguredApp(missing: ['STALL_API_URL', 'STALL_MEDIA_URL']),
    );
    expect(find.text('This build is misconfigured'), findsOneWidget);
    expect(find.text('• --dart-define=STALL_API_URL=…'), findsOneWidget);
    expect(find.text('• --dart-define=STALL_MEDIA_URL=…'), findsOneWidget);
  });
}
