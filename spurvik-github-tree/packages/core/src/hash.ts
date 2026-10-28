import { canonicalJson } from "./canonical.js";

const textEncoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return toHex(digest);
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return toHex(signature);
}

/**
 * Compare equal-length strings without short-circuiting.
 * Returns false immediately when lengths differ (length is not secret here).
 */
export function timingSafeEqualString(left: string, right: string): boolean {
  const a = textEncoder.encode(left);
  const b = textEncoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

export async function fingerprintContent(
  mode: "on" | "keyed",
  value: string,
  secret?: string,
): Promise<string> {
  if (mode === "on") return sha256Hex(value);
  if (!secret) {
    throw new Error("Keyed content fingerprints require a client-held secret or salt.");
  }
  return hmacSha256Hex(secret, value);
}

export async function hashCanonical(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}
