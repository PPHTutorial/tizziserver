import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/catalog_models.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../../design/icons.dart';
import '../catalog_providers.dart';

/// Figma's `reviews-screen` frame — a dedicated full review list with a
/// 1-5* distribution bar chart. Product detail only ever showed a top-4
/// preview; this is the "see all" destination.
class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final product = ref.watch(productDetailProvider(slug));
    final reviews = ref.watch(productReviewsProvider(slug));

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Customer reviews'),
            if (product.valueOrNull?.title != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.s16,
                  0,
                  AppSpace.s16,
                  AppSpace.s8,
                ),
                child: Text(
                  product.valueOrNull!.title,
                  style: context.text.bodyMedium?.copyWith(color: c.textMed),
                ),
              ),
            Expanded(
              child: reviews.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => CenteredState.error(
                  title: 'Couldn\'t load reviews',
                  action: PrimaryButton(
                    label: 'Retry',
                    onPressed: () => ref.invalidate(productReviewsProvider(slug)),
                  ),
                ),
                data: (page) => ListView(
                  padding: const EdgeInsets.all(AppSpace.s16),
                  children: [
                    _RatingSummary(
                      avg: product.valueOrNull?.ratingAvg ?? 0,
                      total: page.total,
                      distribution: page.distribution,
                    ),
                    const SizedBox(height: AppSpace.s20),
                    if (page.items.isEmpty)
                      const CenteredState(
                        icon: AppIcons.star_border,
                        title: 'No reviews yet',
                        body: 'Be the first to share your experience.',
                      )
                    else
                      for (final r in page.items)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpace.s16),
                          child: _ReviewCard(review: r),
                        ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RatingSummary extends StatelessWidget {
  const _RatingSummary({
    required this.avg,
    required this.total,
    required this.distribution,
  });
  final double avg;
  final int total;
  final List<RatingBar> distribution;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Column(
            children: [
              Text(avg.toStringAsFixed(1), style: context.text.displaySmall),
              Text('out of 5', style: context.text.labelSmall?.copyWith(color: c.textMed)),
              const SizedBox(height: AppSpace.s4),
              Row(
                children: [
                  for (var i = 0; i < 5; i++)
                    Icon(
                      i < avg.round() ? AppIcons.star : AppIcons.star_border,
                      size: 14,
                      color: c.rating,
                    ),
                ],
              ),
              const SizedBox(height: AppSpace.s4),
              Text('$total reviews', style: context.text.labelSmall?.copyWith(color: c.textLow)),
            ],
          ),
          const SizedBox(width: AppSpace.s20),
          Expanded(
            child: Column(
              children: [
                for (final d in distribution)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Text('${d.star}★', style: context.text.labelSmall),
                        const SizedBox(width: AppSpace.s8),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(AppRadius.pill),
                            child: LinearProgressIndicator(
                              value: d.pct / 100,
                              minHeight: 6,
                              backgroundColor: c.surfaceSunken,
                              color: c.rating,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.s8),
                        SizedBox(
                          width: 32,
                          child: Text(
                            '${d.pct}%',
                            style: context.text.labelSmall?.copyWith(color: c.textMed),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});
  final ReviewDto review;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = review;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: c.primaryContainer,
                child: Text(
                  r.author.characters.first.toUpperCase(),
                  style: context.text.labelMedium?.copyWith(color: c.onPrimaryContainer),
                ),
              ),
              const SizedBox(width: AppSpace.s8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.author, style: context.text.titleSmall),
                    Row(
                      children: [
                        for (var i = 0; i < 5; i++)
                          Icon(
                            i < r.rating ? AppIcons.star : AppIcons.star_border,
                            size: 12,
                            color: c.rating,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if ((r.title ?? '').isNotEmpty) ...[
            const SizedBox(height: AppSpace.s8),
            Text(r.title!, style: context.text.titleSmall),
          ],
          if ((r.body ?? '').isNotEmpty) ...[
            const SizedBox(height: AppSpace.s4),
            Text(r.body!, style: context.text.bodyMedium?.copyWith(color: c.textMed)),
          ],
        ],
      ),
    );
  }
}
