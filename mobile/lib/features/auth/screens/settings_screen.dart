import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../comms/screens/notifications_screen.dart'
    show NotificationPrefsSheet;
import '../../trust/trust_providers.dart';
import '../security_actions.dart';

/// Figma's `settings-screen` frame — Account Settings / Notifications /
/// Preferences, grouped. Every row here wraps a real, already-working
/// action (2FA enroll, password, notification prefs) rather than a
/// standalone reimplementation; Language/Currency are shown read-only since
/// there's no real switcher behind them yet — better an honest static value
/// than a control that looks live and does nothing.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final boot = ref.watch(bootstrapProvider).valueOrNull;
    final security = ref.watch(securityCentreProvider);

    Widget sectionLabel(String s) => Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.s4,
        AppSpace.s16,
        AppSpace.s4,
        AppSpace.s8,
      ),
      child: Text(
        s.toUpperCase(),
        style: context.text.labelSmall?.copyWith(
          color: c.textLow,
          letterSpacing: 1.0,
        ),
      ),
    );

    Widget card(List<Widget> rows) => AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i != rows.length - 1)
              Divider(
                height: 1,
                thickness: 1,
                color: c.border.withValues(alpha: 0.6),
                indent: AppSpace.s16,
                endIndent: AppSpace.s16,
              ),
          ],
        ],
      ),
    );

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Settings'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.s16,
                  0,
                  AppSpace.s16,
                  AppSpace.s24,
                ),
                children: [
                  sectionLabel('Account settings'),
                  card([
                    AppListRow(
                      icon: AppIcons.person,
                      label: 'Edit profile',
                      onTap: () => context.push(RoutePaths.editProfile),
                    ),
                    AppListRow(
                      icon: AppIcons.password,
                      label: 'Change password',
                      onTap: () => context.push(RoutePaths.createPassword),
                    ),
                    security.when(
                      loading: () => AppListRow(
                        icon: AppIcons.shield_outlined,
                        label: 'Two-factor auth',
                        showChevron: false,
                      ),
                      error: (e, _) => AppListRow(
                        icon: AppIcons.shield_outlined,
                        label: 'Two-factor auth',
                        showChevron: false,
                      ),
                      data: (s) => AppListRow(
                        icon: AppIcons.shield_outlined,
                        label: 'Two-factor auth',
                        trailing: StatusBadge(
                          s.twoFactorEnabled ? 'ON' : 'OFF',
                          tone: s.twoFactorEnabled
                              ? BadgeTone.success
                              : BadgeTone.neutral,
                        ),
                        showChevron: !s.twoFactorEnabled,
                        onTap: s.twoFactorEnabled
                            ? null
                            : () => enrollTwoFactor(context, ref),
                      ),
                    ),
                  ]),
                  sectionLabel('Notifications'),
                  card([
                    AppListRow(
                      icon: AppIcons.notifications_none,
                      label: 'Notification preferences',
                      onTap: () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        showDragHandle: true,
                        shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
                        ),
                        builder: (_) => const NotificationPrefsSheet(),
                      ),
                    ),
                  ]),
                  sectionLabel('Preferences'),
                  card([
                    AppListRow(
                      icon: AppIcons.language,
                      label: 'Language',
                      trailing: StatusBadge('COMING SOON', tone: BadgeTone.neutral),
                      showChevron: false,
                    ),
                    AppListRow(
                      icon: AppIcons.payments_outlined,
                      label: 'Currency',
                      trailing: Text(
                        boot?.platform.defaultCurrency ?? 'GHS',
                        style: context.text.bodyMedium?.copyWith(
                          color: c.textMed,
                        ),
                      ),
                      showChevron: false,
                    ),
                  ]),
                  const SizedBox(height: AppSpace.s24),
                  Center(
                    child: Text(
                      '${boot?.platform.name ?? 'Stall'} · Version 1.0.0',
                      style: context.text.labelSmall?.copyWith(
                        color: c.textLow,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
