export declare const API_KEY_PREFIX = "spurvik_live_";
export declare const DISCLOSURE_KEY_PREFIX = "spurvik_pub_";
export declare const REVIEWER_TOKEN_PREFIX = "spurvik_reviewer_";
/** Issued before the Spurvik rename. Accepted for this release. Not used for new keys. */
export declare const LEGACY_API_KEY_PREFIX = "aegis_live_";
export declare const LEGACY_DISCLOSURE_KEY_PREFIX = "aegis_pub_";
export declare const LEGACY_REVIEWER_TOKEN_PREFIX = "aegis_reviewer_";
export declare const API_KEY_HEADER = "x-spurvik-api-key";
export declare const LEGACY_API_KEY_HEADER = "x-aegis-api-key";
export declare const REVIEWER_HEADER = "x-spurvik-reviewer";
export declare const LEGACY_REVIEWER_HEADER = "x-aegis-reviewer";
export declare function isProjectApiKey(value: string): boolean;
/** Browser disclosure beacon key. It can only record a notice, not read the ledger. */
export declare function isDisclosureApiKey(value: string): boolean;
/** Member credential for ingestion decisions. It is not a project API key. */
export declare function isReviewerToken(value: string): boolean;
/** SHA-256 hex of the project API key. Store and look up this value, never the key. */
export declare function hashApiKey(apiKey: string): Promise<string>;
