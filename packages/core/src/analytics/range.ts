export interface Range {
  from: Date;
  to: Date;
  days: number;
}

/** Normalise a `days` window (default 30, max 365) into a [from, to) range. */
export function resolveRange(days?: number): Range {
  const d = Math.min(Math.max(1, Math.trunc(days ?? 30)), 365);
  const to = new Date();
  const from = new Date(to.getTime() - d * 86_400_000);
  return { from, to, days: d };
}

/** Bucket a set of timestamped amounts into a daily series covering the range. */
export function dailySeries(range: Range, rows: { at: Date; value: number }[]): { day: string; value: number }[] {
  const buckets = new Map<string, number>();
  for (let i = 0; i < range.days; i++) {
    const key = new Date(range.from.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const r of rows) {
    const key = r.at.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + r.value);
  }
  return [...buckets.entries()].map(([day, value]) => ({ day, value }));
}
