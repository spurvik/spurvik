import type { HitlStatus } from "@spurvik/core";
import { describe, expect, it } from "vitest";
import { SpurvikClient } from "./client.js";
import { resolveLangGraphInterrupts, spurvikInterrupt } from "./langgraph.js";
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

describe("spurvikInterrupt overridden means do not continue", () => {
  it("approved continues", async () => {
    const decision = await spurvikInterrupt({ actionName: "send_notice", callId: "c1" }, clientFor("approved"));
    expect(decision.approved).toBe(true);
    expect(decision.status).toBe("approved");
    expect(decision.resume.approved).toBe(true);
  });

  it("overridden returns approved false and keeps the overridden status", async () => {
    const decision = await spurvikInterrupt({ actionName: "send_notice", callId: "c1" }, clientFor("overridden"));
    expect(decision.approved).toBe(false);
    expect(decision.status).toBe("overridden");
    expect(decision.resume.approved).toBe(false);
    expect(decision.resume.status).toBe("overridden");
    expect(decision.command.resume).toEqual(decision.resume);
  });

  it("rejected returns approved false with status rejected", async () => {
    const decision = await spurvikInterrupt({ actionName: "send_notice", callId: "c1" }, clientFor("rejected"));
    expect(decision.approved).toBe(false);
    expect(decision.status).toBe("rejected");
  });

  it("overridden throws with throwOnReject", async () => {
    const error = await spurvikInterrupt({ actionName: "send_notice" }, clientFor("overridden"), { throwOnReject: true }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SpurvikHitlRejectedError);
    expect((error as SpurvikHitlRejectedError).record.status).toBe("overridden");
  });

  it("a resume value that claims approved with status overridden is settled to approved false", async () => {
    const decision = await spurvikInterrupt(
      {
        actionName: "send_notice",
        callId: "c1",
        interrupt: async () => ({ approved: true, status: "overridden", approvalId: "77777777-7777-4777-8777-777777777777" }),
      },
      clientFor("approved"),
    );
    expect(decision.approved).toBe(false);
    expect(decision.status).toBe("overridden");
    expect(decision.resume.approved).toBe(false);
    expect(decision.command.resume.approved).toBe(false);
  });

  it("a resume value with approved and status approved continues", async () => {
    const decision = await spurvikInterrupt(
      {
        actionName: "send_notice",
        callId: "c1",
        interrupt: async () => ({ approved: true, status: "approved", approvalId: "77777777-7777-4777-8777-777777777777" }),
      },
      clientFor("rejected"),
    );
    expect(decision.approved).toBe(true);
    expect(decision.status).toBe("approved");
  });
});

describe("resolveLangGraphInterrupts overridden", () => {
  it("allApproved is false and the resume value says approved false", async () => {
    const result = await resolveLangGraphInterrupts([{ id: "i1", value: { actionName: "send_notice" } }], clientFor("overridden"));
    expect(result.allApproved).toBe(false);
    expect(result.decisions[0]?.status).toBe("overridden");
    expect(result.resumeById.i1?.approved).toBe(false);
  });

  it("allApproved is true when approved", async () => {
    const result = await resolveLangGraphInterrupts([{ id: "i1", value: { actionName: "send_notice" } }], clientFor("approved"));
    expect(result.allApproved).toBe(true);
    expect(result.resumeById.i1?.approved).toBe(true);
  });
});
