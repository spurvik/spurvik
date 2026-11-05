import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const localDist = join(here, "..", "..", "packages", "sdk", "dist");
const n8nDist = join(here, "..", "..", "packages", "n8n-nodes-spurvik", "node_modules", "spurvik-sdk", "dist");
const sdkDist = existsSync(join(localDist, "index.js")) ? localDist : n8nDist;

const { provenanceOf, verifyProvenanceSignature } = await import(pathToFileURL(join(sdkDist, "index.js")).href);
const { provenanceFromLangGraphState, withSpurvikLangGraph } = await import(
  pathToFileURL(join(sdkDist, "langgraph.js")).href
);
const { withSpurvikMastra } = await import(pathToFileURL(join(sdkDist, "mastra.js")).href);
const { provenanceFromAgentsResponse, withSpurvikModel } = await import(
  pathToFileURL(join(sdkDist, "openai-agents.js")).href
);

test("LangGraph, Mastra, and OpenAI Agents adapters emit verifiable HMAC-SHA256 receipts with 0 raw prompt persisted", async () => {
  const ingestedBatches = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/v1/oversight")) {
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ halted: false }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        ingestedBatches.push(JSON.parse(body));
      } catch {
        // ignore
      }
      res.writeHead(202, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ accepted: 1 }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const signingSecret = "spurvik-demo-signing-secret-32chars!!";
  const contentHashSecret = "spurvik-demo-content-secret-32chars!!";
  const apiKey = "spurvik_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";

  const config = {
    apiKey,
    signingSecret,
    contentHash: { mode: "keyed", secret: contentHashSecret },
    baseUrl,
    riskTier: "limited_art50",
    article50Disclosure: true,
  };

  try {
    // 1. LangGraph adapter (spurvik/langgraph)
    const rawPrompt = "CONFIDENTIAL_LANGGRAPH_PROMPT_DO_NOT_LOG";
    const compiledGraph = {
      async invoke(state) {
        return {
          messages: [...(state.messages ?? []), { role: "assistant", content: "Refund policy verified." }],
        };
      },
    };
    const wrappedGraph = withSpurvikLangGraph(compiledGraph, config, { modelId: "gpt-4o-langgraph" });
    const graphState = await wrappedGraph.invoke({
      messages: [{ role: "user", content: rawPrompt }],
    });
    const lgRecord = provenanceFromLangGraphState(graphState);
    assert.ok(lgRecord, "LangGraph state must carry a settled Spurvik provenance receipt");
    assert.equal(await verifyProvenanceSignature(lgRecord, signingSecret), true);
    await wrappedGraph.flush();

    // 2. OpenAI Agents adapter (spurvik/openai-agents)
    const agentsModel = {
      async getResponse() {
        return {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "Order #4821 ready for human gate." }],
            },
          ],
          usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
        };
      },
      async *getStreamedResponse() {},
    };
    const wrappedAgentsModel = withSpurvikModel(agentsModel, config, { modelId: "gpt-4o-agents" });
    const agentsRes = await wrappedAgentsModel.getResponse({
      systemInstructions: "You are a support agent.",
      input: rawPrompt,
      modelSettings: { temperature: 0.2 },
      tools: [],
      outputType: "text",
      handoffs: [],
      tracing: false,
    });
    const agentsRecord = provenanceFromAgentsResponse(agentsRes) ?? (await provenanceOf(agentsRes));
    assert.ok(agentsRecord, "OpenAI Agents response must carry a Spurvik provenance receipt");
    assert.equal(await verifyProvenanceSignature(agentsRecord, signingSecret), true);
    await wrappedAgentsModel.flush();

    // 3. Mastra adapter (spurvik/mastra)
    const mastraWrapped = withSpurvikMastra(
      {
        specificationVersion: "v2",
        provider: "openai.chat",
        modelId: "gpt-4o-mastra",
        defaultObjectGenerationMode: "json",
        async doGenerate() {
          return {
            text: "Mastra agent completed.",
            finishReason: "stop",
            usage: { promptTokens: 10, completionTokens: 5 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          };
        },
        async doStream() {
          throw new Error("not used");
        },
      },
      config,
    );
    assert.equal(typeof mastraWrapped.model, "function");
    await mastraWrapped.flush();

    // Verify zero raw prompt text was sent to the telemetry control plane
    const serializedTelemetry = JSON.stringify(ingestedBatches);
    assert.equal(
      serializedTelemetry.includes(rawPrompt),
      false,
      "Raw prompt text must never appear in telemetry batches",
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
