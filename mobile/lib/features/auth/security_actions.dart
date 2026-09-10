import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../design/context_ext.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';

/// Shared account-security actions (§24, screens 428–429). Used from the account
/// tab and the Security Centre so the flows stay identical everywhere.

Future<void> setTransactionPin(BuildContext context, WidgetRef ref) async {
  final controller = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Set transaction PIN'),
      content: AppField(
        label: '4–6 digits',
        controller: controller,
        keyboardType: TextInputType.number,
        obscureText: true,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await ref.read(stallApiProvider).setPin(controller.text.trim());
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('PIN set.')));
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Couldn\'t set PIN.')));
    }
  }
}

Future<void> enrollTwoFactor(BuildContext context, WidgetRef ref) async {
  try {
    final enroll = await ref.read(stallApiProvider).enroll2fa();
    if (!context.mounted) return;
    final codeController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Enable two-factor'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add this secret to your authenticator app, then enter the code:'),
            const SizedBox(height: AppSpace.s8),
            SelectableText(enroll.secret, style: context.text.titleSmall),
            const SizedBox(height: AppSpace.s12),
            AppField(label: 'Code', controller: codeController, keyboardType: TextInputType.number),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirm')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final recovery = await ref.read(stallApiProvider).confirm2fa(codeController.text.trim());
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Two-factor enabled'),
        content: Text('Save these recovery codes somewhere safe:\n\n${recovery.join('\n')}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
        ],
      ),
    );
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Couldn\'t start 2FA enrolment.')));
    }
  }
}
