import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auth_util.dart';

/// Shared "set a password" form (screens 11–12). Requires an authenticated
/// session — `POST /api/v1/auth/password`.
class PasswordSetForm extends ConsumerStatefulWidget {
  const PasswordSetForm({super.key, required this.title, required this.subtitle, required this.cta});

  final String title;
  final String subtitle;
  final String cta;

  @override
  ConsumerState<PasswordSetForm> createState() => _PasswordSetFormState();
}

class _PasswordSetFormState extends ConsumerState<PasswordSetForm> {
  final _pw = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _pw.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? get _validationError {
    if (_pw.text.length < 8) return 'Use at least 8 characters.';
    if (_pw.text != _confirm.text) return 'Passwords don\'t match.';
    return null;
  }

  Future<void> _submit() async {
    final v = _validationError;
    if (v != null) {
      setState(() => _error = v);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await runCatching(
      () => ref.read(stallApiProvider).setPassword(_pw.text),
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Password updated.')));
      context.go(RoutePaths.home);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: widget.title,
      subtitle: widget.subtitle,
      footer: PrimaryButton(label: widget.cta, loading: _busy, onPressed: _submit),
      children: [
        AppField(
          label: 'New password',
          hintText: 'At least 8 characters',
          controller: _pw,
          obscureText: true,
          autofocus: true,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.s16),
        AppField(
          label: 'Confirm password',
          hintText: 'Re-enter your password',
          controller: _confirm,
          obscureText: true,
          onChanged: (_) => setState(() {}),
        ),
        if (_pw.text.isNotEmpty) ...[
          const SizedBox(height: AppSpace.s12),
          _PasswordStrengthMeter(password: _pw.text),
        ],
        InlineError(_error),
        const SizedBox(height: AppSpace.s12),
        Text(
          'At least 8 characters. You can still sign in with a one-time code any time.',
          style: context.text.bodyMedium?.copyWith(color: context.colors.textMed),
        ),
      ],
    );
  }
}

int _passwordScore(String pw) {
  var score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (RegExp(r'[A-Z]').hasMatch(pw) && RegExp(r'[a-z]').hasMatch(pw)) score++;
  if (RegExp(r'[0-9]').hasMatch(pw)) score++;
  if (RegExp(r'[^A-Za-z0-9]').hasMatch(pw)) score++;
  return score.clamp(0, 4);
}

/// Live strength feedback as the user types — Figma's `reset-password` frame
/// designs this, but no client-side signal existed before password submit.
class _PasswordStrengthMeter extends StatelessWidget {
  const _PasswordStrengthMeter({required this.password});
  final String password;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final score = _passwordScore(password);
    final (label, color) = switch (score) {
      0 || 1 => ('Weak', c.error),
      2 || 3 => ('Fair', c.primary),
      _ => ('Strong', c.success),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (var i = 0; i < 4; i++)
              Expanded(
                child: Container(
                  height: 4,
                  margin: EdgeInsets.only(right: i == 3 ? 0 : AppSpace.s4),
                  decoration: BoxDecoration(
                    color: i < score ? color : c.border,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpace.s4),
        Text(
          'Password strength: $label',
          style: context.text.labelSmall?.copyWith(color: color),
        ),
      ],
    );
  }
}

/// Screen 12 — Create password (first-time).
class CreatePasswordScreen extends StatelessWidget {
  const CreatePasswordScreen({super.key});

  @override
  Widget build(BuildContext context) => const PasswordSetForm(
        title: 'Create a password',
        subtitle: 'Optional — add a password so you can sign in without a code.',
        cta: 'Save password',
      );
}
