import type {
  JSONObject,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4Middleware,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  SharedV4ProviderMetadata,
} from "@ai-sdk/provider";
import { SpurvikClient, provenanceOf, type SpurvikProvenance } from "./client.js";
import type { SpurvikConfig } from "./config.js";

export type { SpurvikConfig } from "./config.js";
export type { SpurvikProvenance } from "./client.js";
export { provenanceOf };

const RECEIPT_KEY = "spurvik";

/**
 * Read a finish reason from a string or from an AI SDK `{ unified, raw }` object.
 * `unified` wins when it is a non-empty string. Otherwise `raw` is used.
 */
export function extractFinishReason(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (value && typeof value === "object") {
    const bag = value as { unified?: unknown; raw?: unknown };
    if (typeof bag.unified === "string" && bag.unified.trim().length > 0) return bag.unified.trim();
    if (typeof bag.raw === "string" && bag.raw.trim().length > 0) return bag.raw.trim();
  }
  return null;
}

/** True when the finish reason is the AI SDK `"interrupted"` value. */
export function isInterruptedFinishReason(value: unknown): boolean {
  return extractFinishReason(value) === "interrupted";
}

/**
 * Keep the first approval response for each tool call.
 * Matches `ai` 7.0.149+ `convertToModelMessages`, which processes one response per call.
 * Items with no `toolCallId`, `approvalId`, or `id` are kept in order.
 */
export function dedupeToolApprovalResponses<T>(responses: readonly T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of responses) {
    const key = approvalKey(item);
    if (!key) {
      kept.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

function approvalKey(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const record = item as { toolCallId?: unknown; approvalId?: unknown; id?: unknown };
  return trimmedId(record.toolCallId) ?? trimmedId(record.approvalId) ?? trimmedId(record.id);
}

function trimmedId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Language-model middleware plus `flush()`.
 * `wrapLanguageModel` accepts this value. Keep the object so a serverless
 * handler can send the batch after the response.
 */
export interface SpurvikMiddleware extends LanguageModelV4Middleware {
  /** Send this middleware's queued telemetry. Does not stop the client. */
  flush(): Promise<void>;
  /**
   * Run the halt check before a framework starts its own model loop.
   * Mastra catches a thrown `doStream` and finishes an empty text stream, so
   * the Mastra adapter calls this while resolving the model.
   */
  prepare(): Promise<void>;
}

/**
 * Vercel AI SDK middleware (`ai` package, language-model middleware v4).
 *
 * Pass the result to `wrapLanguageModel`. The middleware records the call and
 * attaches an HMAC provenance receipt on `providerMetadata.spurvik`. It does
 * not mark content. A marking hook runs only when `config.marking` sets one.
 * The receipt is not an Article 50(2) finding.
 *
 * Telemetry is batched by this middleware's queue. It is not flushed on each
 * call. The queue sends when the batch is full, on its interval, on `flush()`,
 * and once when the process is about to exit if process hooks are on.
 * Create one middleware at module scope and call `flush()` from the platform's
 * `waitUntil` when the isolate can freeze before that exit hook runs.
 */
export function spurvikMiddleware(configOrClient: SpurvikConfig | SpurvikClient): SpurvikMiddleware {
  const client = configOrClient instanceof SpurvikClient ? configOrClient : new SpurvikClient(configOrClient);
  return {
    specificationVersion: "v4",
    flush: () => client.flush(),
    prepare: () => client.beforeInference(),
    async wrapGenerate({ doGenerate, params, model }) {
      await client.beforeInference();
      const started = performance.now();
      const result = await doGenerate();
      const output = textFromContent(result.content);
      const finishReason = extractFinishReason((result as { finishReason?: unknown }).finishReason);
      const provenance = await recordCall(client, {
        model,
        params,
        output,
        started,
        stream: false,
        response: result,
        finishReason,
      });
      const next: LanguageModelV4GenerateResult = {
        ...result,
        content: applyHookText(result.content, provenance.markedOutput, client.applyMarkedTextToContent),
        providerMetadata: receiptMetadata(result.providerMetadata, provenance, finishReason),
      };
      return attachReceipt(next, provenance);
    },
    async wrapStream({ doStream, params, model }) {
      await client.beforeInference();
      const started = performance.now();
      const result = await doStream();
      const pending = deferred<SpurvikProvenance>();
      pending.promise.catch(() => undefined);
      let settled = false;
      let modelVersion = model.modelId;
      const pieces: string[] = [];
      const reader = result.stream.getReader();

      const settle = async (
        output: string | null,
        response: unknown,
        finishReason: string | null,
      ): Promise<SpurvikProvenance> => {
        const provenance = await recordCall(client, {
          model,
          params,
          output,
          started,
          stream: true,
          response,
          modelVersion,
          finishReason,
        });
        pending.resolve(provenance);
        return provenance;
      };

      const fail = (error: unknown): void => {
        settled = true;
        pending.reject(error);
      };

      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              if (!settled) {
                try {
                  // A stream that closes without a finish chunk is "interrupted".
                  await settle(
                    pieces.length > 0 ? pieces.join("") : null,
                    { headers: result.response?.headers },
                    "interrupted",
                  );
                  settled = true;
                } catch (error) {
                  fail(error);
                  controller.error(error);
                  return;
                }
              }
              controller.close();
              return;
            }
            const chunk = next.value;
            if (chunk.type === "text-delta") pieces.push(chunk.delta);
            if (chunk.type === "response-metadata" && chunk.modelId) modelVersion = chunk.modelId;
            if (chunk.type === "error") {
              if (!settled) {
                fail(chunk.error instanceof Error ? chunk.error : new Error("The model stream reported an error."));
              }
              controller.enqueue(chunk);
              controller.close();
              return;
            }
            if (chunk.type === "finish" && !settled) {
              try {
                const finishReason = extractFinishReason((chunk as { finishReason?: unknown }).finishReason) ?? "unknown";
                const provenance = await settle(
                  pieces.length > 0 ? pieces.join("") : null,
                  {
                    headers: result.response?.headers,
                    finish: chunk,
                  },
                  finishReason,
                );
                settled = true;
                controller.enqueue({
                  ...chunk,
                  providerMetadata: receiptMetadata(chunk.providerMetadata, provenance, finishReason),
                });
              } catch (error) {
                fail(error);
                controller.error(error);
              }
              return;
            }
            controller.enqueue(chunk);
          } catch (error) {
            if (!settled) fail(error);
            controller.error(error);
          }
        },
        cancel(reason) {
          if (!settled) {
            fail(reason instanceof Error ? reason : new Error("The model stream was cancelled before a receipt was recorded."));
          }
          return reader.cancel(reason);
        },
      });

      return attachReceipt({ ...result, stream }, pending.promise);
    },
  };
}

/**
 * Read the HMAC receipt stored on AI SDK provider metadata.
 * This does not check the signature. Use `verifyProvenanceSignature` for that.
 * A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
 */
export function provenanceFromMetadata(
  metadata: SharedV4ProviderMetadata | undefined,
): SpurvikProvenance | undefined {
  const spurvik = metadata?.[RECEIPT_KEY];
  if (!spurvik || typeof spurvik.record !== "object" || spurvik.record === null || Array.isArray(spurvik.record)) {
    return undefined;
  }
  const markedOutput = spurvik.markedOutput;
  const finishReason = spurvik.finishReason;
  const receipt: SpurvikProvenance = {
    ...(spurvik.record as unknown as SpurvikProvenance),
    ...(typeof markedOutput === "string" ? { markedOutput } : {}),
  };
  if (typeof finishReason === "string") {
    Object.defineProperty(receipt, "finishReason", {
      value: finishReason,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(receipt, "interrupted", {
      value: finishReason === "interrupted",
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return receipt;
}

async function recordCall(
  client: SpurvikClient,
  input: {
    model: LanguageModelV4;
    params: LanguageModelV4CallOptions;
    output: string | null;
    started: number;
    stream: boolean;
    response: unknown;
    modelVersion?: string;
    finishReason?: string | null;
  },
): Promise<SpurvikProvenance> {
  return client.finishCall({
    path: inferencePath(input.model.provider, input.model.modelId, input.stream),
    request: {
      prompt: textFromPrompt(input.params.prompt),
      model: input.model.modelId,
      temperature: typeof input.params.temperature === "number" ? input.params.temperature : null,
      stream: input.stream,
    },
    requestBody: input.params,
    response: input.response,
    output: input.output,
    modelVersion: input.modelVersion ?? input.model.modelId,
    latencyMs: Math.max(0, Math.round(performance.now() - input.started)),
    ...(typeof input.finishReason === "string" && input.finishReason.length > 0
      ? { finishReason: input.finishReason }
      : {}),
  });
}

function inferencePath(provider: string, modelId: string, stream: boolean): string[] {
  const providerId = provider.toLowerCase();
  const method = stream ? "stream" : "create";
  if (providerId.includes("bedrock")) {
    if (modelId.toLowerCase().includes("claude")) return ["bedrock", "messages", method];
    return ["bedrock", "chat", "completions", method];
  }
  if (providerId.includes("vertex")) return ["vertex", stream ? "generateContentStream" : "generateContent"];
  if (providerId.includes("anthropic")) return ["messages", stream ? "stream" : "create"];
  if (providerId.includes("google") || providerId.includes("gemini")) {
    return [stream ? "generateContentStream" : "generateContent"];
  }
  if (providerId.includes("mistral")) return ["chat", stream ? "stream" : "complete"];
  if (providerId.includes("azure")) return ["azure", "chat", "completions", method];
  if (providerId.includes("foundry")) return ["foundry", "chat", "completions", method];
  if (providerId.includes("openai")) return ["chat", "completions", method];
  return ["language-model", stream ? "doStream" : "doGenerate"];
}

function textFromPrompt(prompt: LanguageModelV4Prompt): string | null {
  const parts: string[] = [];
  for (const message of prompt) collectText(message.content, parts);
  return parts.length > 0 ? parts.join("\n") : null;
}

function textFromContent(content: readonly LanguageModelV4Content[]): string | null {
  const parts: string[] = [];
  for (const part of content) {
    if (part.type === "text") parts.push(part.text);
  }
  return parts.length > 0 ? parts.join("") : null;
}

function collectText(value: unknown, parts: string[]): void {
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { type?: unknown; text?: unknown };
    if (record.type === "text" && typeof record.text === "string") parts.push(record.text);
  }
}

function applyHookText(
  content: readonly LanguageModelV4Content[],
  marked: string | undefined,
  apply: boolean,
): LanguageModelV4Content[] {
  if (!apply || marked === undefined) return [...content];
  let replaced = false;
  return content.map((part) => {
    if (replaced || part.type !== "text") return part;
    replaced = true;
    return { ...part, text: marked };
  });
}

function receiptMetadata(
  existing: SharedV4ProviderMetadata | undefined,
  provenance: SpurvikProvenance,
  finishReason?: string | null,
): SharedV4ProviderMetadata {
  const { markedOutput, ...record } = provenance;
  const spurvik: JSONObject = {
    record: JSON.parse(JSON.stringify(record)) as JSONObject,
    ...(finishReason ? { finishReason, interrupted: finishReason === "interrupted" } : {}),
  };
  if (markedOutput !== undefined) spurvik.markedOutput = markedOutput;
  return { ...(existing ?? {}), [RECEIPT_KEY]: spurvik };
}

function attachReceipt<T extends object>(result: T, provenance: SpurvikProvenance | Promise<SpurvikProvenance>): T {
  Object.defineProperty(result, "_spurvik_provenance", {
    value: provenance,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return result;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
