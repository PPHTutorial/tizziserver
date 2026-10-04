import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../../core/api_config.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import 'product_media_processor.dart';

/// Server-side cap (`images: z.array(...).max(8)` on the product routes).
const maxProductImages = 8;

/// Listing photos (first = cover) + one optional video. Owns picking,
/// processing and uploading; the parent only holds the resulting storage
/// keys and must not save while [onBusyChanged] reports true.
class ProductMediaEditor extends ConsumerStatefulWidget {
  const ProductMediaEditor({
    super.key,
    required this.images,
    required this.video,
    required this.onImagesChanged,
    required this.onVideoChanged,
    required this.onBusyChanged,
  });

  final List<String> images;
  final String? video;
  final ValueChanged<List<String>> onImagesChanged;
  final ValueChanged<String?> onVideoChanged;
  final ValueChanged<bool> onBusyChanged;

  @override
  ConsumerState<ProductMediaEditor> createState() => _ProductMediaEditorState();
}

class _ProductMediaEditorState extends ConsumerState<ProductMediaEditor> {
  String? _busyLabel;
  String? _error;
  bool _cleanBackground = false;

  int get _remaining => maxProductImages - widget.images.length;

  Future<T?> _busy<T>(String label, Future<T> Function() task) async {
    setState(() {
      _busyLabel = label;
      _error = null;
    });
    widget.onBusyChanged(true);
    try {
      return await task();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
      return null;
    } finally {
      if (mounted) setState(() => _busyLabel = null);
      widget.onBusyChanged(false);
    }
  }

  Future<void> _addPhotos(ImageSource source) async {
    final picker = ImagePicker();
    final List<XFile> picked;
    if (source == ImageSource.camera) {
      final shot = await picker.pickImage(source: ImageSource.camera);
      picked = shot == null ? const [] : [shot];
    } else {
      picked = await picker.pickMultiImage(limit: _remaining);
    }
    if (picked.isEmpty) return;

    final api = ref.read(stallApiProvider);
    final keys = [...widget.images];
    for (final (i, file) in picked.take(_remaining).indexed) {
      if (!mounted) return;
      final key = await _busy(
        picked.length > 1
            ? 'Preparing photo ${i + 1} of ${picked.length}…'
            : 'Preparing photo…',
        () async {
          final prepared = await prepareProductImage(
            file,
            removeBackground: _cleanBackground,
          );
          if (prepared == null) return null; // crop cancelled
          return api.uploadMedia(
            bytes: prepared.bytes,
            filename: prepared.filename,
            kind: 'product',
          );
        },
      );
      if (key != null) {
        keys.add(key);
        // Report each photo as it lands so a later failure doesn't lose the
        // ones already uploaded.
        widget.onImagesChanged([...keys]);
      }
    }
  }

  Future<void> _addVideo() async {
    final picked = await ImagePicker().pickVideo(
      source: ImageSource.gallery,
      maxDuration: const Duration(seconds: 60),
    );
    if (picked == null || !mounted) return;
    final key = await _busy('Optimizing video… this can take a minute', () async {
      final prepared = await prepareProductVideo(picked);
      return ref
          .read(stallApiProvider)
          .uploadMedia(
            bytes: prepared.bytes,
            filename: prepared.filename,
            kind: 'productVideo',
          );
    });
    if (key != null) widget.onVideoChanged(key);
  }

  void _showAddPhotoSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(ctx);
                _addPhotos(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text('Choose from gallery (up to $_remaining)'),
              onTap: () {
                Navigator.pop(ctx);
                _addPhotos(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showPhotoActions(int index) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (index != 0)
              ListTile(
                leading: const Icon(Icons.star_outline),
                title: const Text('Make cover photo'),
                onTap: () {
                  Navigator.pop(ctx);
                  final keys = [...widget.images];
                  keys.insert(0, keys.removeAt(index));
                  widget.onImagesChanged(keys);
                },
              ),
            ListTile(
              leading: Icon(Icons.delete_outline, color: context.colors.error),
              title: Text(
                'Remove photo',
                style: TextStyle(color: context.colors.error),
              ),
              onTap: () {
                Navigator.pop(ctx);
                widget.onImagesChanged([...widget.images]..removeAt(index));
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final busy = _busyLabel != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Photos & video', style: context.text.titleSmall),
            ),
            Text(
              '${widget.images.length}/$maxProductImages',
              style: context.text.bodyMedium?.copyWith(
                color: context.colors.textMed,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.s4),
        Text(
          'The first photo is your cover. Tap a photo to reorder or remove it.',
          style: context.text.bodySmall?.copyWith(
            color: context.colors.textMed,
          ),
        ),
        const SizedBox(height: AppSpace.s12),
        Wrap(
          spacing: AppSpace.s8,
          runSpacing: AppSpace.s8,
          children: [
            for (final (i, key) in widget.images.indexed)
              _PhotoTile(
                url: mediaUrl(key),
                isCover: i == 0,
                onTap: busy ? null : () => _showPhotoActions(i),
              ),
            if (_remaining > 0)
              _AddTile(
                icon: Icons.add_a_photo_outlined,
                label: 'Add photo',
                onTap: busy ? null : _showAddPhotoSheet,
              ),
          ],
        ),
        if (backgroundRemovalSupported)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _cleanBackground,
            onChanged: busy ? null : (v) => setState(() => _cleanBackground = v),
            title: const Text('White background'),
            subtitle: const Text(
              'Automatically removes the background from new photos',
            ),
          ),
        const SizedBox(height: AppSpace.s8),
        if (widget.video == null)
          OutlinedButton.icon(
            onPressed: busy ? null : _addVideo,
            icon: const Icon(Icons.videocam_outlined),
            label: const Text('Add a video (up to 60s)'),
          )
        else
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.s12,
              vertical: AppSpace.s8,
            ),
            decoration: BoxDecoration(
              color: context.colors.surfaceSunken,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Row(
              children: [
                Icon(Icons.play_circle_outline, color: context.colors.primary),
                const SizedBox(width: AppSpace.s8),
                const Expanded(child: Text('Product video added')),
                TextButton(
                  onPressed: busy ? null : () => widget.onVideoChanged(null),
                  child: const Text('Remove'),
                ),
              ],
            ),
          ),
        if (busy) ...[
          const SizedBox(height: AppSpace.s12),
          const LinearProgressIndicator(),
          const SizedBox(height: AppSpace.s4),
          Text(_busyLabel!, style: context.text.bodySmall),
        ],
        InlineError(_error),
      ],
    );
  }
}

const _tileSize = 88.0;

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.url, required this.isCover, this.onTap});
  final String url;
  final bool isCover;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: SizedBox.square(
          dimension: _tileSize,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => ColoredBox(
                  color: context.colors.surfaceSunken,
                  child: const Icon(Icons.broken_image_outlined),
                ),
              ),
              if (isCover)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    color: context.colors.primary,
                    padding: const EdgeInsets.symmetric(vertical: AppSpace.s2),
                    child: Text(
                      'Cover',
                      textAlign: TextAlign.center,
                      style: context.text.labelSmall?.copyWith(
                        color: context.colors.onPrimary,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddTile extends StatelessWidget {
  const _AddTile({required this.icon, required this.label, this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Container(
        width: _tileSize,
        height: _tileSize,
        decoration: BoxDecoration(
          border: Border.all(color: context.colors.borderStrong),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: context.colors.textMed),
            const SizedBox(height: AppSpace.s4),
            Text(label, style: context.text.labelSmall),
          ],
        ),
      ),
    );
  }
}
