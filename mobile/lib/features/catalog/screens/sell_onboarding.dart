import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
import '../../../design/countries.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../auth/auth_util.dart';
import '../../auth/country_picker.dart';
import '../widgets/location_picker.dart';
import '../widgets/services_picker.dart';
import '../widgets/shop_cover_picker.dart';
import '../widgets/theme_color_picker.dart';

/// "Sell on Stall" — the branded seller sign-up: an intro, then four short
/// steps (store → branding → location → services & review) that submit one
/// `POST /vendors/onboarding` and open a KYC case.
///
/// Deliberately separate from `EditShopProfileScreen`: everything collected
/// here (logo, banner, name, address, phone sharing) stays editable there
/// later without re-running onboarding or re-opening KYC.
class SellOnboardingFlow extends ConsumerStatefulWidget {
  const SellOnboardingFlow({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  ConsumerState<SellOnboardingFlow> createState() => _SellOnboardingFlowState();
}

const _stepTitles = ['Your store', 'Branding', 'Location', 'Services & review'];

class _SellOnboardingFlowState extends ConsumerState<SellOnboardingFlow> {
  bool _started = false;
  int _step = 0;

  final _display = TextEditingController();
  final _legal = TextEditingController();
  final _reg = TextEditingController();
  late final _phone = TextEditingController(
    text: ref.read(authControllerProvider).user?.phone ?? '',
  );
  final _street = TextEditingController();
  final _city = TextEditingController();
  final _region = TextEditingController();

  bool _showPhone = true;
  Country _country = kCountries.firstWhere(
    (c) => c.iso2 == 'GH',
    orElse: () => kCountries.first,
  );
  String? _logoKey;
  String? _bannerKey;
  bool _uploadingLogo = false;
  bool _uploadingBanner = false;
  List<String> _themeColors = const [];
  List<String> _services = const [];
  double? _lat;
  double? _lng;

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final ctl in [_display, _legal, _reg, _phone, _street, _city, _region]) {
      ctl.dispose();
    }
    super.dispose();
  }

  static final _phonePattern = RegExp(r'^\+?[0-9 ()-]{7,20}$');

  /// Why the current step can't advance, or null when it can.
  String? get _stepProblem {
    switch (_step) {
      case 0:
        if (_display.text.trim().length < 2) return 'Enter your store name.';
        if (_legal.text.trim().length < 2) {
          return 'Enter your registered business name.';
        }
        final phone = _phone.text.trim();
        if (phone.isNotEmpty && !_phonePattern.hasMatch(phone)) {
          return 'That phone number doesn\'t look right.';
        }
        if (_showPhone && phone.isEmpty) {
          return 'Add a business phone, or turn off "Let buyers call me".';
        }
        return null;
      case 1:
        if (_uploadingLogo || _uploadingBanner) return 'Wait for the upload to finish.';
        return null;
      case 2:
        if (_city.text.trim().isEmpty) return 'Enter the city or town your store is in.';
        return null;
      default:
        return null;
    }
  }

  void _next() {
    final problem = _stepProblem;
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _error = null;
      _step++;
    });
  }

  void _back() => setState(() {
        _error = null;
        if (_step == 0) {
          _started = false;
        } else {
          _step--;
        }
      });

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
      final key = await ref.read(stallApiProvider).uploadMedia(
            bytes: await picked.readAsBytes(),
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

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final reg = _reg.text.trim();
    final phone = _phone.text.trim();
    final street = _street.text.trim();
    final region = _region.text.trim();
    final err = await runCatching(() async {
      await ref.read(stallApiProvider).vendorOnboard(
            displayName: _display.text.trim(),
            logo: _logoKey,
            banner: _bannerKey,
            // The backend requires 3-7 colors when this field is present at
            // all — omit it entirely rather than send an under-sized array.
            themeColors: _themeColors.length >= 3 ? _themeColors : null,
            services: _services,
            showPhone: _showPhone,
            business: {
              'legalName': _legal.text.trim(),
              if (reg.isNotEmpty) 'regNumber': reg,
              if (phone.isNotEmpty) 'phone': phone,
              if (street.isNotEmpty) 'addressLine': street,
              'city': _city.text.trim(),
              if (region.isNotEmpty) 'region': region,
              'country': _country.iso2,
              if (_lat != null) 'lat': _lat,
              if (_lng != null) 'lng': _lng,
            },
          );
    });
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = err;
    });
    if (err == null) widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    if (!_started) {
      return _SellIntro(onStart: () => setState(() => _started = true));
    }
    final last = _step == _stepTitles.length - 1;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.s16,
            AppSpace.s12,
            AppSpace.s16,
            0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Step ${_step + 1} of ${_stepTitles.length}',
                style: context.text.labelMedium?.copyWith(
                  color: context.colors.textMed,
                ),
              ),
              const SizedBox(height: AppSpace.s4),
              Text(_stepTitles[_step], style: context.text.titleLarge),
              const SizedBox(height: AppSpace.s8),
              LinearProgressIndicator(
                value: (_step + 1) / _stepTitles.length,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpace.s16),
            children: [
              ...switch (_step) {
                0 => _storeStep(),
                1 => _brandingStep(),
                2 => _locationStep(),
                _ => _reviewStep(),
              },
              InlineError(_error),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.s16,
              0,
              AppSpace.s16,
              AppSpace.s12,
            ),
            child: Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: 'Back',
                    onPressed: _busy ? null : _back,
                  ),
                ),
                const SizedBox(width: AppSpace.s12),
                Expanded(
                  flex: 2,
                  child: PrimaryButton(
                    label: last ? 'Submit for review' : 'Continue',
                    loading: _busy,
                    onPressed: last ? _submit : _next,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  List<Widget> _storeStep() => [
        AppField(
          label: 'Store name',
          hintText: 'e.g. Kumasi Gadget Store',
          controller: _display,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.s16),
        AppField(
          label: 'Registered business name',
          hintText: 'As it appears on your certificate',
          controller: _legal,
        ),
        const SizedBox(height: AppSpace.s16),
        AppField(
          label: 'Business reg. number (optional)',
          hintText: 'e.g. BN-123456',
          controller: _reg,
        ),
        const SizedBox(height: AppSpace.s16),
        AppField(
          label: 'Business phone',
          hintText: '+233 20 000 0000',
          controller: _phone,
          keyboardType: TextInputType.phone,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _showPhone,
          onChanged: (v) => setState(() => _showPhone = v),
          title: const Text('Let buyers call me'),
          subtitle: const Text(
            'Buyers tap "Show number" on your listings to see it. You can change this anytime in shop settings.',
          ),
        ),
      ];

  List<Widget> _brandingStep() => [
        Text(
          'A cover and logo make your store look trustworthy. You can skip this and add them later.',
          style: context.text.bodyMedium?.copyWith(color: context.colors.textMed),
        ),
        const SizedBox(height: AppSpace.s16),
        ShopCoverPicker(
          bannerKey: _bannerKey,
          logoKey: _logoKey,
          uploadingBanner: _uploadingBanner,
          uploadingLogo: _uploadingLogo,
          onTapBanner: () => _pickAndUpload(logo: false),
          onTapLogo: () => _pickAndUpload(logo: true),
          initial: _display.text.trim().isEmpty
              ? '?'
              : _display.text.trim()[0].toUpperCase(),
        ),
        const SizedBox(height: AppSpace.s40),
        ThemeColorPicker(
          selected: _themeColors,
          onChanged: (v) => setState(() => _themeColors = v),
        ),
      ];

  List<Widget> _locationStep() => [
        AppField(
          label: 'Street address (optional)',
          hintText: 'e.g. 12 Oxford Street',
          controller: _street,
        ),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'City / town', hintText: 'e.g. Accra', controller: _city),
        const SizedBox(height: AppSpace.s16),
        AppField(
          label: 'State / region (optional)',
          hintText: 'e.g. Greater Accra',
          controller: _region,
        ),
        const SizedBox(height: AppSpace.s16),
        Text('Country', style: context.text.labelLarge),
        const SizedBox(height: AppSpace.s6),
        OutlinedButton(
          onPressed: () async {
            final picked = await showCountryPicker(context, selected: _country);
            if (picked != null) setState(() => _country = picked);
          },
          style: OutlinedButton.styleFrom(
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.all(AppSpace.s14),
          ),
          child: Row(
            children: [
              Text(_country.flag, style: const TextStyle(fontSize: 20)),
              const SizedBox(width: AppSpace.s8),
              Expanded(child: Text(_country.name)),
              const Icon(Icons.expand_more),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.s16),
        LocationPickerField(
          initialLat: _lat,
          initialLng: _lng,
          onChanged: (lat, lng) => setState(() {
            _lat = lat;
            _lng = lng;
          }),
        ),
      ];

  List<Widget> _reviewStep() {
    final address = [
      _street.text.trim(),
      _city.text.trim(),
      _region.text.trim(),
      _country.name,
    ].where((s) => s.isNotEmpty).join(', ');
    return [
      ServicesPicker(
        selected: _services,
        onChanged: (v) => setState(() => _services = v),
      ),
      const SizedBox(height: AppSpace.s24),
      Text('Review', style: context.text.titleMedium),
      const SizedBox(height: AppSpace.s8),
      _ReviewRow('Store', _display.text.trim()),
      _ReviewRow('Business', _legal.text.trim()),
      _ReviewRow(
        'Phone',
        _phone.text.trim().isEmpty
            ? 'Not provided'
            : '${_phone.text.trim()} · ${_showPhone ? 'buyers can call' : 'hidden from buyers'}',
      ),
      _ReviewRow('Address', address),
      _ReviewRow('Map pin', _lat == null ? 'Not set' : 'Set'),
      _ReviewRow(
        'Branding',
        [
          if (_logoKey != null) 'logo',
          if (_bannerKey != null) 'cover',
          if (_themeColors.length >= 3) 'theme',
        ].join(', ').ifEmpty('Not set'),
      ),
      const SizedBox(height: AppSpace.s12),
      Text(
        'We\'ll review your details (usually under a business day). You can list products as soon as you\'re approved.',
        style: context.text.bodyMedium?.copyWith(color: context.colors.textMed),
      ),
    ];
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpace.s4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 96,
              child: Text(
                label,
                style: context.text.bodyMedium?.copyWith(
                  color: context.colors.textMed,
                ),
              ),
            ),
            Expanded(child: Text(value, style: context.text.bodyMedium)),
          ],
        ),
      );
}

/// The branded landing before the form — what selling here gets you and
/// what to have ready.
class _SellIntro extends ConsumerWidget {
  const _SellIntro({required this.onStart});
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final platformName =
        ref.watch(bootstrapProvider).valueOrNull?.platform.name ?? 'Stall';
    return ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpace.s20),
          decoration: BoxDecoration(
            color: c.primaryContainer,
            borderRadius: BorderRadius.circular(AppRadius.xl),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(AppIcons.storefront_outlined, size: 40, color: c.onPrimaryContainer),
              const SizedBox(height: AppSpace.s12),
              Text(
                'Open your store on $platformName',
                style: context.text.headlineSmall?.copyWith(
                  color: c.onPrimaryContainer,
                ),
              ),
              const SizedBox(height: AppSpace.s6),
              Text(
                'Reach buyers near you. We handle payments and delivery.',
                style: context.text.bodyLarge?.copyWith(
                  color: c.onPrimaryContainer,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.s24),
        const _Perk(
          icon: AppIcons.near_me,
          title: 'Get found nearby',
          body: 'Your store shows up for buyers searching around your location.',
        ),
        const _Perk(
          icon: AppIcons.account_balance_wallet_outlined,
          title: 'Get paid to your wallet',
          body: 'Earnings go to your seller wallet, ready to withdraw.',
        ),
        const _Perk(
          icon: AppIcons.local_shipping_outlined,
          title: 'Delivery handled',
          body: 'Couriers pick up from your store and deliver to the buyer.',
        ),
        const _Perk(
          icon: AppIcons.verified_user_outlined,
          title: 'A verified badge',
          body: 'Every store is reviewed, so buyers know they can trust you.',
        ),
        const SizedBox(height: AppSpace.s16),
        Text(
          'Takes about 5 minutes. Have your registered business name ready; everything else is optional and editable later.',
          style: context.text.bodyMedium?.copyWith(color: c.textMed),
        ),
        const SizedBox(height: AppSpace.s20),
        PrimaryButton(label: 'Start selling', onPressed: onStart),
      ],
    );
  }
}

class _Perk extends StatelessWidget {
  const _Perk({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.s16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: context.colors.primary),
            const SizedBox(width: AppSpace.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall),
                  const SizedBox(height: AppSpace.s2),
                  Text(
                    body,
                    style: context.text.bodyMedium?.copyWith(
                      color: context.colors.textMed,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
