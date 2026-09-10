import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../design/context_ext.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';
import 'onboarding_controller.dart';
import '../../design/icons.dart';

/// Screens 2–3 — Onboarding carousel. Completing it persists the flag and
/// hands off to Welcome.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pageController = PageController();
  int _page = 0;

  static const _slides = <(IconData, String, String)>[
    (
      AppIcons.storefront_outlined,
      'One app, every marketplace',
      'Shop goods or order gas — Stall powers them both with the same account.'
    ),
    (
      AppIcons.bolt_outlined,
      'Fast, tracked delivery',
      'Watch your courier in real time from pickup to your door.'
    ),
    (
      AppIcons.verified_user_outlined,
      'Secure by design',
      'Passwordless sign-in, 2FA, and a transaction PIN keep your account yours.'
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await ref.read(onboardingSeenProvider.notifier).complete();
    if (mounted) context.go(RoutePaths.welcome);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final last = _page == _slides.length - 1;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _finish,
                child: const Text('Skip'),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (i) => setState(() => _page = i),
                itemCount: _slides.length,
                itemBuilder: (context, i) {
                  final (icon, title, body) = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.all(AppSpace.s32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 120,
                          height: 120,
                          decoration: BoxDecoration(
                            color: c.primaryContainer,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(icon, size: 52, color: c.onPrimaryContainer),
                        ),
                        const SizedBox(height: AppSpace.s32),
                        Text(title,
                            textAlign: TextAlign.center,
                            style: context.text.headlineMedium),
                        const SizedBox(height: AppSpace.s12),
                        Text(body,
                            textAlign: TextAlign.center,
                            style: context.text.bodyLarge
                                ?.copyWith(color: c.textMed)),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_slides.length, (i) {
                final active = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: AppSpace.s4),
                  width: active ? 22 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: active ? c.primary : c.border,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpace.s24),
              child: PrimaryButton(
                label: last ? 'Get started' : 'Next',
                onPressed: () {
                  if (last) {
                    _finish();
                  } else {
                    _pageController.nextPage(
                      duration: const Duration(milliseconds: 250),
                      curve: Curves.easeOut,
                    );
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
