import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Builds a [ThemeData] from the generated GrandPrice tokens.
/// Widgets read colours via `Theme.of(context).extension<AppColors>()!`
/// and text roles via [AppType]. Never hardcode hex or font sizes (CI-enforced later).
class AppTheme {
  static ThemeData light() => _base(AppColors.light, Brightness.light);
  static ThemeData dark() => _base(AppColors.dark, Brightness.dark);

  static ThemeData _base(AppColors c, Brightness brightness) {
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

    TextStyle role(AppTextRole r) => TextStyle(
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
        displayLarge: role(AppType.display),
        headlineMedium: role(AppType.headline),
        titleLarge: role(AppType.titleLg),
        titleMedium: role(AppType.titleMd),
        titleSmall: role(AppType.titleSm),
        bodyLarge: role(AppType.bodyLg),
        bodyMedium: role(AppType.bodyMd),
        labelLarge: role(AppType.labelLg),
        labelMedium: role(AppType.label),
        labelSmall: role(AppType.labelSm),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: c.primary,
          foregroundColor: c.onPrimary,
          minimumSize: const Size.fromHeight(56),
          shape: const StadiumBorder(),
          textStyle: role(AppType.labelLg),
        ),
      ),
    );
  }
}
