import type { HitlStatus } from "@spurvik/core";
import { describe, expect, it } from "vitest";
import { SpurvikClient } from "./client.js";
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

describe("requireHumanApproval", () => {
  it("returns an approved row", async () => {
    const decision = await clientFor("approved").requireHumanApproval("send_notice", { to: "person@example.com" });
    expect(decision.status).toBe("approved");
  });

  it("throws on rejected", async () => {
    const error = await clientFor("rejected")
      .requireHumanApproval("send_notice", { to: "person@example.com" })
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(SpurvikHitlRejectedError);
    expect((error as SpurvikHitlRejectedError).record.status).toBe("rejected");
    expect((error as SpurvikHitlRejectedError).message).toContain("was rejected");
  });

  it("throws on overridden the same way it throws on rejected", async () => {
    const error = await clientFor("overridden")
      .requireHumanApproval("send_notice", { to: "person@example.com" })
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(SpurvikHitlRejectedError);
    expect((error as SpurvikHitlRejectedError).record.status).toBe("overridden");
    expect((error as SpurvikHitlRejectedError).message).toContain("was overridden");
    expect((error as SpurvikHitlRejectedError).message).not.toContain("was rejected");
  });
});
