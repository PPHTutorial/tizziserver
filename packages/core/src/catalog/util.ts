// U+0300–U+036F: combining diacritical marks left over after NFKD.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

/** Append a short random suffix to keep slugs unique. */
export function uniqueSlug(base: string): string {
  const s = slugify(base) || "item";
  return `${s}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const clampLimit = (n: number | undefined, def = 20, max = 60): number =>
  Math.min(Math.max(1, Math.trunc(n ?? def)), max);
