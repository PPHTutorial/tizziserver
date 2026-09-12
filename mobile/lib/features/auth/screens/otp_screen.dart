import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/api_exception.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auth_util.dart';
import '../otp_flow.dart';

/// Screens 8–9 — OTP entry, resend, and the 2FA (TOTP) challenge.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  static const _resendCooldown = 45;

  final _totpController = TextEditingController();
  String _code = '';
  bool _busy = false;
  bool _mfaRequired = false;
  String? _error;
  int _secondsLeft = _resendCooldown;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _totpController.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _secondsLeft = _resendCooldown);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_secondsLeft <= 0) {
        t.cancel();
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  Future<void> _verify(OtpChallenge challenge) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    if (challenge.onVerified != null) {
      String? error;
      try {
        await challenge.onVerified!(_code);
        ref.read(otpFlowProvider.notifier).clear();
      } on StallApiException catch (e) {
        error = friendlyAuthError(e.code, e.message);
      } catch (_) {
        error = 'Something went wrong. Please try again.';
      }
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error;
      });
      if (error == null) Navigator.of(context).pop();
      return;
    }

    String? error;
    var completed = false;
    try {
      final api = ref.read(stallApiProvider);
      final result = await api.verifyOtp(
        phone: challenge.phone,
        email: challenge.email,
        code: _code,
        purpose: challenge.isSms ? 'LOGIN' : 'VERIFY_PHONE',
        totpCode: _mfaRequired ? _totpController.text.trim() : null,
      );
      if (result.mfaRequired) {
        _mfaRequired = true;
      } else {
        await ref.read(authControllerProvider.notifier).completeLogin(result);
        ref.read(otpFlowProvider.notifier).clear();
        completed = true;
      }
    } on StallApiException catch (e) {
      error = friendlyAuthError(e.code, e.message);
    } catch (_) {
      error = 'Something went wrong. Please try again.';
    }

    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (completed) context.go(RoutePaths.home);
  }

  Future<void> _resend(OtpChallenge challenge) async {
    if (_secondsLeft > 0 || _busy) return;
    setState(() => _error = null);
    final err = await runCatching(() async {
      final expiresAt = await ref.read(stallApiProvider).requestOtp(
            phone: challenge.phone,
            email: challenge.email,
            purpose: challenge.purpose,
          );
      ref.read(otpFlowProvider.notifier).bumpExpiry(expiresAt);
    });
    if (!mounted) return;
    if (err != null) {
      setState(() => _error = err);
    } else {
      _startCountdown();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('A new code is on its way.')));
    }
  }

  String _mask(OtpChallenge c) {
    final t = c.target;
    if (c.isSms) {
      return t.length <= 4 ? t : '${t.substring(0, 3)}••••${t.substring(t.length - 2)}';
    }
    final at = t.indexOf('@');
    if (at <= 1) return t;
    return '${t[0]}•••${t.substring(at)}';
  }

  @override
  Widget build(BuildContext context) {
    final challenge = ref.watch(otpFlowProvider);
    if (challenge == null) {
      // Deep-linked without a pending challenge — bounce back.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go(RoutePaths.welcome);
      });
      return const SizedBox.shrink();
    }
    final c = context.colors;

    return AuthScaffold(
      title: _mfaRequired ? 'Two-factor code' : 'Enter your code',
      subtitle: _mfaRequired
          ? 'Open your authenticator app and enter the current 6-digit code.'
          : 'Sent to ${_mask(challenge)}.',
      footer: PrimaryButton(
        label: _mfaRequired ? 'Verify' : 'Continue',
        loading: _busy,
        onPressed: (_mfaRequired
                ? _totpController.text.trim().length >= 6
                : _code.length == 6)
            ? () => _verify(challenge)
            : null,
      ),
      children: [
        if (!_mfaRequired)
          OtpInput(
            onChanged: (v) => setState(() => _code = v),
            onCompleted: (v) {
              _code = v;
              _verify(challenge);
            },
          )
        else
          AppField(
            label: '6-digit code',
            hintText: '000000',
            controller: _totpController,
            keyboardType: TextInputType.number,
            autofocus: true,
            onChanged: (_) => setState(() {}),
          ),
        InlineError(_error),
        const SizedBox(height: AppSpace.s20),
        if (!_mfaRequired)
          Row(
            children: [
              Text('Didn\'t get it? ',
                  style: context.text.bodyMedium?.copyWith(color: c.textMed)),
              GestureDetector(
                onTap: () => _resend(challenge),
                child: Text(
                  _secondsLeft > 0 ? 'Resend in ${_secondsLeft}s' : 'Resend code',
                  style: context.text.bodyMedium?.copyWith(
                    color: _secondsLeft > 0 ? c.textLow : c.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        if (_mfaRequired)
          TextButton(
            onPressed: () => setState(() {
              _mfaRequired = false;
              _error = null;
            }),
            child: const Text('Re-enter the SMS code'),
          ),
      ],
    );
  }
}
