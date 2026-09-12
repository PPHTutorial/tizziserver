import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../api/api_exception.dart';
import '../../../api/catalog_models.dart' show formatMoney;
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../ads/ads_providers.dart';
import '../../../design/icons.dart';

class ReferralScreen extends ConsumerWidget {
  const ReferralScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final s = ref.watch(referralSummaryProvider);
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Refer & earn'),
            Expanded(
              child: s.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (r) => ListView(
                  padding: const EdgeInsets.all(AppSpace.s16),
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(AppSpace.s24),
                      decoration: BoxDecoration(
                        color: c.primaryContainer,
                        borderRadius: BorderRadius.circular(AppRadius.lg),
                      ),
                      child: Column(
                        children: [
                          Text(
                            'Give ${formatMoney(r.rewardPerReferralMinor, 'GHS')}, get ${formatMoney(r.rewardPerReferralMinor, 'GHS')}',
                            style: context.text.titleMedium?.copyWith(
                              color: c.onPrimaryContainer,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'When a friend places their first order over ${formatMoney(r.qualifyMinOrderMinor, 'GHS')}.',
                            textAlign: TextAlign.center,
                            style: context.text.bodySmall?.copyWith(
                              color: c.onPrimaryContainer,
                            ),
                          ),
                          const SizedBox(height: AppSpace.s16),
                          SelectableText(
                            r.code,
                            style: context.text.headlineSmall?.copyWith(
                              letterSpacing: 3,
                              color: c.onPrimaryContainer,
                            ),
                          ),
                          const SizedBox(height: AppSpace.s8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              FilledButton.icon(
                                onPressed: () {
                                  Clipboard.setData(
                                    ClipboardData(text: r.code),
                                  );
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Code copied'),
                                    ),
                                  );
                                },
                                icon: const Icon(AppIcons.copy, size: 18),
                                label: const Text('Copy code'),
                              ),
                              const SizedBox(width: AppSpace.s8),
                              OutlinedButton.icon(
                                onPressed: () => SharePlus.instance.share(
                                  ShareParams(
                                    text:
                                        'Join me on Stall — use my code ${r.code} '
                                        'and we both get ${formatMoney(r.rewardPerReferralMinor, 'GHS')}.',
                                  ),
                                ),
                                icon: const Icon(AppIcons.share_outlined, size: 18),
                                label: const Text('Share'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                    const _ReferralAuctionNote(),
                    const SizedBox(height: AppSpace.s8),
                    Row(
                      children: [
                        StatTile(
                          label: 'Invited',
                          value: '${r.pending + r.qualified + r.rewarded}',
                        ),
                        StatTile(label: 'Rewarded', value: '${r.rewarded}'),
                        StatTile(
                          label: 'Earned',
                          value: formatMoney(r.rewardedMinor, 'GHS'),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpace.s24),
                    Text('Have a code?', style: context.text.titleMedium),
                    const SizedBox(height: AppSpace.s8),
                    const _ApplyCodeField(),
                    const SizedBox(height: AppSpace.s24),
                    if (r.items.isNotEmpty) ...[
                      Text('Your referrals', style: context.text.titleMedium),
                      const SizedBox(height: AppSpace.s8),
                      ...r.items.map(
                        (it) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: Icon(
                            it['status'] == 'REWARDED'
                                ? AppIcons.check_circle
                                : AppIcons.hourglass_bottom,
                            color: it['status'] == 'REWARDED'
                                ? c.success
                                : c.textLow,
                          ),
                          title: Text('${it['status']}'.toLowerCase()),
                          trailing: Text(
                            formatMoney(
                              (it['rewardMinor'] as num).toInt(),
                              'GHS',
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// GrandPrice-only note: referrals also count toward Inverse Draw
/// qualification scoring (`QualificationRule(factor: REFERRAL, weight: 0.25)`
/// server-side) — Figma's referral-share frame explains this, but the
/// mechanic wasn't mentioned anywhere on the screen.
class _ReferralAuctionNote extends ConsumerWidget {
  const _ReferralAuctionNote();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final boot = ref.watch(bootstrapProvider).valueOrNull;
    if (boot == null || !boot.hasFeature('auction')) {
      return const SizedBox.shrink();
    }
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpace.s12),
      decoration: BoxDecoration(
        color: c.surfaceSunken,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('How does this help me win?', style: context.text.titleSmall),
          const SizedBox(height: 4),
          Text(
            'Every active referral boosts your draw qualification score, '
            'improving your standing in Inverse Draw rounds.',
            style: context.text.bodySmall?.copyWith(color: c.textMed),
          ),
        ],
      ),
    );
  }
}

class _ApplyCodeField extends ConsumerStatefulWidget {
  const _ApplyCodeField();
  @override
  ConsumerState<_ApplyCodeField> createState() => _ApplyCodeFieldState();
}

class _ApplyCodeFieldState extends ConsumerState<_ApplyCodeField> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  String? _msg;
  bool _ok = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await ref
          .read(stallApiProvider)
          .applyReferralCode(_ctrl.text.trim().toUpperCase());
      ref.invalidate(referralSummaryProvider);
      setState(() {
        _ok = true;
        _msg = 'Code applied — your friend gets rewarded when you order.';
      });
    } on StallApiException catch (e) {
      setState(() {
        _ok = false;
        _msg = e.message;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _ctrl,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(hintText: 'FRIEND01'),
              ),
            ),
            const SizedBox(width: AppSpace.s8),
            FilledButton(
              onPressed: _busy ? null : _apply,
              child: const Text('Apply'),
            ),
          ],
        ),
        if (_msg != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              _msg!,
              style: TextStyle(
                color: _ok ? context.colors.success : context.colors.error,
              ),
            ),
          ),
      ],
    );
  }
}
