/// Curated photography for the top-level "Browse categories" grid and the
/// home category rail. Categories have no `image` column in the DB (they're
/// presentation-only for these two spots), so this is a client-side
/// slug → URL map — same approach as `mediaUrl()`'s fallback for legacy
/// product keys, just scoped to the handful of root category slugs the
/// curated seed creates. Unknown slugs fall back to a stable picsum seed so
/// a future category never renders with nothing.
const Map<String, String> _categoryImages = {
  'electronics':
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
  'home-kitchen':
      'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800&q=80',
  'fashion':
      'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&q=80',
  'lpg-cylinders':
      'https://images.unsplash.com/photo-1622021211530-bc5944effe15?w=800&q=80',
  'gas-accessories':
      'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&q=80',
};

String categoryImage(String slug) =>
    _categoryImages[slug] ?? 'https://picsum.photos/seed/cat-$slug/800/800';
