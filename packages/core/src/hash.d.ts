export declare function sha256Hex(value: string): Promise<string>;
export declare function hmacSha256Hex(secret: string, value: string): Promise<string>;
/**
 * Compare equal-length strings without short-circuiting.
 * Returns false immediately when lengths differ (length is not secret here).
 */
export declare function timingSafeEqualString(left: string, right: string): boolean;
export declare function fingerprintContent(mode: "on" | "keyed", value: string, secret?: string): Promise<string>;
export declare function hashCanonical(value: unknown): Promise<string>;
