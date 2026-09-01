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
