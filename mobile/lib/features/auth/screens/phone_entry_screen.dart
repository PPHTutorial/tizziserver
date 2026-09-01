import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auth_util.dart';
import '../otp_flow.dart';

/// Screen 6 — Phone sign-up / login. Sends an OTP then routes to entry.
class PhoneEntryScreen extends ConsumerStatefulWidget {
  const PhoneEntryScreen({super.key});

  @override
  ConsumerState<PhoneEntryScreen> createState() => _PhoneEntryScreenState();
}

class _PhoneEntryScreenState extends ConsumerState<PhoneEntryScreen> {
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

  bool get _valid => _e164.length >= 9;

  Future<void> _submit() async {
    if (!_valid || _busy) return;
    FocusScope.of(context).unfocus();
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
      title: 'What\'s your number?',
      subtitle: 'We\'ll text you a 6-digit code to sign in or create your account.',
      footer: PrimaryButton(
        label: 'Send code',
        loading: _busy,
        onPressed: _valid ? _submit : null,
      ),
      children: [
        AppField(
          label: 'Phone number',
          controller: _controller,
          hintText: '+1 555 000 1234',
          keyboardType: TextInputType.phone,
          autofocus: true,
          textInputAction: TextInputAction.done,
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _submit(),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[\d+ ]')),
          ],
          prefix: const Icon(Icons.smartphone, size: 18),
        ),
        InlineError(_error),
        const SizedBox(height: AppSpace.s16),
        Text(
          'By continuing you agree to the Terms and acknowledge the Privacy Policy.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    );
  }
}
