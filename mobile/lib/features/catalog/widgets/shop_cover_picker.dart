import 'package:flutter/material.dart';

import '../../../core/api_config.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';

/// Shop logo + banner picker (banner as a 3:1 cover, logo as an overlapping
/// circle avatar) — shared between "Edit shop profile" and vendor onboarding.
class ShopCoverPicker extends StatelessWidget {
  const ShopCoverPicker({
    super.key,
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
