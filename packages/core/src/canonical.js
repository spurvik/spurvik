/**
 * Stable JSON for hashing. Objects sort by key. Arrays keep their order.
 * `undefined` object entries are dropped. `null` is preserved.
 */
export function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}
function canonicalize(value) {
    if (value === undefined)
        return undefined;
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map((item) => canonicalize(item));
    const entries = Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const sorted = {};
    for (const [key, entry] of entries) {
        sorted[key] = canonicalize(entry);
    }
    return sorted;
}
