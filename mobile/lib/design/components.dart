import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import 'context_ext.dart';
import 'icons.dart';
import 'responsive.dart';
import 'tokens.g.dart';

/// A labelled number tile for KPI rows — three or four sit side by side in a
/// `Row`, each wrapping itself in `Expanded`.
///
/// [plain] drops the sunken box (a bare number-over-label column, as used on
/// the profile / dashboard headers); [valueColor] tints the number.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.plain = false,
    this.valueColor,
  });
  final String label;
  final String value;
  final bool plain;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final inner = Column(
      children: [
        Text(value,
            style: context.text.titleLarge?.copyWith(color: valueColor ?? c.textHi)),
        const SizedBox(height: 2),
        Text(label,
            textAlign: TextAlign.center,
            style: context.text.bodySmall?.copyWith(color: c.textMed)),
      ],
    );
    return Expanded(
      child: plain
          ? Padding(padding: const EdgeInsets.symmetric(vertical: AppSpace.s4), child: inner)
          : Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              padding: const EdgeInsets.symmetric(vertical: AppSpace.s16),
              decoration: BoxDecoration(
                  color: c.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
              child: inner,
            ),
    );
  }
}

/// The GrandPrice screen header: a circular back button, a bold display title,
/// and an optional trailing action (an orange text link via [actionLabel] /
/// [onAction], or an arbitrary [trailing] widget). Sits at the top of a
/// screen body — pair it with a plain `Scaffold` (no `AppBar`).
class AppScreenHeader extends StatelessWidget {
  const AppScreenHeader(
    this.title, {
    super.key,
    this.onBack,
    this.showBack = true,
    this.actionLabel,
    this.onAction,
    this.trailing,
  });

  final String title;
  final VoidCallback? onBack;
  final bool showBack;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s8, AppSpace.s16, AppSpace.s12),
      child: Row(
        children: [
          if (showBack) ...[
            _CircleButton(
              icon: AppIcons.chevron_left,
              onTap: onBack ?? () => Navigator.of(context).maybePop(),
            ),
            const SizedBox(width: AppSpace.s12),
          ],
          Expanded(child: Text(title, style: context.text.headlineMedium)),
          if (trailing != null)
            trailing!
          else if (actionLabel != null)
            TextButton(
              onPressed: onAction,
              child: Text(actionLabel!,
                  style: context.text.labelLarge?.copyWith(color: c.primary)),
            ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 16, color: c.textHi),
        ),
      ),
    );
  }
}

/// A tappable menu row — leading icon, bold label, optional trailing value /
/// badge, chevron. Wrap in [AppCard] for the profile / settings list look, or
/// drop bare into an existing card.
class AppListRow extends StatelessWidget {
  const AppListRow({
    super.key,
    required this.icon,
    required this.label,
    this.trailing,
    this.onTap,
    this.tint,
    this.showChevron = true,
  });

  final IconData icon;
  final String label;
  final Widget? trailing;
  final VoidCallback? onTap;

  /// Tints the icon + label (e.g. the destructive orange "Logout" row).
  final Color? tint;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg = tint ?? c.textHi;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.r2xl),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16, vertical: AppSpace.s16),
        child: Row(
          children: [
            Icon(icon, size: 18, color: fg),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Text(label,
                  style: context.text.titleSmall?.copyWith(color: fg)),
            ),
            if (trailing != null) ...[trailing!, const SizedBox(width: AppSpace.s8)],
            if (showChevron) Icon(AppIcons.chevron_right, size: 13, color: c.textLow),
          ],
        ),
      ),
    );
  }
}

/// A selectable filter pill — filled orange when [selected], hairline-outlined
/// otherwise. Used for the order / job / search filter rows.
class AppChip extends StatelessWidget {
  const AppChip(this.label, {super.key, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Chip rows commonly sit in a fixed-height horizontal ListView, which
    // stretches each child to fill that height — Center keeps the label
    // vertically centred instead of top-aligned with dead space below it,
    // while still shrink-wrapping to the label's own size when unconstrained
    // (e.g. inside a Wrap).
    return Material(
      color: selected ? c.primary : c.surface,
      shape: StadiumBorder(side: BorderSide(color: selected ? c.primary : c.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s16, vertical: AppSpace.s10),
            child: Text(label,
                style: context.text.labelLarge
                    ?.copyWith(color: selected ? c.onPrimary : c.textMed)),
          ),
        ),
      ),
    );
  }
}

/// A `−  n  +` quantity control in a sunken pill.
class AppQtyStepper extends StatelessWidget {
  const AppQtyStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 1,
    this.max = 99,
  });
  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget btn(IconData icon, bool enabled, VoidCallback onTap) => InkWell(
          onTap: enabled ? onTap : null,
          customBorder: const CircleBorder(),
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.s8),
            child: Icon(icon, size: 12, color: enabled ? c.textHi : c.textLow),
          ),
        );
    return Container(
      decoration: BoxDecoration(
        color: c.surfaceSunken,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          btn(AppIcons.remove, value > min, () => onChanged(value - 1)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s8),
            child: Text('$value', style: context.text.titleSmall),
          ),
          btn(AppIcons.add, value < max, () => onChanged(value + 1)),
        ],
      ),
    );
  }
}

/// Shared surface-card container — the single source of truth for the "boxed
/// group" look. Per the Figma system: `surface` fill, `r2xl` radius, a soft
/// drop shadow and a very faint hairline (no hard border). Pass
/// `elevated: false` for a flat bordered variant.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.s16),
    this.onTap,
    this.elevated = true,
    this.radius = AppRadius.r2xl,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool elevated;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: c.border.withValues(alpha: elevated ? 0.5 : 1)),
        boxShadow: elevated
            ? [
                BoxShadow(
                  color: const Color(0xFF111111).withValues(alpha: 0.05),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ]
            : null,
      ),
      child: child,
    );
    if (onTap == null) return box;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(radius),
      child: box,
    );
  }
}

/// A titled section divider with an optional trailing action.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action});
  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.s8),
        child: Row(
          children: [
            Expanded(child: Text(title, style: context.text.titleMedium)),
            if (action != null) action!,
          ],
        ),
      );
}

enum BadgeTone { neutral, info, success, warning, danger }

/// Small status pill — coloured text on a tint. Domain code maps its status
/// enum → a [BadgeTone]. Defaults to the Figma treatment: UPPERCASE label.
/// Pass `upper: false` for sentence-ish case.
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = BadgeTone.info, this.upper = true});
  final String label;
  final BadgeTone tone;
  final bool upper;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (Color bg, Color fg) = switch (tone) {
      BadgeTone.neutral => (c.surfaceSunken, c.textMed),
      BadgeTone.info => (c.primaryContainer, c.onPrimaryContainer),
      BadgeTone.success => (c.successContainer, c.success),
      BadgeTone.warning => (c.primaryContainer, c.onPrimaryContainer),
      BadgeTone.danger => (c.errorContainer, c.error),
    };
    final text = label.replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s10, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(
        upper ? text.toUpperCase() : text,
        style: context.text.labelSmall?.copyWith(color: fg, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Read-only star rating with an optional count, e.g. `★★★★☆ (128)`.
class RatingStars extends StatelessWidget {
  const RatingStars({super.key, required this.value, this.count, this.size = 13});
  final double value;
  final int? count;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Icon(
            i <= value.round() ? AppIcons.star : AppIcons.star_border,
            size: size,
            color: c.rating,
          ),
        if (count != null) ...[
          const SizedBox(width: AppSpace.s4),
          Text('($count)', style: context.text.labelSmall?.copyWith(color: c.textLow)),
        ],
      ],
    );
  }
}

/// A single shimmering placeholder block.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({super.key, this.width, this.height = 14, this.radius = AppRadius.sm});
  final double? width;
  final double height;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return FadeTransition(
      opacity: Tween(begin: 0.45, end: 1.0).animate(_ctrl),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: c.skeleton,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}

/// A column of card-shaped skeletons for list-screen loading states.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.rows = 6, this.rowHeight = 72});
  final int rows;
  final double rowHeight;

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.all(AppSpace.s16),
        itemCount: rows,
        separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s12),
        itemBuilder: (_, __) => SkeletonBox(height: rowHeight, radius: AppRadius.lg),
      );
}

/// A live "time until X" pill that ticks every second. Shows [imminentLabel]
/// once the target passes. Used for draw countdowns (§17) and delivery ETAs.
class Countdown extends StatefulWidget {
  const Countdown({
    super.key,
    required this.target,
    this.prefix,
    this.imminentLabel = 'now',
    this.icon,
  });

  final DateTime target;
  final String? prefix;
  final String imminentLabel;
  final IconData? icon;

  @override
  State<Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<Countdown> {
  late final Stream<void> _tick =
      Stream<void>.periodic(const Duration(seconds: 1)).asBroadcastStream();

  String _fmt(Duration d) {
    if (d.isNegative || d.inSeconds <= 0) return widget.imminentLabel;
    final days = d.inDays;
    final h = d.inHours % 24;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    if (days > 0) return '${days}d ${h}h ${m}m';
    if (h > 0) return '${h}h ${m}m ${s}s';
    return '${m}m ${s}s';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return StreamBuilder<void>(
      stream: _tick,
      builder: (context, _) {
        final remaining = widget.target.difference(DateTime.now());
        final imminent = remaining.inSeconds <= 0;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.s10, vertical: AppSpace.s6),
          decoration: BoxDecoration(
            color: imminent ? c.primary : c.surfaceSunken,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, size: 13, color: imminent ? c.onPrimary : c.textMed),
                const SizedBox(width: AppSpace.s6),
              ],
              Text(
                '${widget.prefix == null ? '' : '${widget.prefix} '}${_fmt(remaining)}',
                style: context.text.labelSmall?.copyWith(
                  color: imminent ? c.onPrimary : c.textHi,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// §28 — a compact, embeddable empty state (not a full-screen scaffold; use
/// [CenteredState] for that). Drop it into a list body's `data` branch.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.s32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: c.textLow),
            const SizedBox(height: AppSpace.s12),
            Text(title, textAlign: TextAlign.center, style: context.text.titleSmall),
            if (message != null) ...[
              const SizedBox(height: AppSpace.s4),
              Text(message!,
                  textAlign: TextAlign.center,
                  style: context.text.bodyMedium?.copyWith(color: c.textMed)),
            ],
            if (action != null) ...[const SizedBox(height: AppSpace.s16), action!],
          ],
        ),
      ),
    );
  }
}

/// §28 — classifies an error (offline / maintenance / server / not-found /
/// generic) and renders friendly copy with an optional retry. Embeddable.
class AppErrorView extends StatelessWidget {
  const AppErrorView(this.error, {super.key, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  ({IconData icon, String title, String message}) _classify() {
    final e = error;
    if (e is StallApiException) {
      if (e.isNetwork) {
        return (
          icon: AppIcons.bolt_outlined,
          title: 'You\'re offline',
          message: 'Check your connection and try again.',
        );
      }
      if (e.status == 503 || e.code == 'MAINTENANCE') {
        return (
          icon: AppIcons.hourglass_top,
          title: 'Down for maintenance',
          message: 'We\'ll be back shortly. Please try again soon.',
        );
      }
      if (e.isRateLimited) {
        return (
          icon: AppIcons.hourglass_top,
          title: 'Slow down a moment',
          message: 'Too many attempts — wait a little and retry.',
        );
      }
      if (e.status == 404) {
        return (icon: AppIcons.search_off, title: 'Not found', message: e.message);
      }
      if ((e.status ?? 0) >= 500) {
        return (
          icon: AppIcons.error_outline,
          title: 'Something went wrong',
          message: 'That\'s on us. Please try again.',
        );
      }
      return (icon: AppIcons.error_outline, title: 'Couldn\'t load this', message: e.message);
    }
    return (
      icon: AppIcons.error_outline,
      title: 'Couldn\'t load this',
      message: 'Please try again.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = _classify();
    return EmptyState(
      icon: v.icon,
      title: v.title,
      message: v.message,
      action: onRetry == null
          ? null
          : OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(AppIcons.replay, size: 16),
              label: const Text('Retry'),
            ),
    );
  }
}

/// §28 — a prompt shown when an OS permission (location / camera / notifications)
/// is denied and the feature can't continue without it.
class PermissionRequest extends StatelessWidget {
  const PermissionRequest({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    required this.onGrant,
    this.grantLabel = 'Allow access',
  });

  final IconData icon;
  final String title;
  final String message;
  final VoidCallback onGrant;
  final String grantLabel;

  @override
  Widget build(BuildContext context) => EmptyState(
        icon: icon,
        title: title,
        message: message,
        action: FilledButton(onPressed: onGrant, child: Text(grantLabel)),
      );
}

/// Standard modal bottom sheet chrome: grab handle, rounded top, safe-area
/// padding. Returns whatever `builder`'s result pops with.
Future<T?> showAppSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  bool isScrollControlled = true,
}) {
  final c = context.colors;
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: c.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
    ),
    builder: (context) => SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpace.s8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            Flexible(child: builder(context)),
          ],
        ),
      ),
    ),
  );
}

/// A centered prompt dialog styled after the OS's own permission dialogs —
/// rounded card, icon, title, message, actions stacked as plain full-width
/// text buttons. Spans close to the full width on phones and is capped +
/// centered on tablets/desktop, rather than stretching edge to edge.
///
/// Build one directly for a custom [content] (e.g. a live-updating state),
/// or reach for [confirmDialog] for the common yes/no case.
class AppDialog extends StatelessWidget {
  const AppDialog({
    super.key,
    this.icon,
    this.iconColor,
    required this.title,
    this.message,
    this.content,
    this.actions = const [],
  });

  final IconData? icon;
  final Color? iconColor;
  final String title;
  final String? message;
  final Widget? content;
  final List<Widget> actions;

  static const _maxWidth = 400.0;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Dialog(
      backgroundColor: c.surface,
      insetPadding: EdgeInsets.symmetric(
        horizontal: context.isWide
            ? (MediaQuery.sizeOf(context).width - _maxWidth) / 2
            : AppSpace.s24,
        vertical: AppSpace.s24,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.r3xl),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: _maxWidth),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.s24,
            AppSpace.s32,
            AppSpace.s24,
            AppSpace.s12,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: (iconColor ?? c.primary).withValues(alpha: 0.12),
                  ),
                  child: Icon(icon, size: 24, color: iconColor ?? c.primary),
                ),
                const SizedBox(height: AppSpace.s16),
              ],
              Text(
                title,
                textAlign: TextAlign.center,
                style: context.text.titleMedium,
              ),
              if (message != null) ...[
                const SizedBox(height: AppSpace.s8),
                Text(
                  message!,
                  textAlign: TextAlign.center,
                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                ),
              ],
              if (content != null) ...[
                const SizedBox(height: AppSpace.s16),
                content!,
              ],
              if (actions.isNotEmpty) ...[
                const SizedBox(height: AppSpace.s8),
                for (final a in actions) SizedBox(width: double.infinity, child: a),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// One stacked action row inside an [AppDialog] — plain centered text, no
/// fill or border, matching the OS permission-dialog convention.
class AppDialogAction extends StatelessWidget {
  const AppDialogAction({
    super.key,
    required this.label,
    required this.onPressed,
    this.destructive = false,
    this.emphasized = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool destructive;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return TextButton(
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: AppSpace.s14),
        shape: const RoundedRectangleBorder(),
      ),
      onPressed: onPressed,
      child: Text(
        label,
        style: context.text.titleSmall?.copyWith(
          color: destructive ? c.error : c.primary,
          fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
        ),
      ),
    );
  }
}

/// Shows an [AppDialog] (or any dialog-shaped widget). Thin wrapper over
/// [showDialog] so call sites don't need to remember `useSafeArea`/barrier
/// defaults.
Future<T?> showAppDialog<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  bool barrierDismissible = true,
}) {
  return showDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    builder: builder,
  );
}

/// Yes/no confirmation dialog. Resolves `true` only if the user confirms.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  String? message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
  IconData? icon,
}) async {
  final ok = await showAppDialog<bool>(
    context,
    builder: (context) => AppDialog(
      icon: icon,
      iconColor: destructive ? context.colors.error : null,
      title: title,
      message: message,
      actions: [
        AppDialogAction(
          label: confirmLabel,
          destructive: destructive,
          emphasized: true,
          onPressed: () => Navigator.pop(context, true),
        ),
        AppDialogAction(
          label: cancelLabel,
          onPressed: () => Navigator.pop(context, false),
        ),
      ],
    ),
  );
  return ok ?? false;
}
