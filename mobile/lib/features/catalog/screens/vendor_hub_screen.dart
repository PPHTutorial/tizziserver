import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../api/catalog_models.dart';
import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../auth/auth_util.dart';
import '../catalog_providers.dart';
import '../widgets/location_picker.dart';
import '../widgets/services_picker.dart';
import '../widgets/shop_cover_picker.dart';
import '../widgets/theme_color_picker.dart';
import '../../../design/icons.dart';

/// §25 (vendor) screens 435–462 subset — the seller hub: onboarding →
/// KYC-pending → product management. Used both as a pushed screen and a
/// HomeShell tab body ([VendorHubBody]).
class VendorHubScreen extends ConsumerWidget {
  const VendorHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final platformName =
        ref.watch(bootstrapProvider).valueOrNull?.platform.name ?? 'Stall';
    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            AppScreenHeader('Sell on $platformName'),
            const Expanded(child: VendorHubBody()),
          ],
        ),
      ),
    );
  }
}

class VendorHubBody extends ConsumerWidget {
  const VendorHubBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vendorStatusProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => CenteredState.error(
        title: 'Couldn\'t load your seller account',
        action: PrimaryButton(
          label: 'Retry',
          onPressed: () => ref.invalidate(vendorStatusProvider),
        ),
      ),
      data: (status) {
        if (!status.onboarded) {
          return _OnboardingForm(
            onDone: () => ref.invalidate(vendorStatusProvider),
          );
        }
        if (status.isApproved) return const _SellerDashboard();
        return _KycPending(status: status);
      },
    );
  }
}

class _KycPending extends StatelessWidget {
  const _KycPending({required this.status});
  final VendorStatus status;

  @override
  Widget build(BuildContext context) {
    final rejected = status.kycStatus == 'REJECTED';
    return CenteredState(
      icon: rejected ? AppIcons.gpp_bad : AppIcons.hourglass_top,
      title: rejected
          ? 'Your application needs changes'
          : 'We\'re reviewing your application',
      body: rejected
          ? (status.note ?? 'Please review your business details and resubmit.')
          : 'This usually takes under a business day. You\'ll be able to list products once approved.',
    );
  }
}

class _OnboardingForm extends ConsumerStatefulWidget {
  const _OnboardingForm({required this.onDone});
  final VoidCallback onDone;

  @override
  ConsumerState<_OnboardingForm> createState() => _OnboardingFormState();
}

class _OnboardingFormState extends ConsumerState<_OnboardingForm> {
  final _display = TextEditingController();
  final _legal = TextEditingController();
  final _reg = TextEditingController();
  final _street = TextEditingController();
  final _city = TextEditingController();
  final _region = TextEditingController();
  final _country = TextEditingController(text: 'GH');

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
    for (final ctl in [_display, _legal, _reg, _street, _city, _region, _country]) {
      ctl.dispose();
    }
    super.dispose();
  }

  bool get _valid =>
      _display.text.trim().length >= 2 && _legal.text.trim().length >= 2;

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
      final key = await ref.read(stallApiProvider).uploadMedia(
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

  Future<void> _submit() async {
    if (!_valid) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final err = await runCatching(() async {
      await ref
          .read(stallApiProvider)
          .vendorOnboard(
            displayName: _display.text.trim(),
            logo: _logoKey,
            banner: _bannerKey,
            // The backend requires 3-7 colors when this field is present at
            // all — omit it entirely rather than send an under-sized array.
            themeColors: _themeColors.length >= 3 ? _themeColors : null,
            services: _services,
            business: {
              'legalName': _legal.text.trim(),
              if (_reg.text.trim().isNotEmpty) 'regNumber': _reg.text.trim(),
              if (_street.text.trim().isNotEmpty) 'addressLine': _street.text.trim(),
              if (_city.text.trim().isNotEmpty) 'city': _city.text.trim(),
              if (_region.text.trim().isNotEmpty) 'region': _region.text.trim(),
              'country': _country.text.trim().isEmpty ? 'GH' : _country.text.trim(),
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
    final c = context.colors;
    return ListView(
      padding: const EdgeInsets.all(AppSpace.s16),
      children: [
        Text('Set up your store', style: context.text.titleLarge),
        const SizedBox(height: AppSpace.s6),
        Text(
          'We\'ll open a KYC review. Approved stores can list products right away.',
          style: context.text.bodyMedium?.copyWith(color: c.textMed),
        ),
        const SizedBox(height: AppSpace.s20),

        Text('Store basics', style: context.text.titleMedium),
        const SizedBox(height: AppSpace.s8),
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
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'Business reg. number (optional)', hintText: 'e.g. BN-123456', controller: _reg),

        const SizedBox(height: AppSpace.s24),
        Text('Branding', style: context.text.titleMedium),
        const SizedBox(height: AppSpace.s8),
        ShopCoverPicker(
          bannerKey: _bannerKey,
          logoKey: _logoKey,
          uploadingBanner: _uploadingBanner,
          uploadingLogo: _uploadingLogo,
          onTapBanner: () => _pickAndUpload(logo: false),
          onTapLogo: () => _pickAndUpload(logo: true),
          initial: _display.text.trim().isEmpty ? '?' : _display.text.trim()[0].toUpperCase(),
        ),
        const SizedBox(height: AppSpace.s40),
        ThemeColorPicker(
          selected: _themeColors,
          onChanged: (v) => setState(() => _themeColors = v),
        ),

        const SizedBox(height: AppSpace.s24),
        Text('Location', style: context.text.titleMedium),
        const SizedBox(height: AppSpace.s8),
        AppField(label: 'Street address (optional)', hintText: 'e.g. 12 Oxford Street', controller: _street),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'City / town (optional)', hintText: 'e.g. Accra', controller: _city),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'State / region (optional)', hintText: 'e.g. Greater Accra', controller: _region),
        const SizedBox(height: AppSpace.s16),
        AppField(label: 'Country', hintText: 'e.g. GH', controller: _country),
        const SizedBox(height: AppSpace.s16),
        LocationPickerField(
          initialLat: _lat,
          initialLng: _lng,
          onChanged: (lat, lng) => setState(() {
            _lat = lat;
            _lng = lng;
          }),
        ),

        const SizedBox(height: AppSpace.s24),
        Text('Services', style: context.text.titleMedium),
        const SizedBox(height: AppSpace.s8),
        ServicesPicker(
          selected: _services,
          onChanged: (v) => setState(() => _services = v),
        ),

        InlineError(_error),
        const SizedBox(height: AppSpace.s24),
        PrimaryButton(
          label: 'Submit for review',
          loading: _busy,
          onPressed: _valid ? _submit : null,
        ),
      ],
    );
  }
}

class _SellerDashboard extends ConsumerStatefulWidget {
  const _SellerDashboard();

  @override
  ConsumerState<_SellerDashboard> createState() => _SellerDashboardState();
}

const _inventoryTabs = <(String, String)>[
  ('all', 'All'),
  ('active', 'Active'),
  ('paused', 'Paused'),
];

class _SellerDashboardState extends ConsumerState<_SellerDashboard> {
  String _tab = 'all';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(myProductsProvider(null));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myProductsProvider(null)),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [
            const SizedBox(height: 120),
            CenteredState.error(
              title: 'Couldn\'t load your products',
              action: PrimaryButton(
                label: 'Retry',
                onPressed: () => ref.invalidate(myProductsProvider(null)),
              ),
            ),
          ],
        ),
        data: (items) {
          final counts = {
            'all': items.length,
            'active': items.where((p) => p.offerStatus == 'ACTIVE').length,
            'paused': items.where((p) => p.offerStatus == 'PAUSED').length,
          };
          final visible = switch (_tab) {
            'active' => items.where((p) => p.offerStatus == 'ACTIVE').toList(),
            'paused' => items.where((p) => p.offerStatus == 'PAUSED').toList(),
            _ => items,
          };
          return ListView(
            padding: const EdgeInsets.all(AppSpace.s16),
            children: [
              const _StatsCard(),
              const SizedBox(height: AppSpace.s16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Your products', style: context.text.titleMedium),
                  FilledButton.icon(
                    onPressed: () => context.push(RoutePaths.newProduct),
                    icon: const Icon(AppIcons.add, size: 18),
                    label: const Text('Add'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 40),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.s8),
              OutlinedButton.icon(
                onPressed: () => context.push(RoutePaths.sellOrders),
                icon: const Icon(AppIcons.receipt_long_outlined, size: 18),
                label: const Text('Incoming orders'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                ),
              ),
              const SizedBox(height: AppSpace.s8),
              TextButton.icon(
                onPressed: () => context.push(RoutePaths.sellProfile),
                icon: const Icon(AppIcons.storefront_outlined, size: 18),
                label: const Text('Edit shop profile'),
              ),
              TextButton.icon(
                onPressed: () => context.push(RoutePaths.sellDocuments),
                icon: const Icon(AppIcons.description_outlined, size: 18),
                label: const Text('Verification'),
              ),
              const SizedBox(height: AppSpace.s12),
              Row(
                children: [
                  for (final (value, label) in _inventoryTabs) ...[
                    ChoiceChip(
                      label: Text('$label (${counts[value]})'),
                      selected: _tab == value,
                      onSelected: (_) => setState(() => _tab = value),
                    ),
                    const SizedBox(width: AppSpace.s8),
                  ],
                ],
              ),
              const SizedBox(height: AppSpace.s12),
              if (visible.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpace.s40),
                  child: CenteredState(
                    icon: AppIcons.inventory_2_outlined,
                    title: 'No products here',
                  ),
                ),
              for (final p in visible)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpace.s12),
                  child: AppCard(
                    onTap: () => context.push(RoutePaths.editProduct(p.id)),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.titleSmall,
                              ),
                              const SizedBox(height: AppSpace.s4),
                              Text(
                                [
                                  formatMoney(p.priceMinor, p.currency),
                                  'Stock: ${p.quantity}',
                                  'Views: ${p.viewCount}',
                                ].join(' · '),
                                style: context.text.bodySmall?.copyWith(
                                  color: c.textMed,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpace.s8),
                        _StatusChip(status: p.status),
                        const SizedBox(width: AppSpace.s4),
                        Icon(AppIcons.chevron_right, color: c.textLow),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _StatsCard extends ConsumerWidget {
  const _StatsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(vendorStatsProvider);
    return AppCard(
      padding: const EdgeInsets.all(AppSpace.s16),
      child: async.when(
        loading: () => const SizedBox(
          height: 48,
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (e, _) => Text(
          'Stats unavailable',
          style: context.text.bodyMedium?.copyWith(color: c.textMed),
        ),
        data: (s) => Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _Stat(label: 'Live', value: '${s.published}'),
            _Stat(label: 'Drafts', value: '${s.draft}'),
            _Stat(label: 'Offers', value: '${s.activeOffers}'),
            _Stat(label: 'Views', value: '${s.productViews}'),
            _Stat(
              label: 'Rating',
              value: s.reviews == 0 ? '—' : s.ratingAvg.toStringAsFixed(1),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: context.text.titleLarge),
        Text(
          label,
          style: context.text.labelSmall?.copyWith(
            color: context.colors.textMed,
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final tone = switch (status) {
      'PUBLISHED' => BadgeTone.success,
      'DRAFT' => BadgeTone.neutral,
      _ => BadgeTone.danger,
    };
    return StatusBadge(status, tone: tone);
  }
}
