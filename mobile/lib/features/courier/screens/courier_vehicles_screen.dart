import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/delivery_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/selectors.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../courier_providers.dart';

const _vehicleTypes = ['BICYCLE', 'MOTORBIKE', 'CAR', 'VAN', 'TRUCK', 'OTHER'];

IconData vehicleIcon(String type) => switch (type) {
  'BICYCLE' => AppIcons.directions_bike,
  'MOTORBIKE' => AppIcons.two_wheeler,
  'CAR' => AppIcons.directions_car,
  'VAN' => AppIcons.airport_shuttle,
  'TRUCK' => AppIcons.local_shipping,
  _ => AppIcons.local_shipping_outlined,
};

BadgeTone _vehicleTone(String status) => switch (status) {
  'APPROVED' => BadgeTone.success,
  'REJECTED' => BadgeTone.danger,
  _ => BadgeTone.neutral,
};

/// §10 — the courier's fleet: add / edit / remove vehicles, pick the active one,
/// attach registration & insurance documents.
class CourierVehiclesScreen extends ConsumerWidget {
  const CourierVehiclesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(courierMeProvider);
    return Scaffold(
      backgroundColor: context.colors.bg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _vehicleForm(context, ref),
        icon: const Icon(AppIcons.add),
        label: const Text('Add vehicle'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('My vehicles'),
            Expanded(
              child: async.when(
                loading: () => const SkeletonList(rows: 3, rowHeight: 128),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load your vehicles',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(courierMeProvider),
                  ),
                ),
                data: (me) {
                  if (me.vehicles.isEmpty) {
                    return const CenteredState(
                      icon: AppIcons.two_wheeler,
                      title: 'No vehicles yet',
                      body:
                          'Add a vehicle and attach its documents so ops can approve it.',
                    );
                  }
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.s16,
                      AppSpace.s16,
                      AppSpace.s16,
                      96,
                    ),
                    children: [
                      for (final v in me.vehicles) _VehicleCard(vehicle: v),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VehicleCard extends ConsumerWidget {
  const _VehicleCard({required this.vehicle});
  final CourierVehicleViewDto vehicle;

  Future<void> _mutate(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function() op,
  ) async {
    try {
      await op();
      ref.invalidate(courierMeProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final v = vehicle;
    final title = v.label.isEmpty
        ? v.type[0] + v.type.substring(1).toLowerCase()
        : v.label;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s12),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(vehicleIcon(v.type), size: 22, color: c.textMed),
                const SizedBox(width: AppSpace.s10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: context.text.titleSmall),
                      Text(
                        [
                          if (v.plate != null && v.plate!.isNotEmpty) v.plate,
                          if (v.year != null) '${v.year}',
                        ].join(' · '),
                        style: context.text.labelSmall?.copyWith(
                          color: c.textMed,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusBadge(v.status, tone: _vehicleTone(v.status)),
              ],
            ),
            const SizedBox(height: AppSpace.s8),
            Row(
              children: [
                Icon(AppIcons.description_outlined, size: 14, color: c.textLow),
                const SizedBox(width: AppSpace.s6),
                Text(
                  v.documents.isEmpty
                      ? 'No documents'
                      : '${v.documents.length} document${v.documents.length == 1 ? '' : 's'}',
                  style: context.text.labelSmall?.copyWith(color: c.textMed),
                ),
              ],
            ),
            const Divider(height: AppSpace.s24),
            Wrap(
              spacing: AppSpace.s8,
              children: [
                if (v.isActive)
                  Chip(
                    avatar: Icon(AppIcons.check, size: 14, color: c.success),
                    label: const Text('Active'),
                    visualDensity: VisualDensity.compact,
                  )
                else
                  TextButton(
                    onPressed: () => _mutate(
                      context,
                      ref,
                      () => ref
                          .read(stallApiProvider)
                          .courierSetActiveVehicle(v.id),
                    ),
                    child: const Text('Set active'),
                  ),
                TextButton(
                  onPressed: () => _vehicleForm(context, ref, existing: v),
                  child: const Text('Edit'),
                ),
                TextButton(
                  onPressed: () => _addDocument(context, ref, v.id),
                  child: const Text('Add document'),
                ),
                TextButton(
                  onPressed: () async {
                    final ok = await confirmDialog(
                      context,
                      title: 'Remove this vehicle?',
                      confirmLabel: 'Remove',
                      destructive: true,
                    );
                    if (!ok || !context.mounted) return;
                    await _mutate(
                      context,
                      ref,
                      () =>
                          ref.read(stallApiProvider).courierRemoveVehicle(v.id),
                    );
                  },
                  child: Text('Remove', style: TextStyle(color: c.error)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _addDocument(
  BuildContext context,
  WidgetRef ref,
  String vehicleId,
) async {
  final type = ValueNotifier<String>('REGISTRATION');
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Attach document'),
      content: ValueListenableBuilder<String>(
        valueListenable: type,
        builder: (context, value, _) => AppSelect<String>(
          label: 'Document type',
          value: value,
          items: const [
            AppSelectItem(value: 'REGISTRATION', label: 'Registration'),
            AppSelectItem(value: 'INSURANCE', label: 'Insurance'),
            AppSelectItem(value: 'INSPECTION', label: 'Inspection'),
          ],
          onChanged: (v) => type.value = v ?? value,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Upload'),
        ),
      ],
    ),
  );
  if (ok != true) return;
  try {
    // No media server yet — reference a deterministic placeholder key.
    await ref
        .read(stallApiProvider)
        .courierAddVehicleDocument(
          vehicleId,
          type: type.value,
          fileKey: 'vehicle-docs/$vehicleId/${type.value.toLowerCase()}.jpg',
        );
    ref.invalidate(courierMeProvider);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Document submitted for review')),
      );
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

Future<void> _vehicleForm(
  BuildContext context,
  WidgetRef ref, {
  CourierVehicleViewDto? existing,
}) async {
  final type = ValueNotifier<String>(existing?.type ?? 'MOTORBIKE');
  final make = TextEditingController(text: existing?.make ?? '');
  final model = TextEditingController(text: existing?.model ?? '');
  final color = TextEditingController(text: existing?.color ?? '');
  final plate = TextEditingController(text: existing?.plate ?? '');
  final year = TextEditingController(text: existing?.year?.toString() ?? '');

  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(existing == null ? 'Add vehicle' : 'Edit vehicle'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValueListenableBuilder<String>(
              valueListenable: type,
              builder: (context, value, _) => AppSelect<String>(
                label: 'Type',
                value: value,
                items: [
                  for (final t in _vehicleTypes)
                    AppSelectItem(value: t, label: t[0] + t.substring(1).toLowerCase()),
                ],
                onChanged: (v) => type.value = v ?? value,
              ),
            ),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Make', hintText: 'e.g. Honda', controller: make),
            const SizedBox(height: AppSpace.s8),
            AppField(
              label: 'Model',
              hintText: 'e.g. Wave 110',
              controller: model,
            ),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Colour', hintText: 'e.g. Red', controller: color),
            const SizedBox(height: AppSpace.s8),
            AppField(
              label: 'Plate',
              hintText: 'e.g. GT 1234-20',
              controller: plate,
            ),
            const SizedBox(height: AppSpace.s8),
            AppField(
              label: 'Year',
              hintText: 'e.g. 2021',
              controller: year,
              keyboardType: TextInputType.number,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  if (ok != true) return;

  String? t(TextEditingController c) =>
      c.text.trim().isEmpty ? null : c.text.trim();
  final yr = int.tryParse(year.text.trim());
  try {
    final api = ref.read(stallApiProvider);
    if (existing == null) {
      await api.courierAddVehicle(
        type: type.value,
        make: t(make),
        model: t(model),
        color: t(color),
        plate: t(plate),
        year: yr,
      );
    } else {
      await api.courierUpdateVehicle(
        existing.id,
        type: type.value,
        make: t(make),
        model: t(model),
        color: t(color),
        plate: t(plate),
        year: yr,
      );
    }
    ref.invalidate(courierMeProvider);
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}
