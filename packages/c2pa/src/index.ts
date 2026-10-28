import { Builder, LocalSigner, Reader } from "@contentauth/c2pa-node";
import { readSpurvikEnv, type MediaMarkingHook } from "@spurvik/core";

export const C2PA_IMAGE_HOOK_ID = "c2pa-image";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

const MANIFEST_NOTE =
  "A matching signature is a check of this manifest. It is not a conformity assessment.";

export interface C2paImageHookOptions {
  /** CA-issued X.509 v3 end-entity certificate in PEM. Self-signed certificates are rejected by the library. */
  certificatePem: string;
  /** PKCS#8 PEM private key for certificatePem. */
  privateKeyPem: string;
}

export type TrustAnchor = "not_on_trust_list" | "no_failure_reported" | "not_checked";

export interface ImageManifestReport {
  manifestFound: boolean;
  embedded: boolean;
  claimGenerator: string | null;
  signatureMatches: boolean;
  trustAnchor: TrustAnchor;
  validationCodes: string[];
  note: string;
}

/**
 * Sign and embed a C2PA manifest in a PNG or JPEG.
 * The manifest records that a marking hook ran. It is not an Article 50(2) finding
 * and it is not a conformity assessment.
 */
/** Read SPURVIK_C2PA_CERT_PEM and SPURVIK_C2PA_KEY_PEM. AEGIS_C2PA_* is still read. */
export function c2paMaterialFromEnv(): { certificatePem: string; privateKeyPem: string } | null {
  const certificatePem = readSpurvikEnv("C2PA_CERT_PEM");
  const privateKeyPem = readSpurvikEnv("C2PA_KEY_PEM");
  if (!certificatePem || !privateKeyPem) return null;
  return { certificatePem, privateKeyPem };
}

export function createC2paImageHook(options: C2paImageHookOptions): MediaMarkingHook {
  return {
    id: C2PA_IMAGE_HOOK_ID,
    async mark(input) {
      if (!IMAGE_TYPES.has(input.mediaType)) {
        return { bytes: input.bytes, mediaType: input.mediaType, manifestEmbedded: false };
      }
      const signer = LocalSigner.newSigner(
        Buffer.from(options.certificatePem),
        Buffer.from(options.privateKeyPem),
        "es256",
      );
      const builder = Builder.new();
      builder.setIntent({
        create: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
      });
      builder.addAssertion("c2pa.actions", {
        actions: [
          {
            action: "c2pa.created",
            digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
          },
        ],
      });
      const output: { buffer: Buffer | null } = { buffer: null };
      builder.sign(
        signer,
        { buffer: Buffer.from(input.bytes), mimeType: input.mediaType },
        output,
      );
      if (!output.buffer) {
        throw new Error("The C2PA library did not return signed image bytes.");
      }
      return {
        bytes: new Uint8Array(output.buffer),
        mediaType: input.mediaType,
        manifestEmbedded: true,
      };
    },
  };
}

const SIGNATURE_FAILURES = new Set([
  "claimSignature.mismatch",
  "assertion.dataHash.mismatch",
  "assertion.dataHash.mismatch.hashedURI",
  "assertion.hashedURI.mismatch",
]);

/**
 * Read an embedded C2PA manifest. `signatureMatches` means the library did not
 * report a claim-signature or data-hash failure. A private CA stays
 * `not_on_trust_list`.
 */
export async function readImageManifest(bytes: Uint8Array, mimeType: string): Promise<ImageManifestReport> {
  if (!IMAGE_TYPES.has(mimeType)) {
    return emptyReport();
  }
  const reader = await Reader.fromAsset({ buffer: Buffer.from(bytes), mimeType });
  if (!reader) return emptyReport();
  const store = reader.json() as {
    active_manifest?: string;
    manifests?: Record<string, { claim_generator_info?: Array<{ name?: string }> }>;
    validation_status?: Array<{ code?: string }>;
  };
  const codes = (store.validation_status ?? []).map((item) => item.code).filter((code): code is string => Boolean(code));
  const active = store.active_manifest ? store.manifests?.[store.active_manifest] : undefined;
  const claimGenerator = active?.claim_generator_info?.[0]?.name ?? null;
  const manifestFound = Boolean(store.active_manifest);
  const signatureMatches = manifestFound && !codes.some((code) => SIGNATURE_FAILURES.has(code));
  const trustAnchor: TrustAnchor = codes.includes("signingCredential.untrusted")
    ? "not_on_trust_list"
    : manifestFound
      ? "no_failure_reported"
      : "not_checked";
  return {
    manifestFound,
    embedded: reader.isEmbedded(),
    claimGenerator,
    signatureMatches,
    trustAnchor,
    validationCodes: codes,
    note: MANIFEST_NOTE,
  };
}

function emptyReport(): ImageManifestReport {
  return {
    manifestFound: false,
    embedded: false,
    claimGenerator: null,
    signatureMatches: false,
    trustAnchor: "not_checked",
    validationCodes: [],
    note: MANIFEST_NOTE,
  };
}
