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
          controller: _pw,
          obscureText: true,
          autofocus: true,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.s16),
        AppField(
          label: 'Confirm password',
          controller: _confirm,
          obscureText: true,
          onChanged: (_) => setState(() {}),
        ),
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
