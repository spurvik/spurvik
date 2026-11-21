import { isPublicIpLiteral } from "./scan-live-url.js";
const MAX_INPUT_CHARS = 2048;
const MAX_HOSTNAME_CHARS = 253;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "localdomain", "lan", "home.arpa", "intranet", "corp", "test", "invalid", "example"];
/**
 * Bare public hostname (`acme.eu`) from a domain or an http(s) URL, or null.
 * IP literals, localhost, internal suffixes, credentials, ports and non-ASCII names are refused, so a value
 * that is returned is safe to print and to put in a query string. Nothing is resolved; no request is made.
 */
export function publicHostname(raw) {
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || trimmed.length > MAX_INPUT_CHARS || /[\u0000- \u007f-￿<>"'`\\{}|^]/.test(trimmed))
        return null;
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(trimmed)?.[1];
    if (scheme !== undefined && scheme !== "http" && scheme !== "https")
        return null;
    let url;
    try {
        url = new URL(scheme === undefined ? `https://${trimmed}` : trimmed);
    }
    catch {
        return null;
    }
    if (url.username || url.password || url.port)
        return null;
    const host = url.hostname.replace(/\.$/, "");
    if (!host || host.length > MAX_HOSTNAME_CHARS || host.startsWith("["))
        return null;
    if (isPublicIpLiteral(host) !== null)
        return null;
    const labels = host.split(".");
    if (labels.length < 2 || !labels.every((label) => LABEL_RE.test(label)))
        return null;
    if (!TLD_RE.test(labels[labels.length - 1]))
        return null;
    if (BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)))
        return null;
    return host;
}
