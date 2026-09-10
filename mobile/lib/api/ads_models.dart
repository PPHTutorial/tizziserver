// Phase 7 — advertising / boosting / analytics / referrals models.
// Mirrors packages/contracts/src/ads.ts.

int _i(dynamic v) => v == null ? 0 : (v as num).toInt();
double _d(dynamic v) => v == null ? 0 : (v as num).toDouble();
String _s(dynamic v) => (v as String?) ?? '';
DateTime? _dt(dynamic v) => v == null ? null : DateTime.tryParse(v as String);
List<Map<String, dynamic>> _list(dynamic v) =>
    (v as List<dynamic>? ?? const []).map((e) => (e as Map).cast<String, dynamic>()).toList();

class BoostTierDto {
  const BoostTierDto({
    required this.id,
    required this.key,
    required this.name,
    this.description,
    required this.billingModel,
    required this.priceMinor,
    required this.rankBoostBps,
    required this.placements,
    this.badge,
  });
  final String id;
  final String key;
  final String name;
  final String? description;
  final String billingModel;
  final int priceMinor;
  final int rankBoostBps;
  final List<String> placements;
  final String? badge;

  double get rankMultiplier => rankBoostBps / 10000.0;

  factory BoostTierDto.fromJson(Map<String, dynamic> j) => BoostTierDto(
        id: _s(j['id']),
        key: _s(j['key']),
        name: _s(j['name']),
        description: j['description'] as String?,
        billingModel: _s(j['billingModel']),
        priceMinor: _i(j['priceMinor']),
        rankBoostBps: _i(j['rankBoostBps']),
        placements: (j['placements'] as List<dynamic>? ?? const []).cast<String>(),
        badge: j['badge'] as String?,
      );
}

class CampaignDto {
  const CampaignDto({
    required this.id,
    required this.name,
    required this.objective,
    required this.status,
    required this.budgetMinor,
    required this.spentMinor,
    required this.productIds,
    this.tierName,
    this.startsAt,
    this.endsAt,
    this.rejectionReason,
  });
  final String id;
  final String name;
  final String objective;
  final String status;
  final int budgetMinor;
  final int spentMinor;
  final List<String> productIds;
  final String? tierName;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final String? rejectionReason;

  int get remainingMinor => (budgetMinor - spentMinor).clamp(0, budgetMinor);
  double get spentPct => budgetMinor == 0 ? 0 : (spentMinor / budgetMinor).clamp(0, 1).toDouble();
  bool get isLive => status == 'ACTIVE';
  bool get isEditable => status == 'DRAFT' || status == 'REJECTED';

  factory CampaignDto.fromJson(Map<String, dynamic> j) => CampaignDto(
        id: _s(j['id']),
        name: _s(j['name']),
        objective: _s(j['objective']),
        status: _s(j['status']),
        budgetMinor: _i(j['budgetMinor']),
        spentMinor: _i(j['spentMinor']),
        productIds: (j['productIds'] as List<dynamic>? ?? const []).cast<String>(),
        tierName: (j['tier'] as Map?)?['name'] as String?,
        startsAt: _dt(j['startsAt']),
        endsAt: _dt(j['endsAt']),
        rejectionReason: j['rejectionReason'] as String?,
      );
}

class CampaignPerfDto {
  const CampaignPerfDto({
    required this.impressions,
    required this.clicks,
    required this.conversions,
    required this.ctr,
    required this.spentMinor,
    required this.budgetMinor,
    required this.remainingMinor,
  });
  final int impressions;
  final int clicks;
  final int conversions;
  final double ctr;
  final int spentMinor;
  final int budgetMinor;
  final int remainingMinor;

  factory CampaignPerfDto.fromJson(Map<String, dynamic> j) => CampaignPerfDto(
        impressions: _i(j['impressions']),
        clicks: _i(j['clicks']),
        conversions: _i(j['conversions']),
        ctr: _d(j['ctr']),
        spentMinor: _i(j['spentMinor']),
        budgetMinor: _i(j['budgetMinor']),
        remainingMinor: _i(j['remainingMinor']),
      );
}

class CampaignDetailDto {
  const CampaignDetailDto({required this.campaign, required this.performance, required this.creatives});
  final CampaignDto campaign;
  final CampaignPerfDto performance;
  final List<Map<String, dynamic>> creatives;

  factory CampaignDetailDto.fromJson(Map<String, dynamic> j) => CampaignDetailDto(
        campaign: CampaignDto.fromJson(j),
        performance: CampaignPerfDto.fromJson((j['performance'] as Map?)?.cast<String, dynamic>() ?? const {}),
        creatives: _list(j['ads']),
      );
}

class SponsoredCardDto {
  const SponsoredCardDto({
    required this.campaignId,
    this.adId,
    required this.slot,
    this.headline,
    this.subtext,
    this.imageKey,
    this.destinationRoute,
    this.badge,
    this.productSlug,
    this.productTitle,
    this.productImage,
    this.fromPriceMinor,
    this.currency = 'GHS',
  });
  final String campaignId;
  final String? adId;
  final String slot;
  final String? headline;
  final String? subtext;
  final String? imageKey;
  final String? destinationRoute;
  final String? badge;
  final String? productSlug;
  final String? productTitle;
  final String? productImage;
  final int? fromPriceMinor;
  final String currency;

  factory SponsoredCardDto.fromJson(Map<String, dynamic> j) {
    final p = (j['product'] as Map?)?.cast<String, dynamic>();
    return SponsoredCardDto(
      campaignId: _s(j['campaignId']),
      adId: j['adId'] as String?,
      slot: _s(j['slot']),
      headline: j['headline'] as String?,
      subtext: j['subtext'] as String?,
      imageKey: j['imageKey'] as String?,
      destinationRoute: j['destinationRoute'] as String?,
      badge: j['badge'] as String?,
      productSlug: p?['slug'] as String?,
      productTitle: p?['title'] as String?,
      productImage: p?['image'] as String?,
      fromPriceMinor: (p?['fromPriceMinor'] as num?)?.toInt(),
      currency: (p?['currency'] as String?) ?? 'GHS',
    );
  }
}

class SeriesPoint {
  const SeriesPoint(this.day, this.value);
  final String day;
  final double value;
  factory SeriesPoint.fromJson(Map<String, dynamic> j) => SeriesPoint(_s(j['day']), _d(j['value']));
}

List<SeriesPoint> _series(dynamic v) => _list(v).map(SeriesPoint.fromJson).toList();

class VendorAnalyticsDto {
  const VendorAnalyticsDto({
    required this.days,
    required this.grossMinor,
    required this.netMinor,
    required this.orderCount,
    required this.units,
    required this.aovMinor,
    required this.salesSeries,
    required this.topProducts,
    required this.customersUnique,
    required this.customersReturning,
    required this.balanceMinor,
    required this.paidOutMinor,
    required this.pendingPayoutMinor,
    required this.ratingAvg,
    required this.ratingCount,
    required this.adSpendMinor,
    required this.adRevenueMinor,
    required this.roas,
    required this.adImpressions,
    required this.adClicks,
    required this.adCtr,
  });
  final int days;
  final int grossMinor;
  final int netMinor;
  final int orderCount;
  final int units;
  final int aovMinor;
  final List<SeriesPoint> salesSeries;
  final List<Map<String, dynamic>> topProducts;
  final int customersUnique;
  final int customersReturning;
  final int balanceMinor;
  final int paidOutMinor;
  final int pendingPayoutMinor;
  final double ratingAvg;
  final int ratingCount;
  final int adSpendMinor;
  final int adRevenueMinor;
  final double roas;
  final int adImpressions;
  final int adClicks;
  final double adCtr;

  factory VendorAnalyticsDto.fromJson(Map<String, dynamic> j) {
    final sales = (j['sales'] as Map?)?.cast<String, dynamic>() ?? const {};
    final cust = (j['customers'] as Map?)?.cast<String, dynamic>() ?? const {};
    final pay = (j['payouts'] as Map?)?.cast<String, dynamic>() ?? const {};
    final rat = (j['ratings'] as Map?)?.cast<String, dynamic>() ?? const {};
    final adv = (j['advertising'] as Map?)?.cast<String, dynamic>() ?? const {};
    return VendorAnalyticsDto(
      days: _i((j['range'] as Map?)?['days']),
      grossMinor: _i(sales['grossMinor']),
      netMinor: _i(sales['netMinor']),
      orderCount: _i(sales['orderCount']),
      units: _i(sales['units']),
      aovMinor: _i(sales['aovMinor']),
      salesSeries: _series(sales['series']),
      topProducts: _list(j['topProducts']),
      customersUnique: _i(cust['unique']),
      customersReturning: _i(cust['returning']),
      balanceMinor: _i(pay['balanceMinor']),
      paidOutMinor: _i(pay['paidOutMinor']),
      pendingPayoutMinor: _i(pay['pendingPayoutMinor']),
      ratingAvg: _d(rat['avg']),
      ratingCount: _i(rat['count']),
      adSpendMinor: _i(adv['spendMinor']),
      adRevenueMinor: _i(adv['revenueMinor']),
      roas: _d(adv['roas']),
      adImpressions: _i(adv['impressions']),
      adClicks: _i(adv['clicks']),
      adCtr: _d(adv['ctr']),
    );
  }
}

class CourierAnalyticsDto {
  const CourierAnalyticsDto({
    required this.days,
    required this.completed,
    required this.cancelled,
    required this.lifetimeCompleted,
    required this.distanceKm,
    required this.completedSeries,
    required this.acceptanceRate,
    required this.onTimeRate,
    required this.netMinor,
    required this.perDeliveryMinor,
    required this.earningsSeries,
    required this.ratingAvg,
    required this.ratingCount,
  });
  final int days;
  final int completed;
  final int cancelled;
  final int lifetimeCompleted;
  final double distanceKm;
  final List<SeriesPoint> completedSeries;
  final int acceptanceRate;
  final int onTimeRate;
  final int netMinor;
  final int perDeliveryMinor;
  final List<SeriesPoint> earningsSeries;
  final double ratingAvg;
  final int ratingCount;

  factory CourierAnalyticsDto.fromJson(Map<String, dynamic> j) {
    final del = (j['deliveries'] as Map?)?.cast<String, dynamic>() ?? const {};
    final acc = (j['acceptance'] as Map?)?.cast<String, dynamic>() ?? const {};
    final ot = (j['onTime'] as Map?)?.cast<String, dynamic>() ?? const {};
    final earn = (j['earnings'] as Map?)?.cast<String, dynamic>() ?? const {};
    final rat = (j['ratings'] as Map?)?.cast<String, dynamic>() ?? const {};
    return CourierAnalyticsDto(
      days: _i((j['range'] as Map?)?['days']),
      completed: _i(del['completed']),
      cancelled: _i(del['cancelled']),
      lifetimeCompleted: _i(del['lifetimeCompleted']),
      distanceKm: _d(del['distanceKm']),
      completedSeries: _series(del['series']),
      acceptanceRate: _i(acc['rate']),
      onTimeRate: _i(ot['rate']),
      netMinor: _i(earn['netMinor']),
      perDeliveryMinor: _i(earn['perDeliveryMinor']),
      earningsSeries: _series(earn['series']),
      ratingAvg: _d(rat['avg']),
      ratingCount: _i(rat['count']),
    );
  }
}

class ReferralSummaryDto {
  const ReferralSummaryDto({
    required this.code,
    required this.rewardPerReferralMinor,
    required this.qualifyMinOrderMinor,
    required this.pending,
    required this.qualified,
    required this.rewarded,
    required this.rewardedMinor,
    required this.items,
  });
  final String code;
  final int rewardPerReferralMinor;
  final int qualifyMinOrderMinor;
  final int pending;
  final int qualified;
  final int rewarded;
  final int rewardedMinor;
  final List<Map<String, dynamic>> items;

  factory ReferralSummaryDto.fromJson(Map<String, dynamic> j) {
    final c = (j['counts'] as Map?)?.cast<String, dynamic>() ?? const {};
    return ReferralSummaryDto(
      code: _s(j['code']),
      rewardPerReferralMinor: _i(j['rewardPerReferralMinor']),
      qualifyMinOrderMinor: _i(j['qualifyMinOrderMinor']),
      pending: _i(c['pending']),
      qualified: _i(c['qualified']),
      rewarded: _i(c['rewarded']),
      rewardedMinor: _i(j['rewardedMinor']),
      items: _list(j['items']),
    );
  }
}
