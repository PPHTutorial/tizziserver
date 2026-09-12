import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/countries.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auth_util.dart';
import '../otp_flow.dart';
import '../country_picker.dart';
import '../../../design/icons.dart';

/// Screen 6 — Phone sign-up / login. Sends an OTP then routes to entry.
class PhoneEntryScreen extends ConsumerStatefulWidget {
  const PhoneEntryScreen({super.key});

  @override
  ConsumerState<PhoneEntryScreen> createState() => _PhoneEntryScreenState();
}

class _PhoneEntryScreenState extends ConsumerState<PhoneEntryScreen> {
  final _controller = TextEditingController();
  Country _country = countryByIso2('GH');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pickCountry() async {
    final picked = await showCountryPicker(context, selected: _country);
    if (picked != null && mounted) setState(() => _country = picked);
  }

  String get _e164 {
    final digits = _controller.text.replaceAll(RegExp(r'\D'), '');
    return '+${_country.dialCode}$digits';
  }

  bool get _valid => _controller.text.replaceAll(RegExp(r'\D'), '').length >= 7;

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
    final c = context.colors;
    return AuthScaffold(
      title: 'What\'s your number?',
      subtitle: 'We\'ll text you a 6-digit code to sign in or create your account.',
      footer: PrimaryButton(
        label: 'Send code',
        loading: _busy,
        onPressed: _valid ? _submit : null,
      ),
      children: [
        Text('Phone number', style: context.text.labelMedium?.copyWith(color: c.textMed)),
        const SizedBox(height: AppSpace.s6),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Material(
                color: c.surface,
                borderRadius: BorderRadius.circular(AppRadius.lg),
                child: InkWell(
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  onTap: _pickCountry,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpace.s12),
                    decoration: BoxDecoration(
                      border: Border.all(color: c.border),
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_country.flag, style: const TextStyle(fontSize: 20)),
                        const SizedBox(width: AppSpace.s6),
                        Text('+${_country.dialCode}', style: context.text.bodyLarge),
                        const SizedBox(width: AppSpace.s6),
                        Icon(AppIcons.chevron_down, size: 10, color: c.textMed),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpace.s8),
              Expanded(
                child: TextField(
                  controller: _controller,
                  keyboardType: TextInputType.phone,
                  autofocus: true,
                  textInputAction: TextInputAction.done,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _submit(),
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(
                    hintText: '55 000 1234',
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
                  ),
                ),
              ),
            ],
          ),
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
