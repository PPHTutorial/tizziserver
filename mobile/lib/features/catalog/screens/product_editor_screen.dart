import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../auth/auth_util.dart';
import '../catalog_providers.dart';

/// §25 screens 456–462 — the add / edit product wizard. Creates a DRAFT, then
/// offers to publish (`POST /vendors/products/{id}/publish`).
class ProductEditorScreen extends ConsumerStatefulWidget {
  const ProductEditorScreen({super.key, this.productId});
  final String? productId;

  bool get isNew => productId == null;

  @override
  ConsumerState<ProductEditorScreen> createState() => _ProductEditorScreenState();
}

class _ProductEditorScreenState extends ConsumerState<ProductEditorScreen> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _brand = TextEditingController();
  final _price = TextEditingController();
  final _qty = TextEditingController(text: '1');
  final _image = TextEditingController();
  String? _categoryId;
  bool _busy = false;
  String? _error;
  String? _createdId;

  String? get _effectiveId => _createdId ?? widget.productId;

  @override
  void dispose() {
    for (final ctl in [_title, _desc, _brand, _price, _qty, _image]) {
      ctl.dispose();
    }
    super.dispose();
  }

  int get _priceMinor => ((double.tryParse(_price.text.trim()) ?? 0) * 100).round();

  bool get _valid =>
      _title.text.trim().length >= 3 &&
      _desc.text.trim().length >= 10 &&
      _categoryId != null &&
      _priceMinor > 0;

  Future<void> _save({required bool thenPublish}) async {
    if (!_valid && _effectiveId == null) {
      setState(() => _error = 'Fill in title, description, category and price.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });

    final err = await runCatching(() async {
      final api = ref.read(stallApiProvider);
      final images = _image.text.trim().isEmpty ? <String>[] : [_image.text.trim()];

      if (_effectiveId == null) {
        _createdId = await api.createProduct(
          title: _title.text.trim(),
          description: _desc.text.trim(),
          categoryId: _categoryId!,
          priceMinor: _priceMinor,
          brand: _brand.text.trim().isEmpty ? null : _brand.text.trim(),
          images: images,
        );
        await api.updateProduct(_createdId!, quantity: int.tryParse(_qty.text.trim()) ?? 1);
      } else {
        await api.updateProduct(
          _effectiveId!,
          title: _title.text.trim(),
          description: _desc.text.trim(),
          priceMinor: _priceMinor,
          images: images.isEmpty ? null : images,
          quantity: int.tryParse(_qty.text.trim()),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(thenPublish ? 'Product published.' : 'Draft saved.')),
      );
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(flatCategoriesProvider);

    return Scaffold(
      backgroundColor: context.colors.bg,
      appBar: AppBar(title: Text(widget.isNew ? 'New product' : 'Edit product')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s16),
        children: [
          AppField(label: 'Title', controller: _title, onChanged: (_) => setState(() {})),
          const SizedBox(height: AppSpace.s16),
          AppField(label: 'Description', controller: _desc, onChanged: (_) => setState(() {})),
          const SizedBox(height: AppSpace.s16),
          AppField(label: 'Brand (optional)', controller: _brand),
          const SizedBox(height: AppSpace.s16),
          categories.when(
            loading: () => const LinearProgressIndicator(),
            error: (e, _) => Text('Couldn\'t load categories',
                style: TextStyle(color: context.colors.error)),
            data: (cats) => DropdownButtonFormField<String>(
              value: _categoryId,
              decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder()),
              items: [
                for (final cat in cats)
                  DropdownMenuItem(value: cat.id, child: Text(cat.name)),
              ],
              onChanged: (v) => setState(() => _categoryId = v),
            ),
          ),
          const SizedBox(height: AppSpace.s16),
          Row(
            children: [
              Expanded(
                child: AppField(
                  label: 'Price',
                  controller: _price,
                  keyboardType: TextInputType.number,
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: AppSpace.s12),
              Expanded(
                child: AppField(label: 'Stock qty', controller: _qty, keyboardType: TextInputType.number),
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
            label: 'Save draft',
            loading: _busy,
            onPressed: () => _save(thenPublish: false),
          ),
          const SizedBox(height: AppSpace.s12),
          SecondaryButton(
            label: 'Save & publish',
            onPressed: _busy ? null : () => _save(thenPublish: true),
          ),
          const SizedBox(height: AppSpace.s8),
          Text(
            'Publishing needs at least one image and a price. Your offer goes live immediately.',
            style: context.text.bodyMedium?.copyWith(color: context.colors.textMed),
          ),
        ],
      ),
    );
  }
}
