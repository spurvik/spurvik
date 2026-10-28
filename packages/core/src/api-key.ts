import { sha256Hex } from "./hash.js";

export const API_KEY_PREFIX = "spurvik_live_";
export const DISCLOSURE_KEY_PREFIX = "spurvik_pub_";
export const REVIEWER_TOKEN_PREFIX = "spurvik_reviewer_";

/** Issued before the Spurvik rename. Accepted for this release. Not used for new keys. */
export const LEGACY_API_KEY_PREFIX = "aegis_live_";
export const LEGACY_DISCLOSURE_KEY_PREFIX = "aegis_pub_";
export const LEGACY_REVIEWER_TOKEN_PREFIX = "aegis_reviewer_";

export const API_KEY_HEADER = "x-spurvik-api-key";
export const LEGACY_API_KEY_HEADER = "x-aegis-api-key";
export const REVIEWER_HEADER = "x-spurvik-reviewer";
export const LEGACY_REVIEWER_HEADER = "x-aegis-reviewer";

const API_KEY_PATTERN = /^(?:spurvik_live_|aegis_live_)[A-Za-z0-9_-]{32,}$/;
const DISCLOSURE_KEY_PATTERN = /^(?:spurvik_pub_|aegis_pub_)[A-Za-z0-9_-]{32,}$/;
const REVIEWER_TOKEN_PATTERN = /^(?:spurvik_reviewer_|aegis_reviewer_)[A-Za-z0-9_-]{32,}$/;

export function isProjectApiKey(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}

/** Browser disclosure beacon key. It can only record a notice, not read the ledger. */
export function isDisclosureApiKey(value: string): boolean {
  return DISCLOSURE_KEY_PATTERN.test(value);
}

/** Member credential for ingestion decisions. It is not a project API key. */
export function isReviewerToken(value: string): boolean {
  return REVIEWER_TOKEN_PATTERN.test(value);
}

/** SHA-256 hex of the project API key. Store and look up this value, never the key. */
export async function hashApiKey(apiKey: string): Promise<string> {
  return sha256Hex(apiKey);
}
