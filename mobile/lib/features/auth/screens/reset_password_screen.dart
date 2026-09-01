import 'package:flutter/material.dart';

import 'create_password_screen.dart';

/// Screen 11 — Reset password. Reached once the user is signed in via a
/// one-time code; reuses the shared password form.
class ResetPasswordScreen extends StatelessWidget {
  const ResetPasswordScreen({super.key});

  @override
  Widget build(BuildContext context) => const PasswordSetForm(
        title: 'Set a new password',
        subtitle: 'Choose a new password for your account.',
        cta: 'Update password',
      );
}
