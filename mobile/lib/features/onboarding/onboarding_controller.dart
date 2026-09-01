import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';

const _kOnboardingSeen = 'stall.onboardingSeen';

/// Whether the intro carousel has been completed. Seeded from secure storage at
/// startup (see splash), persisted on completion.
class OnboardingController extends Notifier<bool> {
  @override
  bool build() => false;

  Future<void> restore() async {
    try {
      final v = await ref.read(secureStorageProvider).read(key: _kOnboardingSeen);
      state = v == '1';
    } catch (_) {
      state = false;
    }
  }

  Future<void> complete() async {
    state = true;
    try {
      await ref.read(secureStorageProvider).write(key: _kOnboardingSeen, value: '1');
    } catch (_) {
      // Non-fatal — the flag just won't persist across launches.
    }
  }
}

final onboardingSeenProvider =
    NotifierProvider<OnboardingController, bool>(OnboardingController.new);
