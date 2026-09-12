import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../../core/api_config.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../auth/auth_util.dart';
import '../catalog_providers.dart';

class _DocSpec {
  const _DocSpec(this.type, this.label, {this.required = false});
  final String type;
  final String label;
  final bool required;
}

const _docSpecs = <_DocSpec>[
  _DocSpec('ID_FRONT', 'Government ID — front', required: true),
  _DocSpec('ID_BACK', 'Government ID — back', required: true),
  _DocSpec('PROOF_ADDRESS', 'Proof of address', required: true),
  _DocSpec('BUSINESS_REG', 'Business registration (optional)'),
  _DocSpec('OTHER', 'Other document (optional)'),
];

/// Vendor verification — real camera/gallery capture for ID + address
/// documents, plus a dedicated selfie step. Submits everything in one batch
/// to `POST /api/v1/vendors/kyc`, which lands on the same admin-reviewed
/// `KycCase`/`KycDocument`/`LivenessCheck` system courier onboarding uses —
/// not stored anywhere the ops console can't see.
class VendorKycScreen extends ConsumerStatefulWidget {
  const VendorKycScreen({super.key});

  @override
  ConsumerState<VendorKycScreen> createState() => _VendorKycScreenState();
}

class _VendorKycScreenState extends ConsumerState<VendorKycScreen> {
  final Map<String, String?> _keys = {for (final d in _docSpecs) d.type: null};
  final Map<String, bool> _uploading = {for (final d in _docSpecs) d.type: false};
  String? _selfieKey;
  bool _uploadingSelfie = false;
  bool _busy = false;
  String? _error;

  bool get _ready =>
      _docSpecs.where((d) => d.required).every((d) => _keys[d.type] != null) && _selfieKey != null;

  Future<ImageSource?> _chooseSource() => showModalBottomSheet<ImageSource>(
        context: context,
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(AppIcons.camera),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(context, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(AppIcons.upload_file),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.pop(context, ImageSource.gallery),
              ),
            ],
          ),
        ),
      );

  Future<void> _captureDoc(String type) async {
    final source = await _chooseSource();
    if (source == null) return;
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 85, maxWidth: 1600);
    if (picked == null) return;
    setState(() {
      _uploading[type] = true;
      _error = null;
    });
    try {
      final bytes = await picked.readAsBytes();
      final key = await ref.read(stallApiProvider).uploadMedia(
            bytes: bytes,
            filename: picked.name,
            kind: 'vendorKycDoc',
          );
      if (mounted) setState(() => _keys[type] = key);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _uploading[type] = false);
    }
  }

  Future<void> _captureSelfie() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 85,
      maxWidth: 1200,
    );
    if (picked == null) return;
    setState(() {
      _uploadingSelfie = true;
      _error = null;
    });
    try {
      final bytes = await picked.readAsBytes();
      final key = await ref.read(stallApiProvider).uploadMedia(
            bytes: bytes,
            filename: picked.name,
            kind: 'vendorKycSelfie',
          );
      if (mounted) setState(() => _selfieKey = key);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _uploadingSelfie = false);
    }
  }

  Future<void> _submit() async {
    if (!_ready) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await runCatching(() async {
      await ref.read(stallApiProvider).vendorSubmitKyc(
            documents: [
              for (final d in _docSpecs)
                if (_keys[d.type] != null) {'type': d.type, 'fileKey': _keys[d.type]!},
            ],
            selfieKey: _selfieKey,
          );
    });
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) {
      ref.invalidate(vendorStatusProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Submitted — we\'ll review your application shortly.')),
      );
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Verification'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpace.s16),
                children: [
                  Text(
                    'Confirm your identity and business address so we can approve your store.',
                    style: context.text.bodyMedium?.copyWith(color: c.textMed),
                  ),
                  const SizedBox(height: AppSpace.s16),
                  for (final d in _docSpecs)
                    _DocTile(
                      label: d.label,
                      done: _keys[d.type] != null,
                      busy: _uploading[d.type] ?? false,
                      fileKey: _keys[d.type],
                      onTap: () => _captureDoc(d.type),
                    ),
                  _DocTile(
                    label: 'Selfie',
                    done: _selfieKey != null,
                    busy: _uploadingSelfie,
                    fileKey: _selfieKey,
                    onTap: _captureSelfie,
                  ),
                  if (_error != null) InlineError(_error!),
                  const SizedBox(height: AppSpace.s16),
                  PrimaryButton(
                    label: 'Submit for review',
                    loading: _busy,
                    onPressed: _ready ? _submit : null,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DocTile extends StatelessWidget {
  const _DocTile({
    required this.label,
    required this.done,
    required this.busy,
    required this.fileKey,
    required this.onTap,
  });

  final String label;
  final bool done;
  final bool busy;
  final String? fileKey;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      onTap: busy ? null : onTap,
      child: Row(
        children: [
          if (done && fileKey != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.sm),
              child: Image.network(
                mediaUrl(fileKey!),
                width: 44,
                height: 44,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Icon(AppIcons.check_circle, color: c.success),
              ),
            )
          else
            Icon(AppIcons.upload_file, color: c.textMed),
          const SizedBox(width: AppSpace.s12),
          Expanded(child: Text(label, style: context.text.bodyMedium)),
          if (busy)
            const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          else
            TextButton(onPressed: onTap, child: Text(done ? 'Replace' : 'Add')),
        ],
      ),
    );
  }
}
