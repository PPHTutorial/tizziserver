import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The OTP request currently in flight, handed from the phone/email screen to
/// the OTP-entry screen.
class OtpChallenge {
  const OtpChallenge({
    this.phone,
    this.email,
    required this.purpose,
    required this.expiresAt,
  });

  final String? phone;
  final String? email;
  final String purpose; // LOGIN | VERIFY_PHONE | RESET_PASSWORD | ...
  final DateTime expiresAt;

  String get target => phone ?? email ?? '';
  bool get isSms => phone != null;

  OtpChallenge withExpiry(DateTime at) =>
      OtpChallenge(phone: phone, email: email, purpose: purpose, expiresAt: at);
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
