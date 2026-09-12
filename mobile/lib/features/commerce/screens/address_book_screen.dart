import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/api_exception.dart';
import '../../../api/commerce_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../commerce_providers.dart';
import '../../../design/icons.dart';

/// Screens 94–97 — address book: list, add, edit, set default, delete.
class AddressBookScreen extends ConsumerWidget {
  const AddressBookScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(addressesProvider);

    return Scaffold(
      backgroundColor: c.bg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(context, ref, null),
        icon: const Icon(AppIcons.add),
        label: const Text('Add'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Addresses'),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load addresses',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(addressesProvider),
                  ),
                ),
                data: (list) => list.isEmpty
                    ? const CenteredState(
                        icon: AppIcons.location_on_outlined,
                        title: 'No addresses yet',
                        body: 'Add a delivery address to speed up checkout.',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppSpace.s16),
                        itemCount: list.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpace.s12),
                        itemBuilder: (context, i) {
                          final a = list[i];
                          return AppCard(
                            onTap: () => _edit(context, ref, a),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        a.recipientName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: context.text.titleSmall,
                                      ),
                                    ),
                                    if (a.isDefault) ...[
                                      const SizedBox(width: AppSpace.s8),
                                      Text(
                                        'Default',
                                        style: context.text.labelSmall
                                            ?.copyWith(color: c.primary),
                                      ),
                                    ],
                                    PopupMenuButton<String>(
                                      onSelected: (v) async {
                                        final api = ref.read(stallApiProvider);
                                        if (v == 'edit') _edit(context, ref, a);
                                        if (v == 'default') {
                                          await api.saveAddress({
                                            'isDefault': true,
                                          }, id: a.id);
                                          ref.invalidate(addressesProvider);
                                        }
                                        if (v == 'delete') {
                                          await api.deleteAddress(a.id);
                                          ref.invalidate(addressesProvider);
                                        }
                                      },
                                      itemBuilder: (_) => [
                                        const PopupMenuItem(
                                          value: 'edit',
                                          child: Text('Edit'),
                                        ),
                                        if (!a.isDefault)
                                          const PopupMenuItem(
                                            value: 'default',
                                            child: Text('Set as default'),
                                          ),
                                        const PopupMenuItem(
                                          value: 'delete',
                                          child: Text('Delete'),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                Text(
                                  a.oneLine,
                                  style: context.text.bodyMedium?.copyWith(
                                    color: c.textMed,
                                  ),
                                ),
                                Text(
                                  a.phone,
                                  style: context.text.bodyMedium?.copyWith(
                                    color: c.textMed,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _edit(BuildContext context, WidgetRef ref, AddressDto? existing) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.r2xl)),
      ),
      builder: (_) => _AddressForm(existing: existing, ref: ref),
    );
  }
}

class _AddressForm extends StatefulWidget {
  const _AddressForm({required this.existing, required this.ref});
  final AddressDto? existing;
  final WidgetRef ref;

  @override
  State<_AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends State<_AddressForm> {
  late final _name = TextEditingController(
    text: widget.existing?.recipientName,
  );
  late final _phone = TextEditingController(text: widget.existing?.phone);
  late final _line1 = TextEditingController(text: widget.existing?.line1);
  late final _city = TextEditingController(text: widget.existing?.city);
  late final _country = TextEditingController(
    text: widget.existing?.country ?? 'GH',
  );
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _phone, _line1, _city, _country]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if ([_name, _phone, _line1, _city].any((c) => c.text.trim().isEmpty) ||
        _country.text.trim().length != 2) {
      setState(
        () => _error = 'Fill in every field (country as a 2-letter code)',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.ref.read(stallApiProvider).saveAddress({
        'recipientName': _name.text.trim(),
        'phone': _phone.text.trim(),
        'line1': _line1.text.trim(),
        'city': _city.text.trim(),
        'country': _country.text.trim().toUpperCase(),
      }, id: widget.existing?.id);
      widget.ref.invalidate(addressesProvider);
      if (mounted) Navigator.of(context).pop();
    } on StallApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
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
            Text(
              widget.existing == null ? 'New address' : 'Edit address',
              style: context.text.titleMedium,
            ),
            const SizedBox(height: AppSpace.s12),
            TextField(
              controller: _name,
              decoration: const InputDecoration(
                labelText: 'Recipient name',
                hintText: 'e.g. Kwame Mensah',
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            TextField(
              controller: _phone,
              decoration: const InputDecoration(
                labelText: 'Phone',
                hintText: '+233 20 000 0000',
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            TextField(
              controller: _line1,
              decoration: const InputDecoration(
                labelText: 'Street address',
                hintText: 'House number, street',
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _city,
                    decoration: const InputDecoration(
                      labelText: 'City',
                      hintText: 'e.g. Accra',
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.s8),
                SizedBox(
                  width: 90,
                  child: TextField(
                    controller: _country,
                    decoration: const InputDecoration(
                      labelText: 'Country',
                      hintText: 'Ghana',
                    ),
                  ),
                ),
              ],
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: InlineError(_error!),
              ),
            const SizedBox(height: AppSpace.s16),
            PrimaryButton(
              label: 'Save',
              loading: _busy,
              onPressed: _busy ? null : _save,
            ),
          ],
        ),
      ),
    );
  }
}
