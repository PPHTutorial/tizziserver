import 'package:flutter/material.dart';

import '../../design/context_ext.dart';
import '../../design/countries.dart';
import '../../design/icons.dart';
import '../../design/tokens.g.dart';

/// Bottom sheet: searchable country + dial-code list for the phone entry
/// screen's country selector.
Future<Country?> showCountryPicker(BuildContext context, {Country? selected}) {
  return showModalBottomSheet<Country>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CountryPickerSheet(selected: selected),
  );
}

class _CountryPickerSheet extends StatefulWidget {
  const _CountryPickerSheet({this.selected});
  final Country? selected;

  @override
  State<_CountryPickerSheet> createState() => _CountryPickerSheetState();
}

class _CountryPickerSheetState extends State<_CountryPickerSheet> {
  final _query = TextEditingController();
  late List<Country> _filtered = kCountries;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _onQueryChanged(String q) {
    final needle = q.trim().toLowerCase();
    setState(() {
      _filtered = needle.isEmpty
          ? kCountries
          : kCountries
              .where((c) =>
                  c.name.toLowerCase().contains(needle) ||
                  c.dialCode.contains(needle) ||
                  c.iso2.toLowerCase() == needle)
              .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.only(top: 64),
        decoration: BoxDecoration(
          color: c.bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpace.s12),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpace.s16, AppSpace.s16, AppSpace.s16, AppSpace.s8),
              child: TextField(
                controller: _query,
                autofocus: true,
                onChanged: _onQueryChanged,
                decoration: InputDecoration(
                  hintText: 'Search country or code',
                  prefixIcon: const Icon(AppIcons.search, size: 16),
                  filled: true,
                  fillColor: c.surface,
                  contentPadding: const EdgeInsets.symmetric(vertical: AppSpace.s12),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    borderSide: BorderSide(color: c.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    borderSide: BorderSide(color: c.primary, width: 1.5),
                  ),
                ),
              ),
            ),
            Flexible(
              child: _filtered.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(AppSpace.s32),
                      child: Text('No matches',
                          style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                    )
                  : ListView.builder(
                      shrinkWrap: true,
                      itemCount: _filtered.length,
                      itemBuilder: (context, i) {
                        final country = _filtered[i];
                        final active = country.iso2 == widget.selected?.iso2;
                        return ListTile(
                          leading: Text(country.flag, style: const TextStyle(fontSize: 22)),
                          title: Text(country.name),
                          trailing: Text('+${country.dialCode}',
                              style: context.text.bodyMedium?.copyWith(
                                color: active ? c.primary : c.textMed,
                                fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                              )),
                          onTap: () => Navigator.of(context).pop(country),
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
