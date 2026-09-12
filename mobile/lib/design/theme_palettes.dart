import 'dart:math';

/// A single vendor-selectable shop theme: an ordered set of hex colors.
class ThemePalette {
  const ThemePalette(this.id, this.colors);
  final String id;
  final List<String> colors;
}

/// Curated, aesthetically-safe base swatches — a mix of vibrant and neutral
/// tones — combinations are sampled from this set, never generated from raw
/// random RGB values (which would produce ugly/clashing results).
const _baseSwatches = <String>[
  '#FF6B35', '#F7931E', '#FFD23F', '#06D6A0', '#1B9AAA', '#118AB2',
  '#073B4C', '#5C4D7D', '#8338EC', '#3A86FF', '#FF006E', '#FB5607',
  '#2EC4B6', '#E71D36', '#264653', '#2A9D8F', '#E9C46A', '#F4A261',
  '#4361EE', '#7209B7', '#212121', '#616161', '#9E9E9E', '#455A64',
];

List<ThemePalette>? _cache;

/// The full catalog of selectable shop theme palettes (100 total: 40 of size
/// 3, 35 of size 5, 25 of size 7). Deterministic (fixed seed) so the same
/// palette ids/colors show up for every viewer/session — memoized after the
/// first call.
List<ThemePalette> themePalettes() => _cache ??= _generate();

List<ThemePalette> _generate() {
  final rnd = Random(20260912);
  final seen = <String>{};
  final out = <ThemePalette>[];

  void fill(int size, int count, String prefix) {
    var made = 0;
    var guard = 0;
    while (made < count && guard < count * 50) {
      guard++;
      final shuffled = [..._baseSwatches]..shuffle(rnd);
      final picked = shuffled.take(size).toList();
      final key = '$size:${([...picked]..sort()).join(",")}';
      if (seen.add(key)) {
        out.add(ThemePalette('$prefix-${made + 1}', picked));
        made++;
      }
    }
  }

  fill(3, 40, 'p3');
  fill(5, 35, 'p5');
  fill(7, 25, 'p7');
  return out;
}

/// Palettes of exactly [size] colors (3, 5, or 7).
List<ThemePalette> themePalettesOfSize(int size) =>
    themePalettes().where((p) => p.colors.length == size).toList();
