import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Builds a [ThemeData] from the generated GrandPrice tokens.
/// Widgets read colours via `Theme.of(context).extension<GpColors>()!`
/// and text roles via [GpType]. Never hardcode hex or font sizes (CI-enforced later).
class GpTheme {
  static ThemeData light() => _base(GpColors.light, Brightness.light);
  static ThemeData dark() => _base(GpColors.dark, Brightness.dark);

  static ThemeData _base(GpColors c, Brightness brightness) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.primaryContainer,
      onPrimaryContainer: c.onPrimaryContainer,
      secondary: c.primary,
      onSecondary: c.onPrimary,
      error: c.error,
      onError: Colors.white,
      surface: c.surface,
      onSurface: c.textHi,
    );

    TextStyle role(GpTextRole r) => TextStyle(
          fontFamily: r.family,
          fontWeight: r.fontWeight,
          fontSize: r.size.toDouble(),
          height: r.height,
        );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.bg,
      extensions: [c],
      textTheme: TextTheme(
        displayLarge: role(GpType.display),
        headlineMedium: role(GpType.headline),
        titleLarge: role(GpType.titleLg),
        titleMedium: role(GpType.titleMd),
        titleSmall: role(GpType.titleSm),
        bodyLarge: role(GpType.bodyLg),
        bodyMedium: role(GpType.bodyMd),
        labelLarge: role(GpType.labelLg),
        labelMedium: role(GpType.label),
        labelSmall: role(GpType.labelSm),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: c.primary,
          foregroundColor: c.onPrimary,
          minimumSize: const Size.fromHeight(56),
          shape: const StadiumBorder(),
          textStyle: role(GpType.labelLg),
        ),
      ),
    );
  }
}
