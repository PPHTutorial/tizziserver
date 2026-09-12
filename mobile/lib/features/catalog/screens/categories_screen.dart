import 'package:flutter/material.dart';

import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../widgets/category_browser.dart';

/// Screens 23–25 — category explorer. A 2-column photo grid of top-level
/// categories; the filter row re-ranks by a real signal (order volume /
/// recent publishes / live Inverse Draws) rather than just cosmetic tabs.
/// The actual grid+filter content is [CategoryBrowser], shared with the
/// bottom-nav Explore tab so the two never diverge.
class CategoriesScreen extends StatelessWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: const SafeArea(
        child: Column(
          children: [
            AppScreenHeader('Browse categories'),
            SizedBox(height: AppSpace.s8),
            Expanded(child: CategoryBrowser()),
          ],
        ),
      ),
    );
  }
}
