/**
 * Bare public hostname (`acme.eu`) from a domain or an http(s) URL, or null.
 * IP literals, localhost, internal suffixes, credentials, ports and non-ASCII names are refused, so a value
 * that is returned is safe to print and to put in a query string. Nothing is resolved; no request is made.
 */
export declare function publicHostname(raw: unknown): string | null;
