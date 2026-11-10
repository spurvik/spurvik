import type { HitlStatus } from "@spurvik/core";
import { describe, expect, it } from "vitest";
import { SpurvikClient } from "./client.js";
import { resolveAgentInterruptions } from "./openai-agents.js";
import type { SpurvikConfig } from "./config.js";
import { SpurvikHitlRejectedError } from "./errors.js";

const API_KEY = `spurvik_live_${"a".repeat(40)}`;
const SIGNING_SECRET = "signing-secret-value"; // ci-allow-test-key: test fixture

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function record(status: HitlStatus) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    projectId: "88888888-8888-4888-8888-888888888888",
    actionName: "send_notice",
    payloadSummary: "keys=to",
    status,
    reviewerId: status === "pending" ? null : "reviewer-1",
    decidedAt: status === "pending" ? null : "2026-10-17T10:05:00.000Z",
    overrideReason: status === "overridden" ? "Human reversed the earlier decision." : null,
    decisionReason: status === "pending" ? null : "Reviewed in the queue.",
    decisionSource: status === "pending" ? null : "api",
    createdAt: "2026-10-17T10:00:00.000Z",
  };
}

function clientFor(status: HitlStatus): SpurvikClient {
  const config: SpurvikConfig = {
    apiKey: API_KEY,
    baseUrl: "http://control.test",
    riskTier: "limited_art50",
    signingSecret: SIGNING_SECRET,
    contentHash: { mode: "off" },
    fetch: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/oversight")) {
        return jsonResponse({
          data: {
            projectHalted: false,
            actionName: null,
            actionHalted: false,
            reason: null,
            reviewerId: null,
            updatedAt: "2026-10-17T10:00:00.000Z",
          },
        });
      }
      if (url.endsWith("/api/v1/hitl") && method === "POST") return jsonResponse({ data: record("pending") });
      if (url.includes("/api/v1/hitl/")) return jsonResponse({ data: record(status) });
      return jsonResponse({ data: {} });
    },
    registerProcessHooks: false,
    telemetry: { flushIntervalMs: 60_000, maxRetries: 0, maxBatch: 1 },
    oversight: { pushInvalidation: false },
  };
  return new SpurvikClient(config);
}

function fakeState() {
  const calls: Array<{ kind: "approve" | "reject"; args: unknown[] }> = [];
  return {
    calls,
    approve: (_item: unknown, ...args: unknown[]) => {
      calls.push({ kind: "approve", args });
    },
    reject: (_item: unknown, ...args: unknown[]) => {
      calls.push({ kind: "reject", args });
    },
  };
}

const interruption = { callId: "call_1", name: "send_notice", arguments: JSON.stringify({ to: "person@example.com" }) };

describe("resolveAgentInterruptions overridden means do not continue", () => {
  it("approved calls state.approve", async () => {
    const state = fakeState();
    const result = await resolveAgentInterruptions([interruption], clientFor("approved"), { state });
    expect(state.calls.map((call) => call.kind)).toEqual(["approve"]);
    expect(result.allApproved).toBe(true);
    expect(result.decisions[0]?.approved).toBe(true);
  });

  it("overridden calls state.reject with the overridden message, never state.approve", async () => {
    const state = fakeState();
    const result = await resolveAgentInterruptions([interruption], clientFor("overridden"), { state });
    expect(state.calls).toEqual([{ kind: "reject", args: [{ message: "The decision was overridden." }] }]);
    expect(result.allApproved).toBe(false);
    expect(result.decisions[0]?.approved).toBe(false);
    expect(result.decisions[0]?.status).toBe("overridden");
  });

  it("rejected calls state.reject without a message", async () => {
    const state = fakeState();
    const result = await resolveAgentInterruptions([interruption], clientFor("rejected"), { state });
    expect(state.calls).toEqual([{ kind: "reject", args: [] }]);
    expect(result.decisions[0]?.status).toBe("rejected");
  });

  it("overridden rethrows after state.reject with throwOnReject", async () => {
    const state = fakeState();
    const error = await resolveAgentInterruptions([interruption], clientFor("overridden"), { state, throwOnReject: true }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SpurvikHitlRejectedError);
    expect((error as SpurvikHitlRejectedError).record.status).toBe("overridden");
    expect(state.calls.map((call) => call.kind)).toEqual(["reject"]);
  });
});
