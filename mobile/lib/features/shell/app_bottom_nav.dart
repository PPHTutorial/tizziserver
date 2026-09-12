import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../api/models.dart';
import '../../design/context_ext.dart';
import '../../design/tokens.g.dart';

/// Font Awesome icon names used by the server-driven nav (`packages/core/src/
/// platform/nav.ts`). Unknown names fall back to a question mark.
const _navIcons = <String, IconData>{
  'house': FontAwesomeIcons.house,
  'compass': FontAwesomeIcons.compass,
  'cart-shopping': FontAwesomeIcons.cartShopping,
  'store': FontAwesomeIcons.store,
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
    final sel = currentIndex.clamp(0, items.length - 1);
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.border.withValues(alpha: 0.6))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _NavCell(
                    icon: navIconFor(items[i].icon),
                    label: items[i].label,
                    selected: i == sel,
                    onTap: () => onTap(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavCell extends StatelessWidget {
  const _NavCell({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkResponse(
      onTap: onTap,
      radius: 40,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 7),
            decoration: BoxDecoration(
              color: selected ? c.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: FaIcon(icon, size: 17, color: selected ? c.onPrimary : c.textLow),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: context.text.labelSmall?.copyWith(
              color: selected ? c.textHi : c.textLow,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
