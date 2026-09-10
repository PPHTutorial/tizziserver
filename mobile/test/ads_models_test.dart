import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/ads_models.dart';

void main() {
  test('BoostTierDto parses + computes the rank multiplier', () {
    final t = BoostTierDto.fromJson({
      'id': 't1',
      'key': 'premium',
      'name': 'Premium',
      'description': 'Top of search',
      'billingModel': 'CPM',
      'priceMinor': 6000,
      'rankBoostBps': 13000,
      'placements': ['HOME_RAIL', 'SEARCH_TOP'],
      'badge': 'Featured',
    });
    expect(t.rankMultiplier, closeTo(1.3, 0.001));
    expect(t.placements, contains('HOME_RAIL'));
  });

  test('CampaignDto derives spend %, remaining, and edit/live flags', () {
    final c = CampaignDto.fromJson({
      'id': 'c1',
      'name': 'Back to school',
      'objective': 'PRODUCT_SALES',
      'status': 'ACTIVE',
      'budgetMinor': 10000,
      'spentMinor': 2500,
      'productIds': ['p1', 'p2'],
      'tier': {'name': 'Premium'},
      'startsAt': '2026-09-02T00:00:00.000Z',
      'endsAt': null,
      'rejectionReason': null,
    });
    expect(c.spentPct, closeTo(0.25, 0.001));
    expect(c.remainingMinor, 7500);
    expect(c.isLive, true);
    expect(c.isEditable, false);
    expect(c.tierName, 'Premium');
  });

  test('CampaignDetailDto rolls performance + creatives', () {
    final d = CampaignDetailDto.fromJson({
      'id': 'c1',
      'name': 'x',
      'objective': 'PRODUCT_SALES',
      'status': 'ACTIVE',
      'budgetMinor': 10000,
      'spentMinor': 100,
      'productIds': [],
      'ads': [
        {'id': 'a1', 'slot': 'HOME_RAIL', 'creativeKind': 'PRODUCT_CARD', 'headline': 'Hi', 'imageKey': null, 'productId': 'p1', 'isActive': true},
      ],
      'performance': {'impressions': 500, 'clicks': 10, 'conversions': 2, 'ctr': 2.0, 'spentMinor': 100, 'budgetMinor': 10000, 'remainingMinor': 9900},
    });
    expect(d.performance.impressions, 500);
    expect(d.performance.ctr, 2.0);
    expect(d.creatives.single['slot'], 'HOME_RAIL');
  });

  test('VendorAnalyticsDto flattens sales / customers / advertising', () {
    final a = VendorAnalyticsDto.fromJson({
      'range': {'from': 'x', 'to': 'y', 'days': 30},
      'sales': {'grossMinor': 500000, 'netMinor': 450000, 'commissionMinor': 50000, 'orderCount': 20, 'units': 33, 'aovMinor': 25000, 'series': [{'day': '2026-09-01', 'value': 100}]},
      'topProducts': [{'productId': 'p1', 'title': 'Phone', 'units': 5, 'revenueMinor': 90000}],
      'customers': {'unique': 12, 'returning': 4, 'new': 8},
      'payouts': {'balanceMinor': 75000, 'paidOutMinor': 400000, 'pendingPayoutMinor': 50000, 'recent': []},
      'ratings': {'avg': 4.6, 'count': 18},
      'advertising': {'spendMinor': 20000, 'revenueMinor': 60000, 'roas': 3.0, 'impressions': 4000, 'clicks': 120, 'ctr': 3.0},
    });
    expect(a.days, 30);
    expect(a.grossMinor, 500000);
    expect(a.customersReturning, 4);
    expect(a.balanceMinor, 75000);
    expect(a.roas, 3.0);
    expect(a.salesSeries.single.value, 100);
    expect(a.topProducts.single['title'], 'Phone');
  });

  test('ReferralSummaryDto reads counts', () {
    final r = ReferralSummaryDto.fromJson({
      'code': 'ABCD1234',
      'rewardPerReferralMinor': 2000,
      'qualifyMinOrderMinor': 5000,
      'counts': {'pending': 2, 'qualified': 1, 'rewarded': 3},
      'rewardedMinor': 6000,
      'items': [{'id': 'r1', 'status': 'REWARDED', 'rewardMinor': 2000, 'at': 'x', 'rewardedAt': 'y'}],
    });
    expect(r.code, 'ABCD1234');
    expect(r.rewarded, 3);
    expect(r.rewardedMinor, 6000);
    expect(r.items.single['status'], 'REWARDED');
  });
}
