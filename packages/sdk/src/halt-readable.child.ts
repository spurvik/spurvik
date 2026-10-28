import OpenAI from "openai";
import { withSpurvik } from "./client.js";
import { SpurvikHaltedError } from "./errors.js";

let unhandled = 0;
process.on("unhandledRejection", () => {
  unhandled += 1;
});

const apiKey = `spurvik_live_${"a".repeat(40)}`;
let providerCalls = 0;

const openai = withSpurvik(
  new OpenAI({
    apiKey: "sk-test",
    baseURL: "http://openai.test/v1",
    fetch: async () => {
      providerCalls += 1;
      return new Response("should not be called", { status: 500 });
    },
  }),
  {
    apiKey,
    baseUrl: "http://control.test",
    riskTier: "limited_art50",
    enforceHaltOnInference: true,
    oversight: { pushInvalidation: false },
    signingSecret: "signing-secret-value",
    contentHash: { mode: "off" },
    registerProcessHooks: false,
    telemetry: { maxRetries: 0, flushIntervalMs: 60_000, maxBatch: 50 },
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: {
            projectHalted: true,
            actionName: null,
            actionHalted: false,
            reason: "Operator stop",
            reviewerId: "reviewer-1",
            updatedAt: "2026-10-17T10:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  },
);

const stream = openai.chat.completions.stream({
  model: "gpt-4o-2024-08-06",
  messages: [{ role: "user", content: "Hi" }],
});

let outcome = "uncaught";
try {
  const readable = stream.toReadableStream();
  await readable.getReader().read();
  outcome = "unexpected-success";
} catch (error) {
  outcome = error instanceof SpurvikHaltedError ? "caught-halt" : "caught-other";
}

await new Promise((resolve) => setTimeout(resolve, 50));
console.log(outcome);
console.log(`unhandled ${unhandled}`);
console.log(`provider ${providerCalls}`);
console.log("alive");
if (unhandled > 0) process.exitCode = 1;
