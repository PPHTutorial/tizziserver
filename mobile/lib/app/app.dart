import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../design/theme.dart';
import '../design/tokens.g.dart';

class StallApp extends StatelessWidget {
  const StallApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Stall',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: const _Phase0Home(),
    );
  }
}

/// Phase-0 placeholder — proves the token theme is wired. Replaced by the
/// real splash/onboarding flow in Phase 1 (see docs/05-ROADMAP.md).
class _Phase0Home extends StatelessWidget {
  const _Phase0Home();

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).extension<AppColors>()!;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Stall', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: AppSpace.s8),
              Text(
                'Phase 0 — foundation wired. Design tokens live.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: c.textMed),
              ),
              const SizedBox(height: AppSpace.s24),
              Wrap(
                spacing: AppSpace.s8,
                runSpacing: AppSpace.s8,
                children: [
                  for (final e in <(String, Color)>[
                    ('primary', c.primary),
                    ('success', c.success),
                    ('rating', c.rating),
                    ('error', c.error),
                    ('surface', c.surface),
                  ])
                    Container(
                      width: 96,
                      height: 56,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: e.$2,
                        borderRadius: BorderRadius.circular(AppRadius.xl),
                        border: Border.all(color: c.border),
                      ),
                      child: Text(e.$1, style: Theme.of(context).textTheme.labelSmall),
                    ),
                ],
              ),
              const Spacer(),
              FilledButton.icon(
                onPressed: () {},
                icon: const FaIcon(FontAwesomeIcons.boltLightning, size: 16),
                label: const Text('Join Draw'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
