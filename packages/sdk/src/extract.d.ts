import type { ModelProvider } from "@spurvik/core";
export interface RequestView {
    prompt: string | null;
    model: string | null;
    temperature: number | null;
    stream: boolean;
}
export declare function isAsyncIterable(value: unknown): value is AsyncIterable<unknown>;
export declare function providerFromPath(path: readonly string[]): ModelProvider;
/**
 * Provider for one call. The path identifies the SDK shape. A model id can
 * move an OpenAI-compatible call to Mistral or an open-weight server.
 * Anything else stays unknown.
 */
export declare function resolveProvider(path: readonly string[], model: string | null): ModelProvider;
export declare function modalityFromPath(path: readonly string[]): "text" | "image" | "audio" | "video";
export declare function requestRecord(args: readonly unknown[]): unknown;
/**
 * Calls the wrapper does not see, so no provenance record is attached:
 * embeddings, image generation, speech, moderations, batches, and file uploads.
 * `applyMediaMark` is a separate call for bytes the app already holds.
 * `chats.create` is not a model call. The returned chat session is wrapped so
 * `sendMessage` and `sendMessageStream` are.
 */
export declare const NOT_INTERCEPTED_CALLS: readonly [readonly ["embeddings", "create"], readonly ["images", "generate"], readonly ["audio", "speech", "create"], readonly ["moderations", "create"], readonly ["batches", "create"], readonly ["files", "create"], readonly ["models", "list"]];
export declare function shouldIntercept(path: readonly string[]): boolean;
/** Promise results that resolve to a stream rather than a finished message. */
export declare function isProviderStreamMethod(path: readonly string[]): boolean;
/**
 * Gemini chat sessions keep the model and default config on the session, not
 * on each `sendMessage` argument. The SDK sends that config when the call
 * omits its own.
 */
export declare function withOwnerDefaults(owner: unknown, request: RequestView): RequestView;
export declare function readRequest(args: readonly unknown[]): RequestView;
export declare function extractOutput(value: unknown): string | null;
/**
 * One text fragment from a stream chunk.
 * Snapshot events and convenience getters are skipped so the same text is
 * not hashed twice. OpenAI `response.output_text.done` repeats the full
 * string. Gemini's `text` getter repeats `candidates`.
 */
export declare function extractDelta(chunk: unknown): string;
export declare function modelFromResponse(value: unknown): string | null;
export declare function applyMarkedText(result: unknown, marked: string): void;
