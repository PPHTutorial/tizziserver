import { prisma } from "@stall/db";

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  path: string;
  sortOrder: number;
  children: CategoryNode[];
}

/** All active categories visible to a platform (empty `platformSlugs` ⇒ all). */
export async function listCategories(platformSlug: string) {
  return prisma.category.findMany({
    where: {
      isActive: true,
      OR: [{ platformSlugs: { isEmpty: true } }, { platformSlugs: { has: platformSlug } }],
    },
    orderBy: [{ path: "asc" }, { sortOrder: "asc" }],
  });
}

/** The same set, assembled into a tree. */
export async function categoryTree(platformSlug: string): Promise<CategoryNode[]> {
  const rows = await listCategories(platformSlug);
  const byId = new Map<string, CategoryNode>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.name,
      icon: r.icon,
      parentId: r.parentId,
      path: r.path,
      sortOrder: r.sortOrder,
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Resolve a category slug to its row + the `path` prefix used for subtree scans. */
export async function categoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export type CategoryFilter = "trending" | "new" | "auction";

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const LIVE_AUCTION_STATUSES = ["OPEN", "FILLING", "CLOSING"] as const;

/**
 * Top-level categories for the "Browse categories" grid, optionally ranked by
 * a real signal instead of just `sortOrder`:
 *  - `trending`: order-item volume (via the sub-order's `createdAt`) in the
 *    subtree over the last 14 days.
 *  - `new`: products published in the subtree over the last 14 days.
 *  - `auction`: categories with a currently sellable (OPEN/FILLING/CLOSING)
 *    Inverse Draw linked to one of their products.
 * Unfiltered categories with a zero count are dropped; the rest are ranked
 * by count descending.
 */
export async function rootCategories(platformSlug: string, filter?: CategoryFilter) {
  const roots = await prisma.category.findMany({
    where: {
      parentId: null,
      isActive: true,
      OR: [{ platformSlugs: { isEmpty: true } }, { platformSlugs: { has: platformSlug } }],
    },
    orderBy: { sortOrder: "asc" },
  });
  if (!filter) return roots.map((r) => ({ ...r, count: null as number | null }));

  const cutoff = new Date(Date.now() - LOOKBACK_MS);
  const withCounts = await Promise.all(
    roots.map(async (r) => {
      const subtree = await prisma.category.findMany({
        where: { OR: [{ id: r.id }, { path: { startsWith: `${r.path}/` } }] },
        select: { id: true },
      });
      const subtreeIds = subtree.map((s) => s.id);

      let count = 0;
      if (filter === "new") {
        count = await prisma.product.count({
          where: { categoryId: { in: subtreeIds }, publishedAt: { gte: cutoff } },
        });
      } else {
        const products = await prisma.product.findMany({
          where: { categoryId: { in: subtreeIds } },
          select: { id: true },
        });
        const productIds = products.map((p) => p.id);
        if (productIds.length > 0) {
          if (filter === "trending") {
            count = await prisma.orderItem.count({
              where: { productId: { in: productIds }, vendorOrder: { createdAt: { gte: cutoff } } },
            });
          } else if (filter === "auction") {
            count = await prisma.auction.count({
              where: {
                platformSlug,
                status: { in: [...LIVE_AUCTION_STATUSES] },
                productId: { in: productIds },
              },
            });
          }
        }
      }
      return { ...r, count };
    }),
  );
  return withCounts.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}
