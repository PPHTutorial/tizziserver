import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../core/api_config.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';

/// The vendor's own "Edit shop profile" — name/bio/logo/banner. Deliberately
/// separate from `_OnboardingForm` (vendor_hub_screen.dart): onboarding also
/// re-opens a KYC case, which this must not do on every save.
class EditShopProfileScreen extends ConsumerStatefulWidget {
  const EditShopProfileScreen({super.key});

  @override
  ConsumerState<EditShopProfileScreen> createState() =>
      _EditShopProfileScreenState();
}

class _EditShopProfileScreenState
    extends ConsumerState<EditShopProfileScreen> {
  final _name = TextEditingController();
  final _bio = TextEditingController();
  String? _logoKey;
  String? _bannerKey;
  bool _initialized = false;
  bool _uploadingLogo = false;
  bool _uploadingBanner = false;
  bool _busy = false;
  String? _error;

  void _initFrom(VendorStatus s) {
    if (_initialized) return;
    _initialized = true;
    _name.text = s.displayName ?? '';
    _bio.text = s.bio ?? '';
    _logoKey = s.logo;
    _bannerKey = s.banner;
  }

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _pickAndUpload({required bool logo}) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: logo ? 800 : 1600,
    );
    if (picked == null) return;
    setState(() {
      if (logo) {
        _uploadingLogo = true;
      } else {
        _uploadingBanner = true;
      }
      _error = null;
    });
    try {
      final bytes = await picked.readAsBytes();
      final key = await ref
          .read(stallApiProvider)
          .uploadMedia(
            bytes: bytes,
            filename: picked.name,
            kind: logo ? 'vendorLogo' : 'vendorBanner',
          );
      if (mounted) {
        setState(() {
          if (logo) {
            _logoKey = key;
          } else {
            _bannerKey = key;
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) {
        setState(() {
          if (logo) {
            _uploadingLogo = false;
          } else {
            _uploadingBanner = false;
          }
        });
      }
    }
  }

  Future<void> _save() async {
    if (_name.text.trim().length < 2) {
      setState(() => _error = 'Store name is too short');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(stallApiProvider)
          .updateVendorProfile(
            displayName: _name.text.trim(),
            bio: _bio.text.trim(),
            logo: _logoKey,
            banner: _bannerKey,
          );
      ref.invalidate(vendorStatusProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(vendorStatusProvider);
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Edit shop profile'),
            Expanded(
              child: async.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: "Couldn't load your shop profile",
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(vendorStatusProvider),
                  ),
                ),
                data: (status) {
                  _initFrom(status);
                  return ListView(
                    padding: const EdgeInsets.only(bottom: AppSpace.s24),
                    children: [
                      _CoverPicker(
                        bannerKey: _bannerKey,
                        logoKey: _logoKey,
                        uploadingBanner: _uploadingBanner,
                        uploadingLogo: _uploadingLogo,
                        onTapBanner: () => _pickAndUpload(logo: false),
                        onTapLogo: () => _pickAndUpload(logo: true),
                        initial: (status.displayName ?? '?')
                            .characters
                            .first
                            .toUpperCase(),
                      ),
                      const SizedBox(height: AppSpace.s40),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpace.s16,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppField(
                              label: 'Store name',
                              hintText: 'e.g. Kumasi Gadget Store',
                              controller: _name,
                            ),
                            const SizedBox(height: AppSpace.s16),
                            AppField(
                              label: 'Bio (optional)',
                              hintText:
                                  'Tell shoppers what your store sells',
                              controller: _bio,
                              maxLines: 4,
                            ),
                            if (_error != null) InlineError(_error!),
                            const SizedBox(height: AppSpace.s24),
                            PrimaryButton(
                              label: 'Save',
                              loading: _busy,
                              onPressed: _busy ? null : _save,
                            ),
                          ],
                        ),
                      ),
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

class _CoverPicker extends StatelessWidget {
  const _CoverPicker({
    required this.bannerKey,
    required this.logoKey,
    required this.uploadingBanner,
    required this.uploadingLogo,
    required this.onTapBanner,
    required this.onTapLogo,
    required this.initial,
  });

  final String? bannerKey;
  final String? logoKey;
  final bool uploadingBanner;
  final bool uploadingLogo;
  final VoidCallback onTapBanner;
  final VoidCallback onTapLogo;
  final String initial;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        GestureDetector(
          onTap: uploadingBanner ? null : onTapBanner,
          child: AspectRatio(
            aspectRatio: 3,
            child: Container(
              color: c.surfaceSunken,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (bannerKey != null && bannerKey!.isNotEmpty)
                    Image.network(
                      mediaUrl(bannerKey!),
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    )
                  else
                    Center(
                      child: Icon(
                        AppIcons.camera,
                        size: 28,
                        color: c.textLow,
                      ),
                    ),
                  if (uploadingBanner)
                    ColoredBox(
                      color: Colors.black.withValues(alpha: 0.35),
                      child: const Center(
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        Positioned(
          left: AppSpace.s16,
          bottom: -32,
          child: GestureDetector(
            onTap: uploadingLogo ? null : onTapLogo,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: c.bg,
              ),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: c.primaryContainer,
                    backgroundImage: (logoKey == null || logoKey!.isEmpty)
                        ? null
                        : NetworkImage(mediaUrl(logoKey!)),
                    child: (logoKey == null || logoKey!.isEmpty)
                        ? Text(
                            initial,
                            style: context.text.headlineSmall?.copyWith(
                              color: c.onPrimaryContainer,
                            ),
                          )
                        : null,
                  ),
                  if (uploadingLogo)
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.black.withValues(alpha: 0.35),
                        ),
                        child: const Center(
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Material(
                      color: c.primary,
                      shape: const CircleBorder(),
                      child: const Padding(
                        padding: EdgeInsets.all(5),
                        child: Icon(
                          AppIcons.camera,
                          size: 12,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
