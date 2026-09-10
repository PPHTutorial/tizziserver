import 'package:flutter/material.dart';

/// §30 — one set of breakpoints for the whole app. `compact` = phones,
/// `medium` = large phones / small tablets / foldables, `expanded` = tablets
/// and desktop-width windows.
enum WidthClass { compact, medium, expanded }

extension ResponsiveContext on BuildContext {
  WidthClass get widthClass {
    final w = MediaQuery.sizeOf(this).width;
    if (w >= 1000) return WidthClass.expanded;
    if (w >= 600) return WidthClass.medium;
    return WidthClass.compact;
  }

  /// True on small tablets and up — the point where two-pane layouts and a nav
  /// rail start to pay off.
  bool get isWide => widthClass != WidthClass.compact;

  bool get isExpanded => widthClass == WidthClass.expanded;
}

/// Caps a scrollable body's width and centres it, so text lines and cards don't
/// stretch edge-to-edge on tablets. A no-op on phones.
class MaxWidth extends StatelessWidget {
  const MaxWidth({super.key, required this.child, this.maxWidth = 720});

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: child,
        ),
      );
}

/// Stacks [start] above [end] on compact widths; places them side by side once
/// the viewport reaches [breakpoint]. Flex ratios only apply in the row layout.
class TwoPane extends StatelessWidget {
  const TwoPane({
    super.key,
    required this.start,
    required this.end,
    this.breakpoint = 905,
    this.startFlex = 1,
    this.endFlex = 1,
    this.gap = 0,
  });

  final Widget start;
  final Widget end;
  final double breakpoint;
  final int startFlex;
  final int endFlex;
  final double gap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < breakpoint) {
          return Column(mainAxisSize: MainAxisSize.min, children: [start, end]);
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(flex: startFlex, child: start),
            if (gap > 0) SizedBox(width: gap),
            Expanded(flex: endFlex, child: end),
          ],
        );
      },
    );
  }
}
