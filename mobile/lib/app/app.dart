import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design/theme.dart';
import '../design/tokens.g.dart';
import 'providers.dart';
import 'router.dart';

class StallApp extends ConsumerWidget {
  const StallApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: ref.watch(apiConfigProvider).platformDisplayName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      routerConfig: router,
      // Paint the OS status + navigation bars with the scaffold background on
      // every route (AppBar screens are also covered by appBarTheme).
      builder: (context, child) {
        final t = Theme.of(context);
        final c = t.extension<AppColors>()!;
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: AppTheme.systemOverlay(c, t.brightness),
          child: child!,
        );
      },
    );
  }
}
