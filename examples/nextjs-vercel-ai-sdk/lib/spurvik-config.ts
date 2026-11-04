import type { SpurvikConfig } from "spurvik/ai";

/**
 * Format-only stand-ins for local development.
 * They let `spurvikMiddleware` construct without a live project key.
 * They are not credentials for the hosted console.
 */
const LOCAL_API_KEY = "spurvik_live_localdevplaceholderlocaldevplaceholder";
const LOCAL_SIGNING_SECRET = "local-dev-signing-secret";
const LOCAL_CONTENT_HASH_SECRET = "local-dev-content-hash-secret";

const UNSET = new Set(["", "your-key-here", "your-secret-here", "your-url-here"]);

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value || UNSET.has(value)) return undefined;
  return value;
}

/**
 * Build the config object `spurvikMiddleware` accepts.
 * Development omits `baseUrl` so the SDK uses http://127.0.0.1:43123.
 * Production requires a base URL. The SDK throws if it is missing.
 */
export function spurvikConfig(): SpurvikConfig {
  const production = process.env.NODE_ENV === "production";
  const apiKey = readEnv("SPURVIK_API_KEY");
  const signingSecret = readEnv("SPURVIK_SIGNING_SECRET") ?? readEnv("SPURVIK_HMAC_SECRET");
  const contentHashSecret = readEnv("SPURVIK_CONTENT_HASH_SECRET");
  const baseUrl = readEnv("SPURVIK_BASE_URL");

  if (production && (!apiKey || !signingSecret || !contentHashSecret || !baseUrl)) {
    throw new Error(
      "Set SPURVIK_API_KEY, SPURVIK_SIGNING_SECRET, SPURVIK_CONTENT_HASH_SECRET, and SPURVIK_BASE_URL. The SDK requires baseUrl when NODE_ENV is production.",
    );
  }

  const config: SpurvikConfig = {
    apiKey: apiKey ?? LOCAL_API_KEY,
    signingSecret: signingSecret ?? LOCAL_SIGNING_SECRET,
    contentHash: { mode: "keyed", secret: contentHashSecret ?? LOCAL_CONTENT_HASH_SECRET },
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

  if (baseUrl) config.baseUrl = baseUrl;
  return config;
}
