import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models.dart';
import '../../app/providers.dart';
import '../../app/router.dart';
import '../../design/context_ext.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';
import '../auth/screens/select_role_screen.dart';
import 'app_bottom_nav.dart';

/// Post-auth landing. Phase 1 ships the shell + server-driven nav + the account
/// tab (security, 2FA, PIN, password, logout). Feature tabs arrive in Phase 2+.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(bootstrapProvider);
    final c = context.colors;

    return async.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        backgroundColor: c.bg,
        body: CenteredState.error(
          title: 'Couldn\'t reach Stall',
          body: 'Check your connection and try again.',
          action: PrimaryButton(
            label: 'Retry',
            onPressed: () => ref.invalidate(bootstrapProvider),
          ),
        ),
      ),
      data: (boot) {
        final nav = boot.nav;
        final index = _index.clamp(0, nav.isEmpty ? 0 : nav.length - 1);
        final current = nav.isEmpty ? null : nav[index];
        final isAccount = current != null && current.route.contains('profile');

        return Scaffold(
          backgroundColor: c.bg,
          appBar: AppBar(
            title: Text(current?.label ?? boot.platform.name),
            centerTitle: false,
          ),
          body: isAccount
              ? _AccountTab(boot: boot)
              : _PlaceholderTab(boot: boot, navKey: current?.key ?? 'home'),
          bottomNavigationBar: AppBottomNav(
            items: nav,
            currentIndex: index,
            onTap: (i) => setState(() => _index = i),
          ),
        );
      },
    );
  }
}

class _PlaceholderTab extends StatelessWidget {
  const _PlaceholderTab({required this.boot, required this.navKey});

  final Bootstrap boot;
  final String navKey;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.s32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('“$navKey” lands in a later phase',
                textAlign: TextAlign.center, style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            Text(
              'Tenant: ${boot.platform.name} · auction ${boot.hasFeature('auction') ? 'enabled' : 'disabled'} · '
              'catalog ${boot.features['catalog.scope'] ?? 'all'}',
              textAlign: TextAlign.center,
              style: context.text.bodyMedium?.copyWith(color: c.textMed),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountTab extends ConsumerWidget {
  const _AccountTab({required this.boot});

  final Bootstrap boot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final c = context.colors;

    return ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: c.primaryContainer,
              child: Text(
                (auth.user?.displayName ?? 'A').characters.first.toUpperCase(),
                style: context.text.titleLarge?.copyWith(color: c.onPrimaryContainer),
              ),
            ),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(auth.user?.displayName ?? 'Your account',
                      style: context.text.titleMedium),
                  Text('Acting as ${auth.activeRole ?? 'CUSTOMER'}',
                      style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s20),
        if (auth.roles.length > 1)
          _Tile(
            icon: Icons.swap_horiz,
            label: 'Switch role',
            onTap: () => showRoleSwitcher(context, ref),
          ),
        _Tile(
          icon: Icons.devices,
          label: 'Signed-in devices',
          onTap: () => context.push(RoutePaths.sessions),
        ),
        _Tile(
          icon: Icons.password,
          label: 'Set a password',
          onTap: () => context.push(RoutePaths.createPassword),
        ),
        _Tile(
          icon: Icons.pin_outlined,
          label: 'Set transaction PIN',
          onTap: () => _setPin(context, ref),
        ),
        _Tile(
          icon: Icons.shield_outlined,
          label: 'Enable two-factor',
          onTap: () => _enroll2fa(context, ref),
        ),
        const SizedBox(height: AppSpace.s20),
        SecondaryButton(
          label: 'Sign out',
          onPressed: () async {
            await ref.read(authControllerProvider.notifier).logout();
            if (context.mounted) context.go(RoutePaths.welcome);
          },
        ),
      ],
    );
  }

  Future<void> _setPin(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Set transaction PIN'),
        content: AppField(
          label: '4–6 digits',
          controller: controller,
          keyboardType: TextInputType.number,
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
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('PIN set.')));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Couldn\'t set PIN.')));
      }
    }
  }

  Future<void> _enroll2fa(BuildContext context, WidgetRef ref) async {
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
              AppField(
                label: 'Code',
                controller: codeController,
                keyboardType: TextInputType.number,
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel')),
            TextButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Confirm')),
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
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: c.textMed),
      title: Text(label, style: context.text.bodyLarge),
      trailing: Icon(Icons.chevron_right, color: c.textLow),
      onTap: onTap,
    );
  }
}
