import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'context_ext.dart';
import 'tokens.g.dart';
import 'icons.dart';

/// Standard auth-flow page chrome: back button, optional title/subtitle, a
/// scrollable body, and a bottom-pinned action area.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    this.title,
    this.subtitle,
    required this.children,
    this.footer,
    this.showBack = true,
    this.onBack,
  });

  final String? title;
  final String? subtitle;
  final List<Widget> children;
  final Widget? footer;
  final bool showBack;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (showBack)
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpace.s16, AppSpace.s8, AppSpace.s16, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Material(
                    color: c.surface,
                    shape: const CircleBorder(),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: onBack ?? () => Navigator.of(context).maybePop(),
                      child: SizedBox(
                        width: 40,
                        height: 40,
                        child: Icon(AppIcons.chevron_left, size: 16, color: c.textHi),
                      ),
                    ),
                  ),
                ),
              ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                    AppSpace.s24, AppSpace.s16, AppSpace.s24, AppSpace.s24),
                children: [
                  if (title != null)
                    Text(title!, style: context.text.displayLarge?.copyWith(fontSize: 28)),
                  if (subtitle != null) ...[
                    const SizedBox(height: AppSpace.s8),
                    Text(subtitle!,
                        style: context.text.bodyLarge?.copyWith(color: c.textMed)),
                  ],
                  if (title != null) const SizedBox(height: AppSpace.s24),
                  ...children,
                ],
              ),
            ),
            if (footer != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    AppSpace.s24, AppSpace.s8, AppSpace.s24, AppSpace.s16),
                child: footer,
              ),
          ],
        ),
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: AppSpace.s8)],
                Text(label),
              ],
            ),
    );
  }
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({super.key, required this.label, required this.onPressed, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        side: BorderSide(color: c.border),
        foregroundColor: c.textHi,
        shape: const StadiumBorder(),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: AppSpace.s8)],
          Text(label),
        ],
      ),
    );
  }
}

/// Shared chrome for [AppField] and [AppSelect] (and anything else that wants
/// to look like a filled, rounded form field) — the single source of truth
/// for the decoration so the two widgets can never visually drift apart.
InputDecoration appFieldDecoration(
  BuildContext context, {
  String? hintText,
  Widget? prefixIcon,
  Widget? suffixIcon,
}) {
  final c = context.colors;
  return InputDecoration(
    hintText: hintText,
    prefixIcon: prefixIcon,
    suffixIcon: suffixIcon,
    filled: true,
    fillColor: c.surface,
    contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpace.s16, vertical: AppSpace.s16),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      borderSide: BorderSide(color: c.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      borderSide: BorderSide(color: c.primary, width: 1.5),
    ),
  );
}

class AppField extends StatelessWidget {
  const AppField({
    super.key,
    required this.label,
    this.controller,
    this.hintText,
    this.keyboardType,
    this.obscureText = false,
    this.prefix,
    this.onChanged,
    this.autofocus = false,
    this.textInputAction,
    this.onSubmitted,
    this.inputFormatters,
    this.maxLines = 1,
  });

  final String label;
  final TextEditingController? controller;
  final String? hintText;
  final TextInputType? keyboardType;
  final bool obscureText;
  final Widget? prefix;
  final ValueChanged<String>? onChanged;
  final bool autofocus;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final List<TextInputFormatter>? inputFormatters;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: context.text.labelMedium?.copyWith(color: c.textMed)),
        const SizedBox(height: AppSpace.s6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          autofocus: autofocus,
          textInputAction: textInputAction,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          inputFormatters: inputFormatters,
          maxLines: obscureText ? 1 : maxLines,
          minLines: maxLines > 1 ? 3 : null,
          decoration: appFieldDecoration(context, hintText: hintText, prefixIcon: prefix),
        ),
      ],
    );
  }
}

/// Fixed-length numeric code entry (OTP / 2FA).
class OtpInput extends StatefulWidget {
  const OtpInput({
    super.key,
    this.length = 6,
    required this.onCompleted,
    this.onChanged,
  });

  final int length;
  final ValueChanged<String> onCompleted;
  final ValueChanged<String>? onChanged;

  @override
  State<OtpInput> createState() => _OtpInputState();
}

class _OtpInputState extends State<OtpInput> {
  late final TextEditingController _controller = TextEditingController();
  late final FocusNode _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: () => _focus.requestFocus(),
      child: Stack(
        children: [
          Opacity(
            opacity: 0,
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: widget.length,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (v) {
                setState(() {});
                widget.onChanged?.call(v);
                if (v.length == widget.length) widget.onCompleted(v);
              },
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(widget.length, (i) {
              final filled = i < _controller.text.length;
              final active = i == _controller.text.length;
              return Container(
                width: 46,
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  border: Border.all(
                    color: active ? c.primary : c.border,
                    width: active ? 1.5 : 1,
                  ),
                ),
                child: Text(
                  filled ? _controller.text[i] : '',
                  style: context.text.titleLarge,
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

class InlineError extends StatelessWidget {
  const InlineError(this.message, {super.key});
  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null || message!.isEmpty) return const SizedBox.shrink();
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.s12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(AppIcons.error_outline, size: 16, color: c.error),
          const SizedBox(width: AppSpace.s6),
          Expanded(
            child: Text(message!,
                style: context.text.bodyMedium?.copyWith(color: c.error)),
          ),
        ],
      ),
    );
  }
}

/// Full-screen centred state (loading / error / blocked).
class CenteredState extends StatelessWidget {
  const CenteredState({
    super.key,
    required this.icon,
    required this.title,
    this.body,
    this.action,
    this.tone = StateTone.neutral,
  });

  const CenteredState.error({
    Key? key,
    required String title,
    String? body,
    Widget? action,
  }) : this(
          key: key,
          icon: AppIcons.error_outline,
          title: title,
          body: body,
          action: action,
          tone: StateTone.error,
        );

  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;
  final StateTone tone;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final accent = switch (tone) {
      StateTone.error => c.error,
      StateTone.neutral => c.primary,
    };
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.s32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: accent, size: 32),
                ),
                const SizedBox(height: AppSpace.s20),
                Text(title,
                    textAlign: TextAlign.center, style: context.text.titleLarge),
                if (body != null) ...[
                  const SizedBox(height: AppSpace.s8),
                  Text(body!,
                      textAlign: TextAlign.center,
                      style: context.text.bodyLarge?.copyWith(color: c.textMed)),
                ],
                if (action != null) ...[
                  const SizedBox(height: AppSpace.s24),
                  action!,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A live "ends in Xh Ym" (or "Xh Ym Zs" with [showSeconds]) countdown,
/// re-ticking on its own until [until] passes, then rendering nothing.
class CountdownText extends StatefulWidget {
  const CountdownText({
    super.key,
    required this.until,
    this.showSeconds = false,
    this.style,
    this.prefix = 'ends in ',
  });

  final DateTime until;
  final bool showSeconds;
  final TextStyle? style;
  final String prefix;

  @override
  State<CountdownText> createState() => _CountdownTextState();
}

class _CountdownTextState extends State<CountdownText> {
  late Duration _left = widget.until.difference(DateTime.now());

  @override
  void initState() {
    super.initState();
    _tick();
  }

  void _tick() {
    if (!mounted) return;
    setState(() => _left = widget.until.difference(DateTime.now()));
    if (_left > Duration.zero) {
      Future.delayed(
        Duration(seconds: widget.showSeconds ? 1 : 30),
        _tick,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_left <= Duration.zero) return const SizedBox.shrink();
    final h = _left.inHours;
    final m = _left.inMinutes % 60;
    final label = widget.showSeconds
        ? '${widget.prefix}${h}h ${m}m ${_left.inSeconds % 60}s'
        : '${widget.prefix}${h}h ${m}m';
    return Text(
      label,
      style:
          widget.style ??
          context.text.labelSmall?.copyWith(color: context.colors.error),
    );
  }
}

enum StateTone { neutral, error }

/// Map a [StallApiException]-style code to friendly copy.
String friendlyAuthError(String code, String fallback) => switch (code) {
      'INVALID_OTP' => 'That code is incorrect. Check it and try again.',
      'OTP_EXPIRED' => 'That code has expired. Request a new one.',
      'OTP_COOLDOWN' => 'Please wait a moment before requesting another code.',
      'OTP_LOCKED' => 'Too many attempts. Try again later.',
      'RATE_LIMITED' => 'Too many attempts. Please wait and try again.',
      'FEATURE_DISABLED' => 'That is not available on this app.',
      'ROLE_NOT_ACTIVE' => 'That role is not active on your account yet.',
      'NETWORK' => 'No connection. Check your network and try again.',
      _ => fallback,
    };
