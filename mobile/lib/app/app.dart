import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../design/theme.dart';
import '../design/tokens.g.dart';

class GrandPriceApp extends StatelessWidget {
  const GrandPriceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GrandPrice',
      debugShowCheckedModeBanner: false,
      theme: GpTheme.light(),
      darkTheme: GpTheme.dark(),
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
    final c = Theme.of(context).extension<GpColors>()!;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(GpSpace.s24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('GrandPrice', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: GpSpace.s8),
              Text(
                'Phase 0 — foundation wired. Design tokens live.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: c.textMed),
              ),
              const SizedBox(height: GpSpace.s24),
              Wrap(
                spacing: GpSpace.s8,
                runSpacing: GpSpace.s8,
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
                        borderRadius: BorderRadius.circular(GpRadius.xl),
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
