import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/delivery_models.dart';
import '../../../app/providers.dart';
import '../../../core/location.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../courier_providers.dart';

const _dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/// §11 — where and when the courier works: service-area circles and a weekly
/// availability grid.
class CourierServiceAreasScreen extends ConsumerWidget {
  const CourierServiceAreasScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(courierMeProvider);
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Areas & availability'),
            Expanded(
              child: async.when(
                loading: () => const SkeletonList(rows: 4, rowHeight: 84),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load this',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(courierMeProvider),
                  ),
                ),
                data: (me) => ListView(
                  padding: const EdgeInsets.all(AppSpace.s16),
                  children: [
                    SectionHeader(
                      'Service areas',
                      action: TextButton.icon(
                        onPressed: () => _addArea(context, ref),
                        icon: const Icon(AppIcons.add, size: 16),
                        label: const Text('Add'),
                      ),
                    ),
                    if (me.serviceAreas.isEmpty)
                      Text(
                        'Add at least one area so jobs near you get offered.',
                        style: context.text.bodyMedium?.copyWith(
                          color: context.colors.textMed,
                        ),
                      )
                    else
                      for (final a in me.serviceAreas) _AreaCard(area: a),
                    const SizedBox(height: AppSpace.s24),
                    const SectionHeader('Weekly availability'),
                    _AvailabilityEditor(slots: me.availability),
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

class _AreaCard extends ConsumerWidget {
  const _AreaCard({required this.area});
  final CourierServiceAreaDto area;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s12),
      child: AppCard(
        child: Row(
          children: [
            Icon(AppIcons.near_me, size: 18, color: c.textMed),
            const SizedBox(width: AppSpace.s10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(area.name, style: context.text.titleSmall),
                  Text(
                    '${(area.radiusM / 1000).toStringAsFixed(1)} km radius',
                    style: context.text.labelSmall?.copyWith(color: c.textMed),
                  ),
                ],
              ),
            ),
            Switch(
              value: area.enabled,
              onChanged: (v) => _mutate(
                context,
                ref,
                () => ref
                    .read(stallApiProvider)
                    .courierUpsertServiceArea(
                      id: area.id,
                      name: area.name,
                      centerLat: area.centerLat,
                      centerLng: area.centerLng,
                      radiusM: area.radiusM,
                      enabled: v,
                    ),
              ),
            ),
            IconButton(
              icon: Icon(AppIcons.delete_outline, size: 18, color: c.textLow),
              onPressed: () async {
                final ok = await confirmDialog(
                  context,
                  title: 'Remove "${area.name}"?',
                  confirmLabel: 'Remove',
                  destructive: true,
                );
                if (!ok || !context.mounted) return;
                await _mutate(
                  context,
                  ref,
                  () => ref
                      .read(stallApiProvider)
                      .courierRemoveServiceArea(area.id),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

Future<void> _addArea(BuildContext context, WidgetRef ref) async {
  final name = TextEditingController();
  var radiusKm = 5.0;
  var center = await DeviceLocation.current() ?? (lat: 5.6037, lng: -0.187);

  if (!context.mounted) return;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('New service area'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppField(
              label: 'Name',
              controller: name,
              hintText: 'e.g. East Legon',
            ),
            const SizedBox(height: AppSpace.s12),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Radius: ${radiusKm.toStringAsFixed(0)} km',
                style: context.text.labelMedium?.copyWith(
                  color: context.colors.textMed,
                ),
              ),
            ),
            Slider(
              value: radiusKm,
              min: 1,
              max: 30,
              divisions: 29,
              label: '${radiusKm.toStringAsFixed(0)} km',
              onChanged: (v) => setState(() => radiusKm = v),
            ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Centre: ${center.lat.toStringAsFixed(4)}, ${center.lng.toStringAsFixed(4)}',
                    style: context.text.labelSmall?.copyWith(
                      color: context.colors.textLow,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    final here = await DeviceLocation.current();
                    if (here != null) setState(() => center = here);
                  },
                  child: const Text('Use my location'),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Add'),
          ),
        ],
      ),
    ),
  );
  if (ok != true || name.text.trim().isEmpty || !context.mounted) return;
  await _mutate(
    context,
    ref,
    () => ref
        .read(stallApiProvider)
        .courierUpsertServiceArea(
          name: name.text.trim(),
          centerLat: center.lat,
          centerLng: center.lng,
          radiusM: (radiusKm * 1000).round(),
          enabled: true,
        ),
  );
}

class _AvailabilityEditor extends ConsumerStatefulWidget {
  const _AvailabilityEditor({required this.slots});
  final List<CourierAvailabilitySlotDto> slots;

  @override
  ConsumerState<_AvailabilityEditor> createState() =>
      _AvailabilityEditorState();
}

class _AvailabilityEditorState extends ConsumerState<_AvailabilityEditor> {
  late List<CourierAvailabilitySlotDto> _rows;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _rows = List.generate(7, (d) {
      final existing = widget.slots.where((s) => s.dayOfWeek == d).firstOrNull;
      return existing ??
          CourierAvailabilitySlotDto(
            dayOfWeek: d,
            startTime: '09:00',
            endTime: '17:00',
            enabled: false,
          );
    });
  }

  void _set(int i, CourierAvailabilitySlotDto v) =>
      setState(() => _rows[i] = v);

  Future<void> _pick(int i, bool isStart) async {
    final cur = _parse(isStart ? _rows[i].startTime : _rows[i].endTime);
    final picked = await showTimePicker(context: context, initialTime: cur);
    if (picked == null) return;
    final hhmm =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    final r = _rows[i];
    _set(
      i,
      CourierAvailabilitySlotDto(
        dayOfWeek: r.dayOfWeek,
        startTime: isStart ? hhmm : r.startTime,
        endTime: isStart ? r.endTime : hhmm,
        enabled: r.enabled,
      ),
    );
  }

  TimeOfDay _parse(String hhmm) {
    final p = hhmm.split(':');
    return TimeOfDay(
      hour: int.tryParse(p.first) ?? 9,
      minute: int.tryParse(p.last) ?? 0,
    );
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(stallApiProvider)
          .courierSetAvailability(_rows.map((r) => r.toJson()).toList());
      ref.invalidate(courierMeProvider);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Availability saved')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      child: Column(
        children: [
          for (var i = 0; i < _rows.length; i++) ...[
            Row(
              children: [
                SizedBox(
                  width: 44,
                  child: Text(
                    _dayNames[_rows[i].dayOfWeek],
                    style: context.text.titleSmall,
                  ),
                ),
                Switch(
                  value: _rows[i].enabled,
                  onChanged: (v) => _set(
                    i,
                    CourierAvailabilitySlotDto(
                      dayOfWeek: _rows[i].dayOfWeek,
                      startTime: _rows[i].startTime,
                      endTime: _rows[i].endTime,
                      enabled: v,
                    ),
                  ),
                ),
                const Spacer(),
                if (_rows[i].enabled) ...[
                  _timeChip(context, _rows[i].startTime, () => _pick(i, true)),
                  Text(
                    '  –  ',
                    style: context.text.bodyMedium?.copyWith(color: c.textLow),
                  ),
                  _timeChip(context, _rows[i].endTime, () => _pick(i, false)),
                ] else
                  Text(
                    'Off',
                    style: context.text.labelSmall?.copyWith(color: c.textLow),
                  ),
              ],
            ),
            if (i < _rows.length - 1) const Divider(height: AppSpace.s16),
          ],
          const SizedBox(height: AppSpace.s12),
          PrimaryButton(
            label: 'Save availability',
            loading: _busy,
            onPressed: _save,
          ),
        ],
      ),
    );
  }

  Widget _timeChip(BuildContext context, String label, VoidCallback onTap) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.s8,
            vertical: AppSpace.s4,
          ),
          decoration: BoxDecoration(
            color: context.colors.surfaceSunken,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Text(label, style: context.text.labelMedium),
        ),
      );
}
