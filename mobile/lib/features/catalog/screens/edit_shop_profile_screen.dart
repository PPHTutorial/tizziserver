import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../catalog_providers.dart';
import '../widgets/services_picker.dart';
import '../widgets/shop_cover_picker.dart';
import '../widgets/theme_color_picker.dart';

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
  List<String> _themeColors = const [];
  List<String> _services = const [];
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
    _themeColors = s.themeColors;
    _services = s.services;
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
            // The backend requires 3-7 colors when this field is present at
            // all — omit it entirely rather than send an under-sized array.
            themeColors: _themeColors.length >= 3 ? _themeColors : null,
            services: _services,
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
                      ShopCoverPicker(
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
                            const SizedBox(height: AppSpace.s24),
                            Text('Theme', style: context.text.titleMedium),
                            const SizedBox(height: AppSpace.s8),
                            ThemeColorPicker(
                              selected: _themeColors,
                              onChanged: (v) => setState(() => _themeColors = v),
                            ),
                            const SizedBox(height: AppSpace.s24),
                            Text('Services', style: context.text.titleMedium),
                            const SizedBox(height: AppSpace.s8),
                            ServicesPicker(
                              selected: _services,
                              onChanged: (v) => setState(() => _services = v),
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
