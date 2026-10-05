import 'package:flutter/material.dart';

import '../design/context_ext.dart';
import '../design/theme.dart';
import '../design/tokens.g.dart';

/// Shown instead of the app when a release build was compiled without the
/// required `--dart-define`s (see `missingReleaseDefines`). Failing loudly
/// beats shipping a build that silently talks to `localhost`.
class MisconfiguredApp extends StatelessWidget {
  const MisconfiguredApp({super.key, required this.missing});
  final List<String> missing;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: Builder(
        builder: (context) => Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpace.s24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 48,
                    color: context.colors.error,
                  ),
                  const SizedBox(height: AppSpace.s16),
                  Text(
                    'This build is misconfigured',
                    style: context.text.headlineSmall,
                  ),
                  const SizedBox(height: AppSpace.s8),
                  Text(
                    'It was built without these required settings:',
                    style: context.text.bodyMedium?.copyWith(
                      color: context.colors.textMed,
                    ),
                  ),
                  const SizedBox(height: AppSpace.s8),
                  for (final name in missing)
                    Text('• --dart-define=$name=…', style: context.text.bodyMedium),
                  const SizedBox(height: AppSpace.s16),
                  Text(
                    'Rebuild with the production values (see lib/core/api_config.dart).',
                    style: context.text.bodySmall?.copyWith(
                      color: context.colors.textMed,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
