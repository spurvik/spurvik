import { spurvikMiddleware, type SpurvikMiddleware } from "./ai.js";
import { SpurvikClient } from "./client.js";

const mode = process.argv[2];
const apiKey = `spurvik_live_${"a".repeat(40)}`;

function client(options: { baseUrl: string; fetch: typeof fetch; maxRetries: number; hooks: boolean }) {
  return new SpurvikClient({
    apiKey,
    baseUrl: options.baseUrl,
    riskTier: "limited_art50",
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: options.hooks,
    telemetry: { maxRetries: options.maxRetries, flushIntervalMs: 60_000, maxBatch: 50 },
    fetch: options.fetch,
  });
}

const provider = {
  chat: {
    completions: {
      create: async (_body?: unknown) => ({ choices: [{ message: { content: "Hello" } }] }),
    },
  },
};

if (mode === "batch") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  const spurvik = client({ baseUrl, fetch: globalThis.fetch, maxRetries: 0, hooks: true });
  const wrapped = spurvik.wrap(provider);
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
  });
} else if (mode === "await-flush") {
  const spurvik = client({
    baseUrl: "http://127.0.0.1:9",
    fetch: async () => {
      throw new Error("down");
    },
    maxRetries: 1,
    hooks: false,
  });
  const wrapped = spurvik.wrap(provider);
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
  });
  await spurvik.flush();
  console.log("flushed");
} else if (mode === "middleware-flush") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  const middleware = spurvikMiddleware({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: false,
    telemetry: { maxRetries: 0, flushIntervalMs: 60_000, maxBatch: 50 },
  });
  await handleOne(middleware);
  await middleware.flush();
} else if (mode === "flush-deadline" || mode === "flush-deadline-exit") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  const started = Date.now();
  const spurvik = new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: true,
    telemetry: {
      maxRetries: 4,
      flushIntervalMs: 60_000,
      maxBatch: 50,
      requestTimeoutMs: 30_000,
      flushTimeoutMs: 1_000,
    },
    onTelemetryError: () => {
      console.log(`telemetry-error ${Date.now() - started}`);
    },
  });
  const wrapped = spurvik.wrap(provider);
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
  });
  if (mode === "flush-deadline") await spurvik.flush();
} else if (mode === "flush-after-deadline") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  const spurvik = new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: true,
    telemetry: { maxRetries: 0, flushIntervalMs: 60_000, maxBatch: 50, flushTimeoutMs: 200 },
  });
  const wrapped = spurvik.wrap(provider);
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
  });
  await spurvik.flush();
  await new Promise((resolve) => setTimeout(resolve, 400));
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Again" }],
  });
} else if (mode === "flush-slow-503") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  const spurvik = new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: true,
    telemetry: { flushIntervalMs: 60_000, maxBatch: 50 },
    onTelemetryError: () => {
      console.log("telemetry-error");
    },
  });
  const wrapped = spurvik.wrap(provider);
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
  });
  await spurvik.flush();
  console.log("flushed");
} else if (mode === "outage-4s" || mode === "outage-12s") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  const started = Date.now();
  const spurvik = new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: true,
    telemetry: { flushIntervalMs: 60_000, maxBatch: 50 },
    onTelemetryError: () => {
      console.log("telemetry-error");
    },
  });
  const wrapped = spurvik.wrap(provider);
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "one" }],
  });
  await spurvik.flush();
  console.log(`flushed ${Date.now() - started}`);
  const marks = mode === "outage-12s" ? [15_000] : [6_000, 20_000];
  for (const mark of marks) {
    const wait = mark - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    await wrapped.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: `t${mark}` }],
    });
  }
  console.log("recorded");
} else if (mode === "inflight-exit" || mode === "inflight-interval") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  const started = Date.now();
  const interval = mode === "inflight-interval";
  const spurvik = new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: true,
    telemetry: { flushIntervalMs: interval ? 1_000 : 60_000, maxBatch: 50 },
    onTelemetryError: () => {
      console.log("telemetry-error");
    },
  });
  const wrapped = spurvik.wrap(provider);
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "one" }],
  });
  const flushing = interval ? undefined : spurvik.flush();
  await new Promise((resolve) => setTimeout(resolve, interval ? 2_000 : 1_000));
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "two" }],
  });
  await wrapped.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "three" }],
  });
  if (flushing) await flushing;
  const remaining = 15_000 - (Date.now() - started);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  console.log("recorded");
} else if (mode === "oversight-refresh") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    enforceHaltOnInference: true,
    oversight: { cacheMs: 20, pushInvalidation: false },
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: false,
    telemetry: { maxRetries: 0, flushIntervalMs: 60_000, maxBatch: 50, requestTimeoutMs: 30_000 },
  });
  console.log("constructed");
} else if (mode === "oversight-hang") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    enforceHaltOnInference: true,
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: false,
  });
  console.log("constructed");
} else if (mode === "push-unref") {
  const baseUrl = process.env.SPURVIK_BASE_URL;
  if (!baseUrl) throw new Error("SPURVIK_BASE_URL is required");
  new SpurvikClient({
    apiKey,
    baseUrl,
    riskTier: "limited_art50",
    enforceHaltOnInference: true,
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: false,
    telemetry: { maxRetries: 0, flushIntervalMs: 60_000, maxBatch: 50 },
  });
  console.log("constructed");
} else if (mode === "listeners") {
  const before = process.listenerCount("beforeExit");
  for (let index = 0; index < 25; index += 1) {
    spurvikMiddleware({
      apiKey,
      baseUrl: "http://127.0.0.1:9",
      riskTier: "limited_art50",
      signingSecret: "signing-secret-value",
      contentHash: { mode: "off" },
      registerProcessHooks: true,
      telemetry: { maxRetries: 0, flushIntervalMs: 60_000, maxBatch: 50 },
      fetch: async () => {
        throw new Error("unused");
      },
    });
  }
  const after = process.listenerCount("beforeExit");
  for (let index = 0; index < 25; index += 1) {
    spurvikMiddleware({
      apiKey,
      baseUrl: "http://127.0.0.1:9",
      riskTier: "limited_art50",
      signingSecret: "signing-secret-value",
      contentHash: { mode: "off" },
      registerProcessHooks: true,
      telemetry: { maxRetries: 0, flushIntervalMs: 60_000, maxBatch: 50 },
      fetch: async () => {
        throw new Error("unused");
      },
    });
  }
  console.log(`${before} ${after} ${process.listenerCount("beforeExit")}`);
} else {
  throw new Error(`unknown mode ${mode ?? ""}`);
}

async function handleOne(middleware: SpurvikMiddleware): Promise<void> {
  const generate = middleware.wrapGenerate;
  if (!generate) throw new Error("middleware has no wrapGenerate");
  // The middleware reads provider, modelId, and the prompt, then calls doGenerate.
  // The model stub is not a full LanguageModelV4.
  await generate({
    doGenerate: async () => ({
      content: [{ type: "text", text: "Hello" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
    doStream: async () => {
      throw new Error("unused");
    },
    params: { prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }] },
    model: {
      specificationVersion: "v4",
      provider: "openai.chat",
      modelId: "gpt-4o",
      supportedUrls: {},
    },
  } as unknown as Parameters<NonNullable<SpurvikMiddleware["wrapGenerate"]>>[0]);
}
