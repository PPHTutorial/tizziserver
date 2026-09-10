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

/// Screen 7 — Email sign-in. The backend requires a phone OTP to *complete*
/// sign-in, so email here is used for verification / recovery codes; on success
/// we still route through OTP entry.
class EmailEntryScreen extends ConsumerStatefulWidget {
  const EmailEntryScreen({super.key});

  @override
  ConsumerState<EmailEntryScreen> createState() => _EmailEntryScreenState();
}

class _EmailEntryScreenState extends ConsumerState<EmailEntryScreen> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _valid => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_controller.text.trim());

  Future<void> _submit() async {
    if (!_valid || _busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    final email = _controller.text.trim();
    final err = await runCatching(() async {
      final expiresAt =
          await ref.read(stallApiProvider).requestOtp(email: email, purpose: 'VERIFY_EMAIL');
      ref.read(otpFlowProvider.notifier).start(
            OtpChallenge(email: email, purpose: 'VERIFY_EMAIL', expiresAt: expiresAt),
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
      title: 'Sign in with email',
      subtitle: 'We\'ll email you a verification code.',
      footer: PrimaryButton(
        label: 'Send code',
        loading: _busy,
        onPressed: _valid ? _submit : null,
      ),
      children: [
        AppField(
          label: 'Email address',
          controller: _controller,
          hintText: 'you@example.com',
          keyboardType: TextInputType.emailAddress,
          autofocus: true,
          textInputAction: TextInputAction.done,
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _submit(),
          prefix: const Icon(AppIcons.alternate_email, size: 18),
        ),
        InlineError(_error),
        const SizedBox(height: AppSpace.s16),
        TextButton(
          onPressed: () => context.go(RoutePaths.phone),
          child: const Text('Use my phone number instead'),
        ),
      ],
    );
  }
}
