import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../auth/auth_util.dart';
import '../catalog_providers.dart';

/// §25 screens 456–462 — the add / edit product wizard. Creates a DRAFT, then
/// offers to publish (`POST /vendors/products/{id}/publish`).
class ProductEditorScreen extends ConsumerWidget {
  const ProductEditorScreen({super.key, this.productId});
  final String? productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = productId;
    if (id == null) {
      return const Scaffold(body: SafeArea(child: _EditorBody()));
    }
    final async = ref.watch(myProductDetailProvider(id));
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => CenteredState.error(
            title: 'Couldn\'t load this listing',
            action: PrimaryButton(
              label: 'Retry',
              onPressed: () => ref.invalidate(myProductDetailProvider(id)),
            ),
          ),
          data: (existing) =>
              _EditorBody(productId: id, existing: existing),
        ),
      ),
    );
  }
}

class _EditorBody extends ConsumerStatefulWidget {
  const _EditorBody({this.productId, this.existing});
  final String? productId;
  final VendorProductDetail? existing;

  bool get isNew => productId == null;

  @override
  ConsumerState<_EditorBody> createState() => _EditorBodyState();
}

const _conditions = <(String, String)>[
  ('NEW', 'New'),
  ('USED', 'Used'),
  ('REFURBISHED', 'Refurbished'),
];

class _EditorBodyState extends ConsumerState<_EditorBody> {
  late final _title = TextEditingController(text: widget.existing?.title);
  late final _desc = TextEditingController(text: widget.existing?.description);
  late final _brand = TextEditingController(text: widget.existing?.brand);
  late final _price = TextEditingController(
    text: widget.existing?.priceMinor == null
        ? ''
        : (widget.existing!.priceMinor! / 100).toStringAsFixed(2),
  );
  late final _qty = TextEditingController(
    text: '${widget.existing?.quantity ?? 1}',
  );
  late final _image = TextEditingController(
    text: widget.existing?.images.firstOrNull,
  );
  String? _categoryId;
  late String _condition = widget.existing?.condition ?? 'NEW';
  bool _busy = false;
  String? _error;
  String? _createdId;
  late final String? _status = widget.existing?.status;
  late String? _offerStatus = widget.existing?.offerStatus;

  // Debounced brand text — feeds the live logo preview beside the Brand
  // field without firing a lookup on every keystroke.
  late String _debouncedBrand = widget.existing?.brand ?? '';
  Timer? _brandDebounce;

  void _onBrandChanged() {
    _brandDebounce?.cancel();
    _brandDebounce = Timer(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => _debouncedBrand = _brand.text.trim());
    });
  }

  // Category-specific fields (`Category.attributeSchema`), keyed by field
  // key. Created lazily per key the first time that field renders, so
  // switching category doesn't require pre-declaring every possible field.
  final Map<String, TextEditingController> _attrText = {};
  final Map<String, bool> _attrBool = {};
  final Map<String, String?> _attrSelect = {};

  String? get _effectiveId => _createdId ?? widget.productId;

  @override
  void initState() {
    super.initState();
    _categoryId = widget.existing?.categoryId;
    _brand.addListener(_onBrandChanged);
  }

  @override
  void dispose() {
    _brandDebounce?.cancel();
    _brand.removeListener(_onBrandChanged);
    for (final ctl in [_title, _desc, _brand, _price, _qty, _image]) {
      ctl.dispose();
    }
    for (final ctl in _attrText.values) {
      ctl.dispose();
    }
    super.dispose();
  }

  CategoryDto? _findCategory(List<CategoryDto> cats, String? id) {
    if (id == null) return null;
    for (final c in cats) {
      if (c.id == id) return c;
    }
    return null;
  }

  TextEditingController _attrTextController(String key) => _attrText
      .putIfAbsent(
        key,
        () => TextEditingController(
          text: widget.existing?.attributes[key]?.toString() ?? '',
        ),
      );

  bool _attrBoolValue(String key) =>
      _attrBool[key] ??= widget.existing?.attributes[key] == true;

  String? _attrSelectValue(String key) {
    if (!_attrSelect.containsKey(key)) {
      _attrSelect[key] = widget.existing?.attributes[key]?.toString();
    }
    return _attrSelect[key];
  }

  /// Reads the current value of every field in [schema] into a JSON-ready
  /// map, or returns a validation error if a required field is empty.
  (Map<String, dynamic>, String?) _collectAttributes(
    List<CategoryAttributeField> schema,
  ) {
    final out = <String, dynamic>{};
    for (final f in schema) {
      dynamic value;
      switch (f.type) {
        case 'boolean':
          value = _attrBoolValue(f.key);
          break;
        case 'select':
          value = _attrSelectValue(f.key);
          break;
        case 'number':
          final raw = _attrTextController(f.key).text.trim();
          value = raw.isEmpty ? null : num.tryParse(raw);
          break;
        default:
          final raw = _attrTextController(f.key).text.trim();
          value = raw.isEmpty ? null : raw;
      }
      if (f.required && (value == null || value == '')) {
        return (const <String, dynamic>{}, 'Fill in "${f.label}"');
      }
      if (value != null) out[f.key] = value;
    }
    return (out, null);
  }

  Widget _attributeFieldWidget(CategoryAttributeField f) {
    final label = f.required ? '${f.label} *' : f.label;
    switch (f.type) {
      case 'boolean':
        return SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: Text(label),
          value: _attrBoolValue(f.key),
          onChanged: (v) => setState(() => _attrBool[f.key] = v),
        );
      case 'select':
        return DropdownButtonFormField<String>(
          value: _attrSelectValue(f.key),
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
          ),
          items: [
            for (final opt in f.options)
              DropdownMenuItem(value: opt, child: Text(opt)),
          ],
          onChanged: (v) => setState(() => _attrSelect[f.key] = v),
        );
      case 'number':
        return AppField(
          label: label,
          controller: _attrTextController(f.key),
          keyboardType: TextInputType.number,
        );
      default:
        return AppField(label: label, controller: _attrTextController(f.key));
    }
  }

  int get _priceMinor =>
      ((double.tryParse(_price.text.trim()) ?? 0) * 100).round();

  bool get _valid =>
      _title.text.trim().length >= 3 &&
      _desc.text.trim().length >= 10 &&
      _categoryId != null &&
      _priceMinor > 0;

  Future<void> _save({required bool thenPublish}) async {
    if (!_valid) {
      setState(
        () => _error = 'Fill in title, description, category and price.',
      );
      return;
    }
    final schema =
        _findCategory(
          ref.read(flatCategoriesProvider).valueOrNull ?? const [],
          _categoryId,
        )?.attributeSchema ??
        const [];
    final (attributes, attrError) = _collectAttributes(schema);
    if (attrError != null) {
      setState(() => _error = attrError);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    final err = await runCatching(() async {
      final api = ref.read(stallApiProvider);
      final images = _image.text.trim().isEmpty
          ? <String>[]
          : [_image.text.trim()];

      if (_effectiveId == null) {
        _createdId = await api.createProduct(
          title: _title.text.trim(),
          description: _desc.text.trim(),
          categoryId: _categoryId!,
          priceMinor: _priceMinor,
          brand: _brand.text.trim().isEmpty ? null : _brand.text.trim(),
          condition: _condition,
          images: images,
          attributes: attributes,
        );
        await api.updateProduct(
          _createdId!,
          quantity: int.tryParse(_qty.text.trim()) ?? 1,
        );
      } else {
        await api.updateProduct(
          _effectiveId!,
          title: _title.text.trim(),
          description: _desc.text.trim(),
          condition: _condition,
          priceMinor: _priceMinor,
          images: images.isEmpty ? null : images,
          quantity: int.tryParse(_qty.text.trim()),
          attributes: attributes,
        );
      }
      if (thenPublish) await api.publishProduct(_effectiveId!);
    });

    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) {
      ref.invalidate(myProductsProvider(null));
      if (widget.productId != null) {
        ref.invalidate(myProductDetailProvider(widget.productId!));
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(thenPublish ? 'Product published.' : 'Draft saved.'),
        ),
      );
      context.pop();
    }
  }

  Future<void> _togglePause() async {
    final paused = _offerStatus != 'PAUSED';
    final ok = await confirmDialog(
      context,
      title: paused ? 'Pause this listing?' : 'Resume this listing?',
      message: paused
          ? 'Buyers won\'t be able to purchase it until you resume it.'
          : 'This listing becomes purchasable again immediately.',
      confirmLabel: paused ? 'Pause' : 'Resume',
      destructive: paused,
    );
    if (!ok || widget.productId == null) return;
    setState(() => _busy = true);
    final err = await runCatching(
      () => ref.read(stallApiProvider).setListingPaused(
        widget.productId!,
        paused,
      ),
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (err == null) _offerStatus = paused ? 'PAUSED' : 'ACTIVE';
    });
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    }
  }

  Future<void> _delete() async {
    final ok = await confirmDialog(
      context,
      title: 'Delete this listing?',
      message: 'It\'s removed from the storefront immediately. Past orders '
          'referencing it are unaffected.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok || widget.productId == null) return;
    setState(() => _busy = true);
    final err = await runCatching(
      () => ref.read(stallApiProvider).archiveProduct(widget.productId!),
    );
    if (!mounted) return;
    if (err != null) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
      return;
    }
    ref.invalidate(myProductsProvider(null));
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Listing deleted.')));
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final categories = ref.watch(flatCategoriesProvider);
    final selectedSchema =
        _findCategory(
          categories.valueOrNull ?? const [],
          _categoryId,
        )?.attributeSchema ??
        const <CategoryAttributeField>[];

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader(widget.isNew ? 'New product' : 'Edit product'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpace.s16),
                children: [
                  if (!widget.isNew && _status != null) ...[
                    AppCard(
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              'This listing is currently ${(_offerStatus ?? _status).toLowerCase()}',
                              style: context.text.bodyMedium,
                            ),
                          ),
                          StatusBadge(
                            _offerStatus ?? _status,
                            tone: switch (_offerStatus ?? _status) {
                              'ACTIVE' || 'PUBLISHED' => BadgeTone.success,
                              'PAUSED' => BadgeTone.warning,
                              'ARCHIVED' => BadgeTone.danger,
                              _ => BadgeTone.neutral,
                            },
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.s16),
                  ],
                  AppField(
                    label: 'Title',
                    hintText: 'e.g. Orbit A54 Phone',
                    controller: _title,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpace.s16),
                  AppField(
                    label: 'Description',
                    hintText: 'What makes this product great?',
                    controller: _desc,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpace.s16),
                  AppField(
                    label: 'Brand (optional)',
                    hintText: 'e.g. Orbit',
                    controller: _brand,
                    prefix: _debouncedBrand.isEmpty
                        ? null
                        : _BrandLogoPreview(name: _debouncedBrand),
                  ),
                  const SizedBox(height: AppSpace.s16),
                  Text('Condition', style: context.text.titleSmall),
                  const SizedBox(height: AppSpace.s8),
                  Wrap(
                    spacing: AppSpace.s8,
                    children: [
                      for (final (value, label) in _conditions)
                        ChoiceChip(
                          label: Text(label),
                          selected: _condition == value,
                          onSelected: (_) =>
                              setState(() => _condition = value),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.s16),
                  categories.when(
                    loading: () => const LinearProgressIndicator(),
                    error: (e, _) => Text(
                      'Couldn\'t load categories',
                      style: TextStyle(color: context.colors.error),
                    ),
                    data: (cats) => DropdownButtonFormField<String>(
                      value: _categoryId,
                      decoration: const InputDecoration(
                        labelText: 'Category',
                        border: OutlineInputBorder(),
                      ),
                      items: [
                        for (final cat in cats)
                          DropdownMenuItem(
                            value: cat.id,
                            child: Text(cat.name),
                          ),
                      ],
                      onChanged: (v) => setState(() => _categoryId = v),
                    ),
                  ),
                  if (selectedSchema.isNotEmpty) ...[
                    const SizedBox(height: AppSpace.s16),
                    Text('Category details', style: context.text.titleSmall),
                    const SizedBox(height: AppSpace.s8),
                    for (final f in selectedSchema) ...[
                      _attributeFieldWidget(f),
                      const SizedBox(height: AppSpace.s16),
                    ],
                  ],
                  const SizedBox(height: AppSpace.s16),
                  Row(
                    children: [
                      Expanded(
                        child: AppField(
                          label: 'Price',
                          hintText: '0.00',
                          controller: _price,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: AppSpace.s12),
                      Expanded(
                        child: AppField(
                          label: 'Stock qty',
                          hintText: '0',
                          controller: _qty,
                          keyboardType: TextInputType.number,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.s16),
                  AppField(
                    label: 'Image key (optional)',
                    controller: _image,
                    hintText: 'uploads/my-photo.jpg',
                  ),
                  InlineError(_error),
                  const SizedBox(height: AppSpace.s24),
                  PrimaryButton(
                    label: widget.isNew ? 'Save draft' : 'Save changes',
                    loading: _busy,
                    onPressed: () => _save(thenPublish: false),
                  ),
                  if (widget.isNew) ...[
                    const SizedBox(height: AppSpace.s12),
                    SecondaryButton(
                      label: 'Save & publish',
                      onPressed: _busy ? null : () => _save(thenPublish: true),
                    ),
                    const SizedBox(height: AppSpace.s8),
                    Text(
                      'Publishing needs at least one image and a price. Your offer goes live immediately.',
                      style: context.text.bodyMedium?.copyWith(
                        color: context.colors.textMed,
                      ),
                    ),
                  ],
                  if (!widget.isNew) ...[
                    const SizedBox(height: AppSpace.s24),
                    Text('Listing operations', style: context.text.titleSmall),
                    const SizedBox(height: AppSpace.s8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _busy ? null : _togglePause,
                            child: Text(
                              _offerStatus == 'PAUSED'
                                  ? 'Resume listing'
                                  : 'Pause listing',
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.s12),
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: c.error,
                              side: BorderSide(color: c.error),
                            ),
                            onPressed: _busy ? null : _delete,
                            child: const Text('Delete listing'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A small circular logo that fades in beside the Brand field once the
/// debounced text resolves to a real brand (curated map or Brandfetch) —
/// shows nothing while unresolved/loading so the field looks unchanged.
class _BrandLogoPreview extends ConsumerWidget {
  const _BrandLogoPreview({required this.name});
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logoUrl = ref.watch(brandLogoPreviewProvider(name)).valueOrNull;
    if (logoUrl == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(left: AppSpace.s12, right: AppSpace.s4),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: Image.network(
          logoUrl,
          width: 22,
          height: 22,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
        ),
      ),
    );
  }
}
