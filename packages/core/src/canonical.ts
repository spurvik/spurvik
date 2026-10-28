/**
 * Stable JSON for hashing. Objects sort by key. Arrays keep their order.
 * `undefined` object entries are dropped. `null` is preserved.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const sorted: Record<string, unknown> = {};
  for (const [key, entry] of entries) {
    sorted[key] = canonicalize(entry);
  }
  return sorted;
}
