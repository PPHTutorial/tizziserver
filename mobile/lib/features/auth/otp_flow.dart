import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The OTP request currently in flight, handed from the phone/email screen to
/// the OTP-entry screen.
class OtpChallenge {
  const OtpChallenge({
    this.phone,
    this.email,
    required this.purpose,
    required this.expiresAt,
    this.onVerified,
  });

  final String? phone;
  final String? email;
  final String purpose; // LOGIN | VERIFY_PHONE | VERIFY_EMAIL | RESET_PASSWORD | ...
  final DateTime expiresAt;

  /// When set, the OTP screen calls this with the entered code instead of
  /// running its default login-completing flow — used to verify a contact
  /// method from an already-signed-in screen (e.g. "Add & verify email" in
  /// Edit profile) without disturbing the current session.
  final Future<void> Function(String code)? onVerified;

  String get target => phone ?? email ?? '';
  bool get isSms => phone != null;

  OtpChallenge withExpiry(DateTime at) =>
      OtpChallenge(phone: phone, email: email, purpose: purpose, expiresAt: at, onVerified: onVerified);
}

class OtpFlowController extends Notifier<OtpChallenge?> {
  @override
  OtpChallenge? build() => null;

  void start(OtpChallenge challenge) => state = challenge;
  void bumpExpiry(DateTime at) => state = state?.withExpiry(at);
  void clear() => state = null;
}

final otpFlowProvider =
    NotifierProvider<OtpFlowController, OtpChallenge?>(OtpFlowController.new);
