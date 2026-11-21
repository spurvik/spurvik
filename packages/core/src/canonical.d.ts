/**
 * Stable JSON for hashing. Objects sort by key. Arrays keep their order.
 * `undefined` object entries are dropped. `null` is preserved.
 */
export declare function canonicalJson(value: unknown): string;
