import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/ads_models.dart';
import '../../app/providers.dart';

final boostTiersProvider = FutureProvider.autoDispose<List<BoostTierDto>>(
  (ref) => ref.watch(stallApiProvider).boostTiers(),
);

final campaignsProvider = FutureProvider.autoDispose<List<CampaignDto>>(
  (ref) => ref.watch(stallApiProvider).campaigns(),
);

final campaignDetailProvider = FutureProvider.autoDispose.family<CampaignDetailDto, String>(
  (ref, id) => ref.watch(stallApiProvider).campaign(id),
);

final vendorAnalyticsProvider = FutureProvider.autoDispose.family<VendorAnalyticsDto, int>(
  (ref, days) => ref.watch(stallApiProvider).vendorAnalytics(days: days),
);

final courierAnalyticsProvider = FutureProvider.autoDispose.family<CourierAnalyticsDto, int>(
  (ref, days) => ref.watch(stallApiProvider).courierAnalytics(days: days),
);

final referralSummaryProvider = FutureProvider.autoDispose<ReferralSummaryDto>(
  (ref) => ref.watch(stallApiProvider).referralSummary(),
);

/// Sponsored strip for a placement slot — empty on error so it never blocks a feed.
final sponsoredProvider = FutureProvider.autoDispose.family<List<SponsoredCardDto>, String>(
  (ref, slot) async {
    try {
      return await ref.watch(stallApiProvider).sponsored(slot: slot, limit: 4);
    } catch (_) {
      return const [];
    }
  },
);
