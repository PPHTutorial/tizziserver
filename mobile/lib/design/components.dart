import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import 'context_ext.dart';
import 'icons.dart';
import 'tokens.g.dart';

/// A labelled number tile for KPI rows — three or four sit side by side in a
/// `Row`, each wrapping itself in `Expanded`.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: AppSpace.s16),
        decoration:
            BoxDecoration(color: c.surfaceSunken, borderRadius: BorderRadius.circular(AppRadius.md)),
        child: Column(
          children: [
            Text(value, style: context.text.titleMedium),
            const SizedBox(height: 2),
            Text(label, style: context.text.bodySmall?.copyWith(color: c.textMed)),
          ],
        ),
      ),
    );
  }
}

/// Shared surface-card container: `surface` fill, hairline border, `lg` radius.
/// The single source of truth for the "boxed group" look used across the app.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.s12),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: c.border),
      ),
      child: child,
    );
    if (onTap == null) return box;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.lg),
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

/// Small status pill. Domain code maps its status enum → a [BadgeTone].
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = BadgeTone.info});
  final String label;
  final BadgeTone tone;

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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(
        label.replaceAll('_', ' ').toLowerCase(),
        style: context.text.labelSmall?.copyWith(color: fg),
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

/// Yes/no confirmation dialog. Resolves `true` only if the user confirms.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  String? message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final c = context.colors;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: message == null ? null : Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(cancelLabel)),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: Text(
            confirmLabel,
            style: destructive ? TextStyle(color: c.error) : null,
          ),
        ),
      ],
    ),
  );
  return ok ?? false;
}
