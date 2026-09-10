import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auth_util.dart';
import '../otp_flow.dart';
import '../../../design/icons.dart';

/// Screen 10 — Forgot password. For phone accounts this is just "sign in with a
/// code", after which the user can set a new password from Security.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _e164 {
    final raw = _controller.text.trim().replaceAll(RegExp(r'[^\d+]'), '');
    return raw.startsWith('+') ? raw : '+$raw';
  }

  Future<void> _submit() async {
    if (_e164.length < 9 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final phone = _e164;
    final err = await runCatching(() async {
      final expiresAt = await ref.read(stallApiProvider).requestOtp(phone: phone);
      ref.read(otpFlowProvider.notifier).start(
            OtpChallenge(phone: phone, purpose: 'LOGIN', expiresAt: expiresAt),
          );
    });
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) context.push(RoutePaths.otp);
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Reset your password',
      subtitle:
          'Enter your phone number. We\'ll send a code to sign you in — then you can set a new password under Security.',
      footer: PrimaryButton(label: 'Send code', loading: _busy, onPressed: _submit),
      children: [
        AppField(
          label: 'Phone number',
          controller: _controller,
          hintText: '+1 555 000 1234',
          keyboardType: TextInputType.phone,
          autofocus: true,
          onChanged: (_) => setState(() {}),
          prefix: const Icon(AppIcons.smartphone, size: 18),
        ),
        InlineError(_error),
        const SizedBox(height: AppSpace.s16),
        TextButton(
          onPressed: () => context.push(RoutePaths.recovery),
          child: const Text('I no longer have this number'),
        ),
      ],
    );
  }
}
