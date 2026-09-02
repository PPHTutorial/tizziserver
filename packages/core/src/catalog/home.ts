import { listProducts, type ProductCard } from "./products.ts";
import { activePromotions, type PromotionView } from "./promotions.ts";
import { listRecentlyViewed } from "./engagement.ts";

export interface HomeRails {
  flashDeals: PromotionView[];
  campaigns: PromotionView[];
  banners: PromotionView[];
  newArrivals: ProductCard[];
  topRated: ProductCard[];
  recentlyViewed: {
    productId: string;
    slug: string;
    title: string;
    image: string | null;
    fromPriceMinor: number | null;
    currency: string;
  }[];
}

/** One call for the customer home screen: promo rails + a couple of product rails. */
export async function homeRails(input: { platformSlug: string; userId?: string }): Promise<HomeRails> {
  const [promos, newArrivals, topRated, recent] = await Promise.all([
    activePromotions({ platformSlug: input.platformSlug }),
    listProducts({ platformSlug: input.platformSlug, sort: "newest", limit: 10 }),
    listProducts({ platformSlug: input.platformSlug, sort: "rating", limit: 10 }),
    input.userId ? listRecentlyViewed(input.userId, 10) : Promise.resolve([]),
  ]);

  return {
    flashDeals: promos.filter((p) => p.kind === "FLASH_DEAL"),
    campaigns: promos.filter((p) => p.kind === "CAMPAIGN"),
    banners: promos.filter((p) => p.kind === "BANNER"),
    newArrivals: newArrivals.items,
    topRated: topRated.items.filter((p) => p.ratingCount > 0),
    recentlyViewed: recent,
  };
}
