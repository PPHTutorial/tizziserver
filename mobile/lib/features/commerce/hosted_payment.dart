import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_exception.dart';
import '../../app/providers.dart';
import 'commerce_providers.dart';

/// Finish a hosted-checkout payment (Paystack card / mobile money): open the
/// provider's page in the browser, then — once the customer says they're done
/// — verify with the server. The webhook settles it too, so even if the user
/// never comes back the wallet is credited; this just makes it immediate.
Future<void> completeHostedPayment(
  BuildContext context,
  WidgetRef ref,
  String intentId,
  String authorizationUrl,
) async {
  final opened = await launchUrl(Uri.parse(authorizationUrl), mode: LaunchMode.externalApplication);
  if (!opened) {
    if (context.mounted) _toast(context, 'Couldn\'t open the payment page.');
    return;
  }
  if (!context.mounted) return;

  final done = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      title: const Text('Finish paying'),
      content: const Text(
        'Complete the payment in your browser, then come back here. '
        'Mobile-money approvals can take a few seconds.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('I\'ve paid')),
      ],
    ),
  );
  if (done != true) {
    if (context.mounted) _toast(context, 'Your wallet updates automatically once the payment clears.');
    return;
  }

  final api = ref.read(stallApiProvider);
  var status = 'REQUIRES_ACTION';
  // MoMo approvals land a little after the customer returns — poll briefly.
  for (var attempt = 0; attempt < 5; attempt++) {
    try {
      status = await api.confirmPayment(intentId);
    } on StallApiException catch (e) {
      if (context.mounted) _toast(context, e.message);
      return;
    }
    if (status == 'SUCCEEDED' || status == 'FAILED') break;
    await Future<void>.delayed(const Duration(seconds: 3));
  }
  ref.invalidate(walletProvider);
  ref.invalidate(walletTxnsProvider);
  if (!context.mounted) return;
  _toast(
    context,
    switch (status) {
      'SUCCEEDED' => 'Payment received — your wallet has been topped up.',
      'FAILED' => 'The payment didn\'t go through. Nothing was charged.',
      _ => 'Still waiting for the payment to clear — your wallet updates automatically.',
    },
  );
}

void _toast(BuildContext context, String msg) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
