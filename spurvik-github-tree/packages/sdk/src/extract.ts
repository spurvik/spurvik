import type { ModelProvider } from "@spurvik/core";

export interface RequestView {
  prompt: string | null;
  model: string | null;
  temperature: number | null;
  stream: boolean;
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
}

export function providerFromPath(path: readonly string[]): ModelProvider {
  if (
    path.includes("generateContent") ||
    path.includes("generateContentStream") ||
    path.includes("sendMessage") ||
    path.includes("sendMessageStream") ||
    path.includes("chats") ||
    path.includes("models")
  ) {
    return "google";
  }
  if (path.includes("messages")) return "anthropic";
  if (path.includes("complete") && path.includes("chat")) return "mistral";
  if (path.includes("responses") || path.includes("chat") || path.includes("completions")) return "openai";
  return "unknown";
}

/**
 * Provider for one call. The path identifies the SDK shape. A model id can
 * move an OpenAI-compatible call to Mistral or an open-weight server.
 * Anything else stays unknown.
 */
export function resolveProvider(path: readonly string[], model: string | null): ModelProvider {
  const fromPath = providerFromPath(path);
  if (!model) return fromPath;
  if (/^(mistral-|codestral|pixtral|open-mistral)/i.test(model)) return "mistral";
  if (
    /^(meta-llama|llama-|qwen|gemma-|phi-|mixtral|deepseek)/i.test(model) &&
    fromPath !== "anthropic" &&
    fromPath !== "google"
  ) {
    return "open_weight";
  }
  return fromPath;
}

export function modalityFromPath(path: readonly string[]): "text" | "image" | "audio" | "video" {
  const joined = path.join(".").toLowerCase();
  if (joined.includes("image")) return "image";
  if (joined.includes("audio") || joined.includes("speech") || joined.includes("transcription")) return "audio";
  if (joined.includes("video")) return "video";
  return "text";
}

export function requestRecord(args: readonly unknown[]): unknown {
  return args.find((arg) => isRecord(arg)) ?? null;
}

/**
 * Calls the wrapper does not see, so no provenance record is attached:
 * embeddings, image generation, speech, moderations, batches, and file uploads.
 * `applyMediaMark` is a separate call for bytes the app already holds.
 * `chats.create` is not a model call. The returned chat session is wrapped so
 * `sendMessage` and `sendMessageStream` are.
 */
export const NOT_INTERCEPTED_CALLS = [
  ["embeddings", "create"],
  ["images", "generate"],
  ["audio", "speech", "create"],
  ["moderations", "create"],
  ["batches", "create"],
  ["files", "create"],
  ["models", "list"],
] as const;

export function shouldIntercept(path: readonly string[]): boolean {
  const method = path[path.length - 1];
  if (!method) return false;
  if (method === "generateContent" || method === "generateContentStream") return true;
  if (method === "sendMessage" || method === "sendMessageStream") return true;
  if (method === "stream" && (path.includes("messages") || path.includes("responses") || path.includes("chat"))) {
    return true;
  }
  if (method === "complete" && path.includes("chat")) return true;
  if (method === "create" || method === "parse") {
    const full = path.join(".");
    return (
      full.endsWith("chat.completions.create") ||
      full.endsWith("chat.completions.parse") ||
      (full.endsWith("completions.create") && !full.includes("chat.completions") && path.includes("completions")) ||
      full.endsWith("responses.create") ||
      full.endsWith("responses.parse") ||
      full.endsWith("messages.create") ||
      full.endsWith("messages.parse")
    );
  }
  return false;
}

/** Promise results that resolve to a stream rather than a finished message. */
export function isProviderStreamMethod(path: readonly string[]): boolean {
  const method = path[path.length - 1];
  return method === "generateContentStream" || method === "sendMessageStream" || method === "stream";
}

/**
 * Gemini chat sessions keep the model and default config on the session, not
 * on each `sendMessage` argument. The SDK sends that config when the call
 * omits its own.
 */
export function withOwnerDefaults(owner: unknown, request: RequestView): RequestView {
  if (!isRecord(owner)) return request;
  let model = request.model;
  let temperature = request.temperature;
  if (!model && typeof owner.model === "string") model = owner.model;
  if (temperature === null && isRecord(owner.config) && typeof owner.config.temperature === "number") {
    temperature = owner.config.temperature;
  }
  if (model === request.model && temperature === request.temperature) return request;
  return { ...request, model, temperature };
}

export function readRequest(args: readonly unknown[]): RequestView {
  const body = args.find((arg) => isRecord(arg));
  if (!body) return { prompt: null, model: null, temperature: null, stream: false };
  return {
    prompt: extractPrompt(body),
    model: typeof body.model === "string" ? body.model : null,
    temperature: readTemperature(body),
    stream: body.stream === true,
  };
}

export function extractOutput(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const fromChoices = textFromChoices(value.choices, "message");
  if (fromChoices !== null) return fromChoices;
  if (typeof value.output_text === "string") return value.output_text;
  const fromBlocks = textFromBlocks(value.content);
  if (fromBlocks !== null) return fromBlocks;
  if (typeof value.text === "string") return value.text;
  if (typeof value.text === "function") {
    try {
      const called = (value.text as () => unknown)();
      if (typeof called === "string") return called;
    } catch {
      // Some SDK response objects expose text as a method that can throw before the body is ready.
    }
  }
  const fromCandidates = textFromCandidates(value.candidates);
  if (fromCandidates !== null) return fromCandidates;
  const output = value.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (!isRecord(item)) continue;
      const block = textFromBlocks(item.content);
      if (block) parts.push(block);
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return null;
}

/**
 * One text fragment from a stream chunk.
 * Snapshot events and convenience getters are skipped so the same text is
 * not hashed twice. OpenAI `response.output_text.done` repeats the full
 * string. Gemini's `text` getter repeats `candidates`.
 */
export function extractDelta(chunk: unknown): string {
  if (!isRecord(chunk)) return "";
  const type = typeof chunk.type === "string" ? chunk.type : "";

  if (type === "response.output_text.delta" && typeof chunk.delta === "string") return chunk.delta;
  if (type === "content_block_delta") {
    if (!isRecord(chunk.delta) || typeof chunk.delta.text !== "string") return "";
    if (chunk.delta.type === "thinking_delta" || chunk.delta.type === "input_json_delta") return "";
    return chunk.delta.text;
  }
  if (type.startsWith("response.") || type.startsWith("message_") || type.startsWith("content_block")) return "";

  if (Array.isArray(chunk.choices)) return textFromChoices(chunk.choices, "delta") ?? "";
  if (Array.isArray(chunk.candidates)) return textFromCandidates(chunk.candidates) ?? "";

  if (typeof chunk.delta === "string") return chunk.delta;
  if (isRecord(chunk.delta) && typeof chunk.delta.text === "string") return chunk.delta.text;
  if (typeof chunk.text === "string") return chunk.text;
  return "";
}

export function modelFromResponse(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.model === "string") return value.model;
  if (typeof value.modelVersion === "string") return value.modelVersion;
  if (isRecord(value.response) && typeof value.response.model === "string") return value.response.model;
  return null;
}

function extractPrompt(body: Record<string, unknown>): string | null {
  if (typeof body.prompt === "string") return body.prompt;
  if (typeof body.input === "string") return body.input;
  if (typeof body.message === "string") return body.message;
  if (body.message !== undefined) {
    const fromMessage = textFromContents(Array.isArray(body.message) ? body.message : [body.message]);
    if (fromMessage !== null) return fromMessage;
  }
  const fromMessages = textFromMessages(body.messages);
  if (fromMessages !== null) return fromMessages;
  const fromContents = textFromContents(body.contents);
  if (fromContents !== null) return fromContents;
  if (Array.isArray(body.input)) return textFromContents(body.input);
  return null;
}

function textFromMessages(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const message of value) {
    if (!isRecord(message)) continue;
    const text = textValue(message.content);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function textFromContents(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (!isRecord(item)) continue;
    const direct = textValue(item.text) ?? textValue(item.content);
    if (direct) {
      parts.push(direct);
      continue;
    }
    if (Array.isArray(item.parts)) {
      for (const part of item.parts) {
        if (isRecord(part) && typeof part.text === "string") parts.push(part.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function textFromChoices(choices: unknown, field: "message" | "delta"): string | null {
  if (!Array.isArray(choices)) return null;
  const parts: string[] = [];
  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const holder = choice[field];
    if (!isRecord(holder)) continue;
    if (typeof holder.content === "string") parts.push(holder.content);
    else if (holder.content === null && field === "message") parts.push("");
  }
  return parts.length > 0 ? parts.join("") : null;
}

function textFromBlocks(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const block of value) {
    if (typeof block === "string") parts.push(block);
    else if (isRecord(block) && typeof block.text === "string") parts.push(block.text);
  }
  return parts.length > 0 ? parts.join("") : null;
}

function textFromCandidates(candidates: unknown): string | null {
  if (!Array.isArray(candidates)) return null;
  const parts: string[] = [];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    const blocks = candidate.content.parts;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (isRecord(block) && typeof block.text === "string") parts.push(block.text);
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") parts.push(item);
    else if (isRecord(item) && typeof item.text === "string") parts.push(item.text);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function readTemperature(body: Record<string, unknown>): number | null {
  if (typeof body.temperature === "number") return body.temperature;
  if (isRecord(body.config) && typeof body.config.temperature === "number") return body.config.temperature;
  if (isRecord(body.generationConfig) && typeof body.generationConfig.temperature === "number") {
    return body.generationConfig.temperature;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyMarkedText(result: unknown, marked: string): void {
  if (!isRecord(result)) return;
  if (Array.isArray(result.choices)) {
    const choice = result.choices[0];
    if (isRecord(choice) && isRecord(choice.message) && typeof choice.message.content === "string") {
      choice.message.content = marked;
      return;
    }
  }
  if (Array.isArray(result.content)) {
    const block = result.content[0];
    if (isRecord(block) && typeof block.text === "string") {
      block.text = marked;
      return;
    }
  }
  if (typeof result.output_text === "string") {
    result.output_text = marked;
    return;
  }
  if (typeof result.text === "string") result.text = marked;
}
