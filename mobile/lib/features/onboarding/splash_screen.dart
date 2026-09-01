import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../design/context_ext.dart';
import '../../design/tokens.g.dart';
import 'onboarding_controller.dart';

/// Screen 1 — Splash. Restores persisted state, then the router redirect takes
/// over (onboarding / welcome / home).
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _boot());
  }

  Future<void> _boot() async {
    await ref.read(onboardingSeenProvider.notifier).restore();
    await ref.read(authControllerProvider.notifier).restore();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Stall',
              style: context.text.displayLarge?.copyWith(color: c.onPrimary),
            ),
            const SizedBox(height: AppSpace.s16),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2, color: c.onPrimary),
            ),
          ],
        ),
      ),
    );
  }
}
