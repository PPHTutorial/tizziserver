import 'dart:async';

import 'package:flutter/material.dart';

import 'context_ext.dart';
import 'icons.dart';
import 'tokens.g.dart';
import 'widgets.dart';

/// One option in an [AppSelect] — a value/label pair with an optional
/// leading icon or thumbnail widget shown in the dropdown menu row.
class AppSelectItem<T> {
  const AppSelectItem({required this.value, required this.label, this.leading});

  final T value;
  final String label;
  final Widget? leading;
}

/// A `DropdownButtonFormField`-backed select that shares [appFieldDecoration]
/// with [AppField] so the two render with identical chrome — filled surface,
/// rounded outline border, same content padding and focus color. Use it
/// anywhere a form previously reached for a bare `DropdownButtonFormField`.
class AppSelect<T> extends StatelessWidget {
  const AppSelect({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.hintText,
    this.enabled = true,
  });

  final String label;
  final T? value;
  final List<AppSelectItem<T>> items;
  final ValueChanged<T?> onChanged;
  final String? hintText;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: context.text.labelMedium?.copyWith(color: c.textMed)),
        const SizedBox(height: AppSpace.s6),
        DropdownButtonFormField<T>(
          value: value,
          isExpanded: true,
          isDense: true,
          icon: Icon(AppIcons.chevron_down, size: 14, color: c.textMed),
          decoration: appFieldDecoration(context, hintText: hintText),
          items: [
            for (final item in items)
              DropdownMenuItem<T>(
                value: item.value,
                child: item.leading == null
                    ? Text(item.label, overflow: TextOverflow.ellipsis)
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          item.leading!,
                          const SizedBox(width: AppSpace.s8),
                          Flexible(
                            child: Text(item.label, overflow: TextOverflow.ellipsis),
                          ),
                        ],
                      ),
              ),
          ],
          onChanged: enabled ? onChanged : null,
        ),
      ],
    );
  }
}

/// A neutral mid-gray backing so a thumbnail (e.g. a brand logo fetched from
/// an external API) stays visible regardless of its own color or the current
/// theme — deliberately NOT derived from [AppColors], see [AppAutocomplete].
const _neutralThumbBg = Color(0xFFBDBDBD);

/// A generic async, debounced search-as-you-type combobox. Fully agnostic of
/// what [T] is — callers supply [search]/[labelOf]/[leadingBuilder].
///
/// Renders with the same [appFieldDecoration] chrome as [AppField], and drops
/// its results into a floating panel anchored to the field via
/// [CompositedTransformTarget]/[CompositedTransformFollower]. Tapping outside
/// the field or the panel dismisses it ([TapRegion] — the standard companion
/// to [OverlayPortal] for exactly this "click away to close" behaviour).
class AppAutocomplete<T> extends StatefulWidget {
  const AppAutocomplete({
    super.key,
    required this.label,
    this.hintText,
    required this.search,
    required this.labelOf,
    this.leadingBuilder,
    required this.onSelected,
    this.initialValue,
    this.initialTextOf,
  });

  final String label;
  final String? hintText;
  final Future<List<T>> Function(String query) search;
  final String Function(T item) labelOf;
  final Widget Function(T item)? leadingBuilder;
  final ValueChanged<T> onSelected;
  final T? initialValue;
  final String Function(T item)? initialTextOf;

  @override
  State<AppAutocomplete<T>> createState() => _AppAutocompleteState<T>();
}

class _AppAutocompleteState<T> extends State<AppAutocomplete<T>> {
  static const _debounceDuration = Duration(milliseconds: 300);

  late final TextEditingController _controller = TextEditingController(
    text: widget.initialValue == null
        ? ''
        : (widget.initialTextOf ?? widget.labelOf)(widget.initialValue as T),
  );
  final FocusNode _focusNode = FocusNode();
  final LayerLink _layerLink = LayerLink();
  final OverlayPortalController _overlayController = OverlayPortalController();
  final GlobalKey _fieldKey = GlobalKey();

  Timer? _debounce;
  List<T> _results = const [];
  bool _loading = false;
  bool _searched = false;
  int _searchToken = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onChanged(String query) {
    _debounce?.cancel();
    if (query.trim().isEmpty) {
      _searchToken++;
      setState(() {
        _results = const [];
        _loading = false;
        _searched = false;
      });
      _overlayController.hide();
      return;
    }
    _debounce = Timer(_debounceDuration, () => _runSearch(query));
  }

  Future<void> _runSearch(String query) async {
    final token = ++_searchToken;
    setState(() => _loading = true);
    _overlayController.show();
    List<T> results;
    try {
      results = await widget.search(query);
    } catch (_) {
      results = const [];
    }
    if (!mounted || token != _searchToken) return;
    setState(() {
      _results = results;
      _loading = false;
      _searched = true;
    });
  }

  void _select(T item) {
    _controller.text = widget.labelOf(item);
    _overlayController.hide();
    _focusNode.unfocus();
    widget.onSelected(item);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return TapRegion(
      groupId: this,
      onTapOutside: (_) => _overlayController.hide(),
      child: OverlayPortal(
        controller: _overlayController,
        overlayChildBuilder: (context) {
          final box = _fieldKey.currentContext?.findRenderObject() as RenderBox?;
          final width = box?.size.width ?? MediaQuery.sizeOf(context).width;
          return CompositedTransformFollower(
            link: _layerLink,
            showWhenUnlinked: false,
            targetAnchor: Alignment.bottomLeft,
            offset: const Offset(0, AppSpace.s6),
            child: Align(
              alignment: Alignment.topLeft,
              child: TapRegion(
                groupId: this,
                child: SizedBox(
                  width: width,
                  child: _AutocompleteResultsPanel<T>(
                    loading: _loading,
                    searched: _searched,
                    results: _results,
                    labelOf: widget.labelOf,
                    leadingBuilder: widget.leadingBuilder,
                    onTap: _select,
                  ),
                ),
              ),
            ),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.label, style: context.text.labelMedium?.copyWith(color: c.textMed)),
            const SizedBox(height: AppSpace.s6),
            CompositedTransformTarget(
              link: _layerLink,
              child: TextField(
                key: _fieldKey,
                controller: _controller,
                focusNode: _focusNode,
                onChanged: _onChanged,
                decoration: appFieldDecoration(
                  context,
                  hintText: widget.hintText,
                  suffixIcon: _loading
                      ? const Padding(
                          padding: EdgeInsets.all(AppSpace.s14),
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : null,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AutocompleteResultsPanel<T> extends StatelessWidget {
  const _AutocompleteResultsPanel({
    required this.loading,
    required this.searched,
    required this.results,
    required this.labelOf,
    required this.leadingBuilder,
    required this.onTap,
  });

  final bool loading;
  final bool searched;
  final List<T> results;
  final String Function(T item) labelOf;
  final Widget Function(T item)? leadingBuilder;
  final ValueChanged<T> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      elevation: 0,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: Container(
        constraints: const BoxConstraints(maxHeight: 280),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: c.border),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF111111).withValues(alpha: 0.08),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: loading && results.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(AppSpace.s20),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            : (searched && results.isEmpty)
                ? Padding(
                    padding: const EdgeInsets.all(AppSpace.s20),
                    child: Text(
                      'No results',
                      style: context.text.bodyMedium?.copyWith(color: c.textMed),
                    ),
                  )
                : ListView.builder(
                    padding: EdgeInsets.zero,
                    shrinkWrap: true,
                    itemCount: results.length,
                    itemBuilder: (context, i) {
                      final item = results[i];
                      return InkWell(
                        onTap: () => onTap(item),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: AppSpace.s16, vertical: AppSpace.s12),
                          child: Row(
                            children: [
                              if (leadingBuilder != null) ...[
                                Container(
                                  width: 36,
                                  height: 36,
                                  padding: const EdgeInsets.all(AppSpace.s4),
                                  decoration: BoxDecoration(
                                    color: _neutralThumbBg,
                                    borderRadius: BorderRadius.circular(AppRadius.sm),
                                  ),
                                  clipBehavior: Clip.antiAlias,
                                  child: leadingBuilder!(item),
                                ),
                                const SizedBox(width: AppSpace.s12),
                              ],
                              Expanded(
                                child: Text(
                                  labelOf(item),
                                  overflow: TextOverflow.ellipsis,
                                  style: context.text.bodyMedium,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
