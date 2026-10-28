export interface DisclosureBeaconOptions {
  endpoint: string;
  /** Publishable `spurvik_pub_` key. Do not put a `spurvik_live_` key in the browser. */
  apiKey: string;
  jurisdiction?: string;
  noticeKind: "interaction" | "generated" | "deepfake" | "public_interest_text" | "emotion_biometric";
  sessionId?: string;
  /**
   * Storage and the network call stay off unless the site operator sets this
   * after obtaining consent. The operator, not Spurvik, obtains that consent.
   */
  consent?: boolean;
}

const STORAGE_PREFIX = "spurvik.disclosure.sent";
const SESSION_KEY = "spurvik.disclosure.session";

/**
 * sessionStorage keys written before the Spurvik rename.
 * On read, copy each `aegis.disclosure.*` value to `spurvik.disclosure.*` and delete the old key.
 * Remove this migration in 1.0, and no later than 2027-01-26.
 */
const LEGACY_STORAGE_ROOT = "aegis.disclosure.";
const STORAGE_ROOT = "spurvik.disclosure.";

export function migrateDisclosureStorage(storage: Storage): void {
  const legacyKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(LEGACY_STORAGE_ROOT)) legacyKeys.push(key);
  }
  for (const legacyKey of legacyKeys) {
    const nextKey = STORAGE_ROOT + legacyKey.slice(LEGACY_STORAGE_ROOT.length);
    if (storage.getItem(nextKey) === null) {
      const value = storage.getItem(legacyKey);
      if (value !== null) storage.setItem(nextKey, value);
    }
    storage.removeItem(legacyKey);
  }
}

function storageKey(prefix: string, options: DisclosureBeaconOptions, sessionId: string): string {
  return `${prefix}:${options.apiKey.slice(-12)}:${options.noticeKind}:${sessionId}`;
}

export function disclosureSessionId(explicit?: string): string {
  migrateDisclosureStorage(sessionStorage);
  if (explicit) return explicit;
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

/**
 * POST /api/v1/disclosure once per browser session when the label is on screen.
 * Failures are ignored so a notice still renders if the control plane is down.
 */
export function sendDisclosureBeacon(options: DisclosureBeaconOptions): void {
  if (options.consent !== true) return;
  const sessionId = disclosureSessionId(options.sessionId);
  const key = storageKey(STORAGE_PREFIX, options, sessionId);
  if (sessionStorage.getItem(key) === "1") return;
  sessionStorage.setItem(key, "1");
  const body = JSON.stringify({
    sessionId,
    jurisdiction: options.jurisdiction ?? "EU",
    noticeKind: options.noticeKind,
    timestamp: new Date().toISOString(),
  });
  void fetch(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey}`,
    },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function watchDisclosureVisibility(
  node: Element,
  onVisible: () => void,
): () => void {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return () => undefined;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      onVisible();
      observer.disconnect();
    }
  });
  observer.observe(node);
  return () => observer.disconnect();
}
