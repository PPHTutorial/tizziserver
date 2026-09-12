import 'package:flutter/material.dart';

import '../../../design/context_ext.dart';
import '../../../design/theme_palettes.dart';
import '../../../design/tokens.g.dart';

/// Curated shop theme picker — choose a palette size (3/5/7 colors), then a
/// specific combination from the deterministic catalog in `theme_palettes.dart`.
class ThemeColorPicker extends StatefulWidget {
  const ThemeColorPicker({super.key, required this.selected, required this.onChanged});

  final List<String> selected;
  final ValueChanged<List<String>> onChanged;

  @override
  State<ThemeColorPicker> createState() => _ThemeColorPickerState();
}

class _ThemeColorPickerState extends State<ThemeColorPicker> {
  late int _size = widget.selected.isNotEmpty ? widget.selected.length : 3;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final palettes = themePalettesOfSize(_size);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (final size in [3, 5, 7])
              Padding(
                padding: const EdgeInsets.only(right: AppSpace.s8),
                child: ChoiceChip(
                  label: Text('$size colors'),
                  selected: _size == size,
                  onSelected: (_) => setState(() => _size = size),
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpace.s12),
        SizedBox(
          height: 56,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: palettes.length,
            separatorBuilder: (_, __) => const SizedBox(width: AppSpace.s8),
            itemBuilder: (context, i) {
              final p = palettes[i];
              final isSelected = _colorsEqual(widget.selected, p.colors);
              return GestureDetector(
                onTap: () => widget.onChanged(p.colors),
                child: Container(
                  width: 72,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(color: isSelected ? c.primary : c.border, width: isSelected ? 2 : 1),
                  ),
                  child: Row(
                    children: [
                      for (final hex in p.colors)
                        Expanded(child: Container(color: _colorFromHex(hex))),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        if (widget.selected.isEmpty) ...[
          const SizedBox(height: AppSpace.s8),
          Text('Pick a color palette for your shop.', style: context.text.bodySmall?.copyWith(color: c.textLow)),
        ],
      ],
    );
  }
}

bool _colorsEqual(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i].toLowerCase() != b[i].toLowerCase()) return false;
  }
  return true;
}

Color _colorFromHex(String hex) {
  final clean = hex.replaceFirst('#', '');
  return Color(int.parse('FF$clean', radix: 16));
}
