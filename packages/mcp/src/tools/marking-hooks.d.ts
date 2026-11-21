export declare const SURFACES: readonly ["text", "media", "both"];
export type MarkingSurface = (typeof SURFACES)[number];
/** How a caller plugs in their own Article 50(2) marking. Spurvik does not mark content. */
export declare function markingHooksText(surface?: string): string;
