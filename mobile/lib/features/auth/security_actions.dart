import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../app/providers.dart';
import '../../design/context_ext.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';
import '../trust/trust_providers.dart';

/// Shared account-security actions (§24, screens 428–429). Used from the account
/// tab and the Security Centre so the flows stay identical everywhere.

Future<void> setTransactionPin(BuildContext context, WidgetRef ref) async {
  final controller = TextEditingController();
  final currentController = TextEditingController();
  // Replacing an existing PIN needs the current one (server-enforced, so a
  // stolen session can't silently reset it). Unknown status → ask anyway.
  final hasPin = ref.read(securityCentreProvider).valueOrNull?.pinSet ?? true;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(hasPin ? 'Change transaction PIN' : 'Set transaction PIN'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasPin) ...[
            AppField(
              label: 'Current PIN',
              hintText: 'Leave empty if you never set one',
              controller: currentController,
              keyboardType: TextInputType.number,
              obscureText: true,
            ),
            const SizedBox(height: AppSpace.s12),
          ],
          AppField(
            label: 'New PIN',
            hintText: '4–6 digits',
            controller: controller,
            keyboardType: TextInputType.number,
            obscureText: true,
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
      ],
    ),
  );
  if (ok != true) return;
  try {
    final current = currentController.text.trim();
    await ref
        .read(stallApiProvider)
        .setPin(controller.text.trim(), currentPin: current.isEmpty ? null : current);
    ref.invalidate(securityCentreProvider);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('PIN saved.')));
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is StallApiException ? e.message : 'Couldn\'t set PIN.')),
      );
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
            AppField(label: 'Code', hintText: '6-digit code', controller: codeController, keyboardType: TextInputType.number),
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
