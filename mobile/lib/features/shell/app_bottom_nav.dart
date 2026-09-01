import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../api/models.dart';
import '../../design/context_ext.dart';

/// Font Awesome icon names used by the server-driven nav (`packages/core/src/
/// platform/nav.ts`). Unknown names fall back to a question mark.
const _navIcons = <String, IconData>{
  'house': FontAwesomeIcons.house,
  'compass': FontAwesomeIcons.compass,
  'cart-shopping': FontAwesomeIcons.cartShopping,
  'box': FontAwesomeIcons.box,
  'user': FontAwesomeIcons.user,
  'gauge': FontAwesomeIcons.gauge,
  'tags': FontAwesomeIcons.tags,
  'receipt': FontAwesomeIcons.receipt,
  'chart-line': FontAwesomeIcons.chartLine,
  'wallet': FontAwesomeIcons.wallet,
  'list-check': FontAwesomeIcons.listCheck,
  'route': FontAwesomeIcons.route,
  'sack-dollar': FontAwesomeIcons.sackDollar,
  'headset': FontAwesomeIcons.headset,
  'id-card': FontAwesomeIcons.idCard,
  'scale-balanced': FontAwesomeIcons.scaleBalanced,
  'sliders': FontAwesomeIcons.sliders,
};

IconData navIconFor(String name) => _navIcons[name] ?? FontAwesomeIcons.circleQuestion;

/// §32 — the bottom nav, rendered entirely from `bootstrap.nav`.
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<NavItemDto> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (items.isEmpty) return const SizedBox.shrink();
    return NavigationBarTheme(
      data: NavigationBarThemeData(
        backgroundColor: c.surface,
        indicatorColor: c.primaryContainer,
        labelTextStyle: WidgetStatePropertyAll(
          context.text.labelSmall?.copyWith(color: c.textMed),
        ),
      ),
      child: NavigationBar(
        selectedIndex: currentIndex.clamp(0, items.length - 1),
        onDestinationSelected: onTap,
        destinations: [
          for (final item in items)
            NavigationDestination(
              icon: FaIcon(navIconFor(item.icon), size: 18),
              label: item.label,
            ),
        ],
      ),
    );
  }
}
