import 'package:flutter/material.dart';

import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';

const _suggestedServices = <String>[
  'Home delivery',
  'Installation',
  'Repairs & maintenance',
  'Custom orders',
  'Gift wrapping',
  'Warranty support',
  'Bulk / wholesale orders',
  'Consultation',
  'Assembly',
  'Returns pickup',
  'Express delivery',
  'After-sales support',
];

/// Chip picker for the shop's offered services — curated suggestions plus
/// free-text custom entries, same unconstrained-string pattern as
/// `Business.category` elsewhere in this app (no server-side vocabulary).
class ServicesPicker extends StatelessWidget {
  const ServicesPicker({super.key, required this.selected, required this.onChanged});

  final List<String> selected;
  final ValueChanged<List<String>> onChanged;

  void _toggle(String service) {
    final next = [...selected];
    if (next.contains(service)) {
      next.remove(service);
    } else {
      if (next.length >= 20) return;
      next.add(service);
    }
    onChanged(next);
  }

  Future<void> _addCustom(BuildContext context) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add a service'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 40,
          decoration: const InputDecoration(hintText: 'e.g. Same-day delivery'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    if (value != null && value.isNotEmpty) _toggle(value);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final custom = selected.where((s) => !_suggestedServices.contains(s)).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppSpace.s8,
          runSpacing: AppSpace.s8,
          children: [
            for (final service in [..._suggestedServices, ...custom])
              FilterChip(
                label: Text(service),
                selected: selected.contains(service),
                onSelected: (_) => _toggle(service),
              ),
            ActionChip(
              avatar: const Icon(Icons.add, size: 16),
              label: const Text('Add'),
              onPressed: () => _addCustom(context),
            ),
          ],
        ),
        if (selected.isEmpty) ...[
          const SizedBox(height: AppSpace.s8),
          Text('Pick what your shop offers.', style: context.text.bodySmall?.copyWith(color: c.textLow)),
        ],
      ],
    );
  }
}
