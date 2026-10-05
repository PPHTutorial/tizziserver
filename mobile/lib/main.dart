import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/misconfigured_app.dart';
import 'core/api_config.dart';

void main() {
  // Release builds without the production endpoints would silently talk to
  // localhost — show a hard error screen instead (build command documented in
  // core/api_config.dart).
  final missing = missingReleaseDefines();
  if (missing.isNotEmpty) {
    debugPrint('Stall: release build missing --dart-define: $missing');
    runApp(MisconfiguredApp(missing: missing));
    return;
  }
  runApp(const ProviderScope(child: StallApp()));
}
