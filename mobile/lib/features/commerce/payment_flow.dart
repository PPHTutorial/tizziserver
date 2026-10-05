import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_exception.dart';
import '../../api/catalog_models.dart' show formatMoney;
import '../../api/commerce_models.dart';
import '../../app/providers.dart';
import '../../design/components.dart';
import '../../design/context_ext.dart';
import '../../design/icons.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';
import 'commerce_providers.dart';

/// Wallet top-up through the payment gateway (Flutterwave).
///
/// Card goes to Flutterwave's hosted page, opened in an in-app browser tab
/// (Custom Tabs / SFSafariViewController), so card numbers never pass through
/// the app. Every other method is charged by the server over Flutterwave's
/// API from these screens: the customer approves a MoMo prompt, enters an OTP,
/// transfers to a one-time account, or finishes Apple Pay / Google Pay / OPay
/// on the provider page. The app never decides a payment succeeded — it polls
/// the server, which only settles after verifying with Flutterwave (the
/// webhook and a worker sweep settle it too, even if the app is closed).
Future<void> showTopUpSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
    ),
    builder: (_) => _TopUpSheet(hostContext: context),
  );
}

const _methodLabels = {
  'mobile_money': 'Mobile money',
  'card': 'Card',
  'bank_transfer': 'Bank transfer',
  'bank_account': 'Bank account',
  'opay': 'OPay',
  'apple_pay': 'Apple Pay',
  'google_pay': 'Google Pay',
};

const _methodIcons = {
  'mobile_money': AppIcons.smartphone,
  'card': AppIcons.credit_card,
  'bank_transfer': AppIcons.account_balance,
  'bank_account': AppIcons.account_balance,
  'opay': AppIcons.account_balance_wallet_outlined,
  'apple_pay': AppIcons.apple,
  'google_pay': AppIcons.g_mobiledata,
};

/// Ghana networks: label shown → value Flutterwave expects.
const _ghNetworks = [('MTN', 'MTN'), ('Telecel', 'VODAFONE'), ('AirtelTigo', 'TIGO')];

class _TopUpSheet extends ConsumerStatefulWidget {
  const _TopUpSheet({required this.hostContext});
  final BuildContext hostContext;

  @override
  ConsumerState<_TopUpSheet> createState() => _TopUpSheetState();
}

class _TopUpSheetState extends ConsumerState<_TopUpSheet> {
  final _amount = TextEditingController();
  final _phone = TextEditingController();
  final _bankCode = TextEditingController();
  final _account = TextEditingController();
  List<String>? _methods;
  String _currency = 'GHS';
  String? _method;
  String _network = 'MTN';
  bool _busy = false;
  String? _error;

  // One key per distinct payment request: a retry of the same request (lost
  // response, double tap) reuses it so the server never charges twice.
  String? _idemKey;
  String? _idemFor;

  @override
  void initState() {
    super.initState();
    final phone = ref.read(authControllerProvider).user?.phone;
    if (phone != null) _phone.text = phone;
    _loadMethods();
  }

  Future<void> _loadMethods() async {
    try {
      final r = await ref.read(stallApiProvider).paymentMethodsAvailable();
      if (!mounted) return;
      // Platform/OS-specific wallets only where they can work.
      final platform = Theme.of(context).platform;
      final methods = r.methods.where((m) {
        if (m == 'apple_pay') return platform == TargetPlatform.iOS;
        if (m == 'google_pay') return platform == TargetPlatform.android;
        return true;
      }).toList()
        ..sort((a, b) => _order(a).compareTo(_order(b)));
      setState(() {
        _methods = methods;
        _currency = r.currency;
        _method = methods.isEmpty ? null : methods.first;
      });
    } on StallApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  int _order(String m) {
    final i = _methodLabels.keys.toList().indexOf(m);
    return i < 0 ? 99 : i;
  }

  @override
  void dispose() {
    _amount.dispose();
    _phone.dispose();
    _bankCode.dispose();
    _account.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    final major = double.tryParse(_amount.text.trim());
    if (major == null || major <= 0) return setState(() => _error = 'Enter a valid amount');
    final minor = (major * 100).round();
    if (minor < 100) return setState(() => _error = 'The minimum top-up is ${formatMoney(100, _currency)}');
    final method = _method;
    if (method == null) return;

    final details = <String, String>{};
    if (method == 'mobile_money') {
      final phone = _phone.text.trim();
      if (phone.replaceAll(RegExp(r'\D'), '').length < 9) {
        return setState(() => _error = 'Enter your mobile money number');
      }
      details['phone'] = phone;
      if (_currency == 'GHS') details['network'] = _network;
    } else if (method == 'bank_account') {
      if (_bankCode.text.trim().isEmpty || _account.text.trim().length != 10) {
        return setState(() => _error = 'Enter your bank code and 10-digit account number');
      }
      details['bankCode'] = _bankCode.text.trim();
      details['accountNumber'] = _account.text.trim();
    }

    final fingerprint = '$minor|$method|${details.entries.map((e) => '${e.key}=${e.value}').join('&')}';
    if (_idemFor != fingerprint) {
      _idemFor = fingerprint;
      _idemKey = _newKey();
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final intent = await ref.read(stallApiProvider).walletTopUp(
            minor,
            idempotencyKey: _idemKey!,
            method: method,
            details: details,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      final host = widget.hostContext;
      if (!host.mounted) return;
      if (intent.succeeded) {
        ref.invalidate(walletProvider);
        ref.invalidate(walletTxnsProvider);
        _toast(host, 'Your wallet has been topped up.');
        return;
      }
      if (intent.failed) {
        _toast(host, 'The payment didn\'t go through. Nothing was charged.');
        return;
      }
      await Navigator.of(host).push(
        MaterialPageRoute<void>(
          builder: (_) => PaymentProgressScreen(
            initial: intent,
            amountMinor: minor,
            currency: _currency,
            method: method,
          ),
        ),
      );
    } on StallApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final methods = _methods;
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpace.s16,
        right: AppSpace.s16,
        top: AppSpace.s16,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpace.s16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Top up wallet', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s12),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(prefixText: '$_currency ', hintText: '0.00'),
            ),
            const SizedBox(height: AppSpace.s16),
            Text('Pay with', style: context.text.labelLarge),
            const SizedBox(height: AppSpace.s8),
            if (methods == null && _error == null)
              const Padding(
                padding: EdgeInsets.all(AppSpace.s12),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (methods != null)
              Wrap(
                spacing: AppSpace.s8,
                runSpacing: AppSpace.s8,
                children: [
                  for (final m in methods)
                    AppChip(
                      _methodLabels[m] ?? m,
                      selected: _method == m,
                      onTap: () => setState(() {
                        _method = m;
                        _error = null;
                      }),
                    ),
                ],
              ),
            if (_method == 'mobile_money') ...[
              const SizedBox(height: AppSpace.s12),
              if (_currency == 'GHS')
                Wrap(
                  spacing: AppSpace.s8,
                  children: [
                    for (final (label, value) in _ghNetworks)
                      AppChip(label, selected: _network == value, onTap: () => setState(() => _network = value)),
                  ],
                ),
              const SizedBox(height: AppSpace.s12),
              AppField(
                label: 'Mobile money number',
                controller: _phone,
                keyboardType: TextInputType.phone,
                hintText: '024 123 4567',
              ),
            ],
            if (_method == 'bank_account') ...[
              const SizedBox(height: AppSpace.s12),
              AppField(label: 'Bank code', controller: _bankCode, keyboardType: TextInputType.number, hintText: 'e.g. 044'),
              const SizedBox(height: AppSpace.s12),
              AppField(
                label: 'Account number',
                controller: _account,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
              ),
            ],
            if (_method != null) ...[
              const SizedBox(height: AppSpace.s8),
              Text(
                _hint(_method!),
                style: context.text.bodySmall?.copyWith(color: context.colors.textMed),
              ),
            ],
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: InlineError(_error!)),
            const SizedBox(height: AppSpace.s16),
            PrimaryButton(
              label: 'Pay',
              icon: _method == null ? null : _methodIcons[_method],
              loading: _busy,
              onPressed: _busy || _method == null ? null : _pay,
            ),
          ],
        ),
      ),
    );
  }

  String _hint(String method) => switch (method) {
        'mobile_money' => 'You\'ll get a prompt on your phone to approve the payment.',
        'card' => 'You\'ll enter your card on Flutterwave\'s secure page. Your card details never touch Stall.',
        'bank_transfer' => 'We\'ll give you a one-time account number to transfer to.',
        'bank_account' => 'Your bank will send you a code to approve the debit.',
        'apple_pay' || 'google_pay' || 'opay' => 'You\'ll confirm the payment on the secure payment page.',
        _ => '',
      };
}

/// Follows a pending payment to the end: shows what the customer has to do
/// (approve on phone / enter OTP / transfer / finish on the provider page)
/// and polls the server until it reports SUCCEEDED or FAILED.
class PaymentProgressScreen extends ConsumerStatefulWidget {
  const PaymentProgressScreen({
    super.key,
    required this.initial,
    required this.amountMinor,
    required this.currency,
    required this.method,
  });

  final PaymentIntentView initial;
  final int amountMinor;
  final String currency;
  final String method;

  @override
  ConsumerState<PaymentProgressScreen> createState() => _PaymentProgressScreenState();
}

class _PaymentProgressScreenState extends ConsumerState<PaymentProgressScreen> with WidgetsBindingObserver {
  static const _pollEvery = Duration(seconds: 4);
  static const _giveUpAfter = Duration(minutes: 15);

  late PaymentIntentView _intent = widget.initial;
  Timer? _timer;
  bool _checking = false;
  bool _submittingOtp = false;
  String? _otpError;
  final _started = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(_pollEvery, (_) => _poll());
    if (_intent.actionType == 'redirect') {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openRedirect());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back from the browser tab / MoMo prompt: check straight away.
    if (state == AppLifecycleState.resumed) _poll();
  }

  Future<void> _openRedirect() async {
    final url = _intent.nextAction?['url'] as String?;
    if (url == null) return;
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.inAppBrowserView);
    if (!ok && mounted) _toast(context, 'Couldn\'t open the payment page.');
  }

  Future<void> _poll() async {
    if (_checking || !_intent.pending || !mounted) return;
    if (DateTime.now().difference(_started) > _giveUpAfter) {
      _timer?.cancel();
      return;
    }
    _checking = true;
    try {
      final next = await ref.read(stallApiProvider).confirmPayment(_intent.id);
      if (!mounted) return;
      setState(() => _intent = next);
      if (!next.pending) {
        _timer?.cancel();
        ref.invalidate(walletProvider);
        ref.invalidate(walletTxnsProvider);
      }
    } on StallApiException {
      // Transient — the next tick retries; the server settles it regardless.
    } finally {
      _checking = false;
    }
  }

  Future<void> _submitOtp(String otp) async {
    setState(() {
      _submittingOtp = true;
      _otpError = null;
    });
    try {
      final next = await ref.read(stallApiProvider).submitPaymentOtp(_intent.id, otp);
      if (mounted) setState(() => _intent = next);
    } on StallApiException catch (e) {
      if (mounted) setState(() => _otpError = e.message);
    } finally {
      if (mounted) setState(() => _submittingOtp = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final amount = formatMoney(widget.amountMinor, widget.currency);
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(_methodLabels[widget.method] ?? 'Payment'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpace.s16),
                child: _body(context, amount),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, String amount) {
    if (_intent.succeeded) {
      return _Result(
        icon: AppIcons.check_circle,
        tone: context.colors.success,
        title: 'Payment received',
        body: '$amount has been added to your wallet.',
        action: PrimaryButton(label: 'Done', onPressed: () => Navigator.of(context).pop()),
      );
    }
    if (_intent.failed) {
      return _Result(
        icon: AppIcons.error_outline,
        tone: context.colors.error,
        title: 'Payment didn\'t go through',
        body: _failureCopy(_intent.failureReason),
        action: PrimaryButton(label: 'Close', onPressed: () => Navigator.of(context).pop()),
      );
    }

    final timedOut = DateTime.now().difference(_started) > _giveUpAfter;
    final a = _intent.nextAction ?? const <String, dynamic>{};
    final children = <Widget>[
      Text(amount, textAlign: TextAlign.center, style: context.text.headlineMedium),
      const SizedBox(height: AppSpace.s16),
    ];

    switch (_intent.actionType) {
      case 'otp':
        children.addAll([
          Text(
            (a['message'] as String?) ?? 'Enter the code sent to your phone',
            textAlign: TextAlign.center,
            style: context.text.bodyLarge,
          ),
          const SizedBox(height: AppSpace.s16),
          OtpInput(onCompleted: _submittingOtp ? (_) {} : _submitOtp),
          if (_submittingOtp) const Padding(padding: EdgeInsets.all(AppSpace.s12), child: Center(child: CircularProgressIndicator())),
          if (_otpError != null) Padding(padding: const EdgeInsets.only(top: 8), child: InlineError(_otpError!)),
        ]);
      case 'bank_transfer':
        final expires = DateTime.tryParse((a['expiresAt'] as String?) ?? '');
        children.addAll([
          Text('Transfer exactly this amount to:', textAlign: TextAlign.center, style: context.text.bodyLarge),
          const SizedBox(height: AppSpace.s12),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _CopyRow(label: 'Bank', value: (a['bankName'] as String?) ?? ''),
                _CopyRow(label: 'Account number', value: (a['accountNumber'] as String?) ?? ''),
                _CopyRow(label: 'Amount', value: formatMoney((a['amountMinor'] as num?)?.toInt() ?? widget.amountMinor, widget.currency)),
                if (a['note'] != null) _CopyRow(label: 'Note', value: a['note'] as String, copyable: false),
              ],
            ),
          ),
          if (expires != null) ...[
            const SizedBox(height: AppSpace.s8),
            Text(
              'This account expires at ${TimeOfDay.fromDateTime(expires.toLocal()).format(context)}.',
              textAlign: TextAlign.center,
              style: context.text.bodySmall,
            ),
          ],
          const SizedBox(height: AppSpace.s16),
          const _Waiting('Waiting for your transfer…'),
        ]);
      case 'redirect':
        children.addAll([
          Text('Finish the payment on the secure payment page.', textAlign: TextAlign.center, style: context.text.bodyLarge),
          const SizedBox(height: AppSpace.s16),
          SecondaryButton(label: 'Open payment page', onPressed: _openRedirect),
          const SizedBox(height: AppSpace.s16),
          const _Waiting('Waiting for confirmation…'),
        ]);
      default:
        children.addAll([
          Text(
            (a['message'] as String?) ?? 'Approve the payment prompt on your phone.',
            textAlign: TextAlign.center,
            style: context.text.bodyLarge,
          ),
          const SizedBox(height: AppSpace.s8),
          Text(
            'If no prompt appears, dial your network\'s MoMo menu and check pending approvals.',
            textAlign: TextAlign.center,
            style: context.text.bodySmall?.copyWith(color: context.colors.textMed),
          ),
          const SizedBox(height: AppSpace.s16),
          const _Waiting('Waiting for your approval…'),
        ]);
    }

    if (timedOut) {
      children.addAll([
        const SizedBox(height: AppSpace.s16),
        Text(
          'This is taking longer than usual. If you paid, your wallet will update automatically — you can leave this screen.',
          textAlign: TextAlign.center,
          style: context.text.bodyMedium,
        ),
      ]);
    }
    children.addAll([
      const SizedBox(height: AppSpace.s24),
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Close — I\'ll check my wallet later'),
      ),
    ]);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
  }

  String _failureCopy(String? reason) => switch (reason) {
        'expired' => 'The payment wasn\'t completed in time. Nothing was charged.',
        'too_many_otp_attempts' => 'Too many wrong codes. Start a new top-up to try again.',
        'amount_mismatch' =>
          'The amount paid didn\'t match. Our team has been alerted and will sort it out — contact support if money left your account.',
        _ => 'Nothing was charged. You can try again.',
      };
}

class _Waiting extends StatelessWidget {
  const _Waiting(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: AppSpace.s12),
          Text(label, style: context.text.bodyMedium),
        ],
      );
}

class _Result extends StatelessWidget {
  const _Result({required this.icon, required this.tone, required this.title, required this.body, required this.action});
  final IconData icon;
  final Color tone;
  final String title;
  final String body;
  final Widget action;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: AppSpace.s24),
          Icon(icon, size: 56, color: tone),
          const SizedBox(height: AppSpace.s16),
          Text(title, textAlign: TextAlign.center, style: context.text.titleLarge),
          const SizedBox(height: AppSpace.s8),
          Text(body, textAlign: TextAlign.center, style: context.text.bodyMedium),
          const SizedBox(height: AppSpace.s24),
          action,
        ],
      );
}

class _CopyRow extends StatelessWidget {
  const _CopyRow({required this.label, required this.value, this.copyable = true});
  final String label;
  final String value;
  final bool copyable;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpace.s4),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: context.text.bodySmall?.copyWith(color: context.colors.textMed)),
                  Text(value, style: context.text.titleSmall),
                ],
              ),
            ),
            if (copyable)
              IconButton(
                icon: const Icon(AppIcons.copy, size: 16),
                tooltip: 'Copy',
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: value));
                  _toast(context, '$label copied');
                },
              ),
          ],
        ),
      );
}

String _newKey() {
  final r = Random.secure();
  return 'topup-${DateTime.now().microsecondsSinceEpoch}-${List.generate(8, (_) => r.nextInt(16).toRadixString(16)).join()}';
}

void _toast(BuildContext context, String msg) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
