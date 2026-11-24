export declare const MAX_RECEIPT_CHARS = 1000000;
export declare const MIN_SIGNING_INPUT_LENGTH = 16;
/** Replace every known secret, and its JSON-escaped form, wherever it appears in output. */
export declare function scrubSecrets(text: string, secrets: readonly (string | undefined)[]): string;
export declare function scrubSecret(text: string, secret: string | undefined): string;
/** The argument and `SPURVIK_SIGNING_SECRET`, when both are set, are both secrets this process knows. */
export declare function knownSigningSecrets(argument: string | undefined): string[];
/** Argument wins. An empty value is an error. A short value is rejected before use. The secret is not logged. */
export declare function resolveSigningSecret(argument: string | undefined): string | undefined;
/**
 * Explain a pasted HMAC receipt. Check it only when `signingSecret` is set.
 * The secret is never included in the result.
 */
export declare function explainReceipt(receiptJson: string, signingSecret: string | undefined): Promise<string>;
