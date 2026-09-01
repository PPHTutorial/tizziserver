import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../auth_util.dart';

const _roleMeta = <String, (IconData, String, String)>{
  'CUSTOMER': (Icons.shopping_bag_outlined, 'Shop', 'Browse, order, and track deliveries.'),
  'VENDOR': (Icons.storefront_outlined, 'Sell', 'Manage products, orders, and payouts.'),
  'COURIER': (Icons.two_wheeler_outlined, 'Deliver', 'Accept jobs and earn on deliveries.'),
  'STAFF': (Icons.headset_mic_outlined, 'Operations', 'Support, KYC, and disputes.'),
  'ADMIN': (Icons.tune, 'Admin', 'Platform console.'),
};

/// Screens 15–16 — Select role after sign-in when the account holds more than
/// one. Also the target of the in-app role switcher.
class SelectRoleScreen extends ConsumerStatefulWidget {
  const SelectRoleScreen({super.key});

  @override
  ConsumerState<SelectRoleScreen> createState() => _SelectRoleScreenState();
}

class _SelectRoleScreenState extends ConsumerState<SelectRoleScreen> {
  String? _pending;
  String? _error;

  Future<void> _pick(String role) async {
    final auth = ref.read(authControllerProvider);
    setState(() {
      _pending = role;
      _error = null;
    });

    String? err;
    if (role == auth.activeRole) {
      ref.read(authControllerProvider.notifier).confirmRole();
    } else {
      err = await runCatching(
        () => ref.read(authControllerProvider.notifier).chooseRole(role),
      );
    }

    if (!mounted) return;
    setState(() {
      _pending = null;
      _error = err;
    });
    if (err == null) context.go(RoutePaths.home);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final roles = auth.roles.isEmpty ? const ['CUSTOMER'] : auth.roles;
    final c = context.colors;

    return AuthScaffold(
      showBack: false,
      title: 'Choose how you\'ll use Stall',
      subtitle: 'You can switch any time from your profile.',
      children: [
        for (final role in roles) ...[
          _RoleCard(
            role: role,
            meta: _roleMeta[role] ?? (Icons.person_outline, role, ''),
            selected: role == auth.activeRole,
            loading: _pending == role,
            onTap: _pending == null ? () => _pick(role) : null,
          ),
          const SizedBox(height: AppSpace.s12),
        ],
        InlineError(_error),
        const SizedBox(height: AppSpace.s8),
        Text(
          'Signed in as ${auth.user?.displayName ?? 'your account'}.',
          style: context.text.bodyMedium?.copyWith(color: c.textMed),
        ),
      ],
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.role,
    required this.meta,
    required this.selected,
    required this.loading,
    required this.onTap,
  });

  final String role;
  final (IconData, String, String) meta;
  final bool selected;
  final bool loading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (icon, label, desc) = meta;
    return Material(
      color: selected ? c.primaryContainer : c.surface,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(AppSpace.s16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(color: selected ? c.primary : c.border),
          ),
          child: Row(
            children: [
              Icon(icon, color: selected ? c.onPrimaryContainer : c.textHi),
              const SizedBox(width: AppSpace.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: context.text.titleMedium),
                    if (desc.isNotEmpty) ...[
                      const SizedBox(height: AppSpace.s2),
                      Text(desc,
                          style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                    ],
                  ],
                ),
              ),
              if (loading)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(selected ? Icons.check_circle : Icons.chevron_right,
                    color: selected ? c.primary : c.textLow),
            ],
          ),
        ),
      ),
    );
  }
}

/// Screen 16 — in-app role switcher, shown as a bottom sheet from Profile.
Future<void> showRoleSwitcher(BuildContext context, WidgetRef ref) async {
  final auth = ref.read(authControllerProvider);
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpace.s16),
            child: Text('Switch role', style: context.text.titleLarge),
          ),
          for (final role in auth.roles)
            ListTile(
              leading: Icon((_roleMeta[role] ?? (Icons.person, '', '')).$1),
              title: Text((_roleMeta[role] ?? (Icons.person, role, '')).$2),
              trailing: role == auth.activeRole ? const Icon(Icons.check) : null,
              onTap: () async {
                Navigator.of(context).pop();
                if (role != auth.activeRole) {
                  await ref.read(authControllerProvider.notifier).chooseRole(role);
                }
              },
            ),
        ],
      ),
    ),
  );
}
