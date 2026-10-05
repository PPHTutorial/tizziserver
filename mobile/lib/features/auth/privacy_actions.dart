import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_exception.dart';
import '../../app/providers.dart';

/// Server-side deletion state for the signed-in user —
/// `GET /me/account/deletion` (`status` is `none` when nothing is pending).
final accountDeletionProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref.watch(stallApiProvider).accountDeletionStatus(),
);

bool isDeletionPending(Map<String, dynamic>? s) =>
    s != null && (s['status'] == 'GRACE_PERIOD' || s['status'] == 'REQUESTED');

/// Public legal pages served by the API host (`apps/api/app/legal/*`).
Future<void> openLegalPage(WidgetRef ref, String page) async {
  final base = ref.read(apiConfigProvider).baseUrl;
  await launchUrl(Uri.parse('$base/legal/$page'), mode: LaunchMode.externalApplication);
}

void _toast(BuildContext context, String msg) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

String _message(Object e, String fallback) =>
    e is StallApiException ? e.message : fallback;

/// "Download my data" — fetches the JSON export and hands it to the share
/// sheet so the user can save or send it (store requirement + Act 843 access
/// right).
Future<void> downloadMyData(BuildContext context, WidgetRef ref) async {
  _toast(context, 'Preparing your data…');
  try {
    final data = await ref.read(stallApiProvider).exportMyData();
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/my-stall-data.json');
    await file.writeAsString(const JsonEncoder.withIndent('  ').convert(data));
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path)], subject: 'My Stall data'),
    );
  } catch (e) {
    if (context.mounted) _toast(context, _message(e, 'Couldn\'t export your data.'));
  }
}

/// In-app account deletion (Play + App Store requirement). Schedules deletion
/// after the server's grace period; tapping again while pending offers to
/// cancel it.
Future<void> manageAccountDeletion(
  BuildContext context,
  WidgetRef ref,
  Map<String, dynamic>? status,
) async {
  final api = ref.read(stallApiProvider);
  if (isDeletionPending(status)) {
    final purge = DateTime.tryParse('${status!['purgeAfter']}')?.toLocal();
    final cancel = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deletion scheduled'),
        content: Text(
          'Your account will be permanently deleted'
          '${purge == null ? '' : ' after ${MaterialLocalizations.of(ctx).formatMediumDate(purge)}'}. '
          'Do you want to keep your account instead?',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Close')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Keep my account')),
        ],
      ),
    );
    if (cancel != true) return;
    try {
      await api.cancelAccountDeletion();
      if (context.mounted) _toast(context, 'Deletion cancelled.');
    } catch (e) {
      if (context.mounted) _toast(context, _message(e, 'Couldn\'t cancel deletion.'));
    }
    ref.invalidate(accountDeletionProvider);
    return;
  }

  final confirm = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Delete your account?'),
      content: const Text(
        'Your profile, addresses, saved items and sign-in details will be permanently deleted after a short '
        'grace period, during which you can cancel from this screen. Records we must keep by law '
        '(like completed transactions) are retained in anonymised form. Open orders must be finished or '
        'cancelled first.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Delete account'),
        ),
      ],
    ),
  );
  if (confirm != true) return;
  try {
    await api.requestAccountDeletion();
    if (context.mounted) {
      _toast(context, 'Account deletion scheduled. You can cancel it from Settings.');
    }
  } catch (e) {
    if (context.mounted) _toast(context, _message(e, 'Couldn\'t schedule deletion.'));
  }
  ref.invalidate(accountDeletionProvider);
}
