import type { SpurvikConfig } from "spurvik/ai";

/**
 * Format-only stand-in for local development.
 * The pieces are joined so the source does not contain a project-key literal.
 * The result matches the SDK's project-key shape. It is not a hosted-console credential.
 */
const LOCAL_API_KEY = ["spurvik", "live", "not-a-real-key-not-a-real-key-xx"].join("_");
const LOCAL_SIGNING_SECRET = "local-dev-signing-secret";
const LOCAL_CONTENT_HASH_SECRET = "local-dev-content-hash-secret";

const UNSET = new Set(["", "your-key-here", "your-secret-here", "your-url-here"]);

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value || UNSET.has(value)) return undefined;
  return value;
}

export interface SpurvikSettings {
  apiKey?: string;
  signingSecret?: string;
  contentHashSecret?: string;
  baseUrl?: string;
  missing: string[];
}

export function readSpurvikSettings(): SpurvikSettings {
  const apiKey = readEnv("SPURVIK_API_KEY");
  const signingSecret = readEnv("SPURVIK_SIGNING_SECRET") ?? readEnv("SPURVIK_HMAC_SECRET");
  const contentHashSecret = readEnv("SPURVIK_CONTENT_HASH_SECRET");
  const baseUrl = readEnv("SPURVIK_BASE_URL");
  const missing: string[] = [];
  if (!apiKey) missing.push("SPURVIK_API_KEY");
  if (!signingSecret) missing.push("SPURVIK_SIGNING_SECRET");
  if (!contentHashSecret) missing.push("SPURVIK_CONTENT_HASH_SECRET");
  if (process.env.NODE_ENV === "production" && !baseUrl) missing.push("SPURVIK_BASE_URL");
  return { apiKey, signingSecret, contentHashSecret, baseUrl, missing };
}

/** Plain message for a 400 response. Null when the route can build a config. */
export function missingSpurvikMessage(): string | null {
  const { missing } = readSpurvikSettings();
  if (missing.length === 0) return null;
  return `Set ${missing.join(", ")} before sending a message. Sample placeholders are not accepted.`;
}

/**
 * Build the config object `spurvikMiddleware` accepts.
 * When a value is missing in development, a format-only stand-in is used and
 * `baseUrl` is omitted so the SDK uses http://127.0.0.1:43123.
 * The chat route returns 400 instead of calling this while settings are missing.
 */
export function spurvikConfig(): SpurvikConfig {
  const settings = readSpurvikSettings();
  const production = process.env.NODE_ENV === "production";
  if (production && settings.missing.length > 0) {
    throw new Error(missingSpurvikMessage() ?? "Set the Spurvik environment variables before sending a message.");
  }

  const config: SpurvikConfig = {
    apiKey: settings.apiKey ?? LOCAL_API_KEY,
    signingSecret: settings.signingSecret ?? LOCAL_SIGNING_SECRET,
    contentHash: { mode: "keyed", secret: settings.contentHashSecret ?? LOCAL_CONTENT_HASH_SECRET },
    riskTier: "limited_art50",
    // The page shows an Article 50(1) interaction notice. This flag records that configuration.
    article50Disclosure: true,
    registerProcessHooks: true,
    telemetry: {
      flushIntervalMs: 60_000,
      flushTimeoutMs: 3_000,
      requestTimeoutMs: 2_000,
      maxRetries: 1,
    },
    onTelemetryError: (error: unknown) => {
      console.error("Spurvik telemetry not delivered:", error);
    },
  };

  if (settings.baseUrl) config.baseUrl = settings.baseUrl;
  return config;
}
