import 'package:flutter/material.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';

import 'color_names.dart';
import 'components.dart';
import 'context_ext.dart';
import 'icons.dart';
import 'tokens.g.dart';
import 'widgets.dart';

/// ~24 curated everyday product colors — primaries/secondaries plus common
/// "spec sheet" colors (metals, neutrals) shoppers actually search for.
const List<NamedColor> _curatedSwatches = [
  NamedColor('Black', Color(0xFF000000)),
  NamedColor('White', Color(0xFFFFFFFF)),
  NamedColor('Gray', Color(0xFF9E9E9E)),
  NamedColor('Silver', Color(0xFFC0C0C0)),
  NamedColor('Gold', Color(0xFFFFD700)),
  NamedColor('Rose Gold', Color(0xFFB76E79)),
  NamedColor('Navy', Color(0xFF000080)),
  NamedColor('Red', Color(0xFFFF0000)),
  NamedColor('Orange', Color(0xFFFFA500)),
  NamedColor('Yellow', Color(0xFFFFEB3B)),
  NamedColor('Green', Color(0xFF4CAF50)),
  NamedColor('Teal', Color(0xFF008080)),
  NamedColor('Blue', Color(0xFF2196F3)),
  NamedColor('Indigo', Color(0xFF3F51B5)),
  NamedColor('Purple', Color(0xFF9C27B0)),
  NamedColor('Pink', Color(0xFFE91E63)),
  NamedColor('Brown', Color(0xFF795548)),
  NamedColor('Beige', Color(0xFFF5F5DC)),
  NamedColor('Cream', Color(0xFFFFFDD0)),
  NamedColor('Maroon', Color(0xFF800000)),
  NamedColor('Olive', Color(0xFF808000)),
  NamedColor('Mint', Color(0xFF98FF98)),
  NamedColor('Turquoise', Color(0xFF40E0D0)),
  NamedColor('Charcoal', Color(0xFF36454F)),
];

/// A grid of curated swatches plus a "Custom…" tile that opens a full
/// hex/HSV picker. Whatever gets picked is shown next to its
/// [nearestColorName] — the point being a color is never presented as a bare
/// swatch or hex code, always with a human-readable name.
class AppColorPicker extends StatefulWidget {
  const AppColorPicker({super.key, this.value, required this.onChanged, required this.label});

  final Color? value;
  final ValueChanged<Color> onChanged;
  final String label;

  @override
  State<AppColorPicker> createState() => _AppColorPickerState();
}

class _AppColorPickerState extends State<AppColorPicker> {
  late Color? _selected = widget.value;

  void _select(Color color) {
    setState(() => _selected = color);
    widget.onChanged(color);
  }

  Future<void> _openCustomPicker() async {
    var temp = _selected ?? Colors.black;
    final picked = await showAppSheet<Color>(
      context,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: const EdgeInsets.fromLTRB(AppSpace.s20, AppSpace.s8, AppSpace.s20, AppSpace.s20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Custom color', style: context.text.titleMedium),
              const SizedBox(height: AppSpace.s16),
              ColorPicker(
                pickerColor: temp,
                onColorChanged: (c) => setSheetState(() => temp = c),
                enableAlpha: false,
                displayThumbColor: true,
                paletteType: PaletteType.hsv,
                hexInputBar: true,
                labelTypes: const [ColorLabelType.hex, ColorLabelType.rgb],
                pickerAreaHeightPercent: 0.6,
                pickerAreaBorderRadius: BorderRadius.circular(AppRadius.md),
              ),
              const SizedBox(height: AppSpace.s16),
              PrimaryButton(
                label: 'Use this color',
                onPressed: () => Navigator.pop(context, temp),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) _select(picked);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label, style: context.text.labelMedium?.copyWith(color: c.textMed)),
        const SizedBox(height: AppSpace.s10),
        if (_selected != null) ...[
          Row(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: _selected,
                  shape: BoxShape.circle,
                  border: Border.all(color: c.border),
                ),
              ),
              const SizedBox(width: AppSpace.s8),
              Text(nearestColorName(_selected!), style: context.text.bodyMedium),
            ],
          ),
          const SizedBox(height: AppSpace.s12),
        ],
        Wrap(
          spacing: AppSpace.s12,
          runSpacing: AppSpace.s12,
          children: [
            for (final swatch in _curatedSwatches)
              _SwatchTile(
                color: swatch.color,
                selected: _selected != null && _selected!.toARGB32() == swatch.color.toARGB32(),
                onTap: () => _select(swatch.color),
              ),
            _CustomTile(onTap: _openCustomPicker),
          ],
        ),
      ],
    );
  }
}

class _SwatchTile extends StatelessWidget {
  const _SwatchTile({required this.color, required this.selected, required this.onTap});
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Pick a contrasting check-mark color by the swatch's own luminance —
    // this tile deliberately ignores the app theme, same reasoning as the
    // neutral thumbnail backing in AppAutocomplete.
    final fg = color.computeLuminance() > 0.5 ? Colors.black : Colors.white;
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: selected ? c.primary : c.border, width: selected ? 2 : 1),
        ),
        alignment: Alignment.center,
        child: selected ? Icon(AppIcons.check, size: 16, color: fg) : null,
      ),
    );
  }
}

class _CustomTile extends StatelessWidget {
  const _CustomTile({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: c.surfaceSunken,
          shape: BoxShape.circle,
          border: Border.all(color: c.border),
        ),
        alignment: Alignment.center,
        child: Icon(AppIcons.add, size: 16, color: c.textMed),
      ),
    );
  }
}
