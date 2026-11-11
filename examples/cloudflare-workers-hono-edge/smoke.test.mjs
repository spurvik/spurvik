import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEdgeWorker } from "./worker.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const localDist = join(here, "..", "..", "packages", "sdk", "dist");
const n8nDist = join(here, "..", "..", "packages", "n8n-nodes-spurvik", "node_modules", "spurvik-sdk", "dist");
const sdkDist = existsSync(join(localDist, "index.js")) ? localDist : n8nDist;

const {
  KvTelemetryBuffer,
  createSignedApprovalLinks,
  provenanceOf,
  verifyChannelApprovalToken,
  withSpurvik,
} = await import(pathToFileURL(join(sdkDist, "index.js")).href);

test("Cloudflare Workers / Edge Fetch handler emits 0-prompt HMAC receipts, preserves x-watermark, and enforces one-time HITL nonces", async () => {
  const ingestedPayloads = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      ingestedPayloads.push(raw);
      res.writeHead(202, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ accepted: 1 }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const kvMemory = new Map();
  const kvStore = {
    async get(key) {
      return kvMemory.get(key) ?? null;
    },
    async set(key, value) {
      kvMemory.set(key, value);
    },
    async delete(key) {
      kvMemory.delete(key);
    },
  };

  const secretPrompt = "EDGE_SENSITIVE_CUSTOMER_IBAN_DK5000400440116243";
  const mockModelClient = {
    chat: {
      completions: {
        async create() {
          return {
            id: "chatcmpl_edge_1",
            model: "grok-3-mini",
            choices: [{ index: 0, message: { role: "assistant", content: "Your order refund check is queued." } }],
            usage: { prompt_tokens: 14, completion_tokens: 8, total_tokens: 22 },
          };
        },
      },
    },
  };

  const signingSecret = "edge-worker-signing-secret-32chars!!";
  const contentHashSecret = "edge-worker-content-secret-32chars!!";

  let pendingFlush = Promise.resolve();
  const worker = createEdgeWorker({
    withSpurvik,
    provenanceOf,
    KvTelemetryBuffer,
    createSignedApprovalLinks,
    verifyChannelApprovalToken,
    kvStore,
    modelClient: mockModelClient,
    upstreamHeaders: { "x-watermark": "true" },
    config: {
      apiKey: "spurvik_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      signingSecret,
      contentHash: { mode: "keyed", secret: contentHashSecret },
      baseUrl,
      publicOrigin: "https://edge-demo.example",
      riskTier: "limited_art50",
      article50Disclosure: true,
    },
  });

  try {
    const chatRes = await worker.fetch(
      new Request("https://edge-demo.example/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: secretPrompt }),
      }),
      {
        waitUntil(promise) {
          pendingFlush = promise;
        },
      },
    );

    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.headers.get("x-watermark"), "true");
    assert.match(chatRes.headers.get("x-spurvik-disclosure") ?? "", /Art\. 50\(1\)/);

    const chatBody = await chatRes.json();
    assert.equal(chatBody.aiDisclosure.upstreamWatermarkHeaderPreserved, true);
    assert.ok(chatBody.provenance?.signature, "Edge response must attach HMAC provenance signature");
    await pendingFlush;

    assert.ok(ingestedPayloads.length >= 1, "Telemetry batch must flush via waitUntil");
    for (const rawBatch of ingestedPayloads) {
      assert.equal(rawBatch.includes(secretPrompt), false, "Raw prompt/IBAN must never appear in telemetry");
    }

    const links = worker.createRefundApprovalLinks("gate_edge_99", "Refund EUR 450 on order #99");
    const firstClick = await worker.fetch(new Request(links.approveUrl));
    assert.equal(firstClick.status, 200);
    const firstJson = await firstClick.json();
    assert.equal(firstJson.ok, true);
    assert.equal(firstJson.decision, "approved");

    const replayClick = await worker.fetch(new Request(links.approveUrl));
    assert.equal(replayClick.status, 409, "Replaying the same signed approval nonce must be rejected");
  } finally {
    server.close();
  }
});
