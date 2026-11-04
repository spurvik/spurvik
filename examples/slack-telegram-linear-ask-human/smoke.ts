import assert from "node:assert/strict";
import {
  createSignedApprovalLinks,
  verifyChannelApprovalToken,
  type HitlRecordWire,
  type HumanChannelActionRequest,
} from "spurvik";
import * as spurvik from "spurvik";
import type { ChannelEnv } from "./ask-human.js";
import { createAskHumanClient, runRoutedAskHuman, type AskHumanResult } from "./ask-human.js";

const SIGNING_SECRET = "test-signing-secret-16";
const API_KEY = `spurvik_live_${"a".repeat(32)}`;
const CALLBACK_BASE_URL = "https://callbacks.test/hitl";
const CONTROL_PLANE = "http://control.test";

const REQUEST: HumanChannelActionRequest = {
  gateId: "gate_smoke",
  actionName: "billing.refund",
  summary: "Review refund 2400 EUR for invoice 8841",
  context: { amountEur: 2400, invoice: "8841" },
  callbackBaseUrl: CALLBACK_BASE_URL,
};

type QueueScript = "approved" | "rejected" | "overridden" | "pending";

interface RecordedCall {
  url: string;
  method: string;
  body: string;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL)) return input.method.toUpperCase();
  return "GET";
}

function requestBody(init?: RequestInit): string {
  return typeof init?.body === "string" ? init.body : "";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hitlRecord(status: HitlRecordWire["status"], actionName: string): HitlRecordWire {
  const decided = status !== "pending" && status !== "pending_confirmation";
  return {
    id: "hitl_smoke",
    projectId: "project_smoke",
    actionName,
    payloadSummary: "{}",
    status,
    reviewerId: decided ? "member_smoke" : null,
    decidedAt: decided ? "2026-11-04T00:00:00.000Z" : null,
    overrideReason: status === "overridden" ? "smoke override" : null,
    decisionReason: decided ? "smoke decision" : null,
    decisionSource: decided ? "api" : null,
    createdAt: "2026-11-04T00:00:00.000Z",
  };
}

function createPlane(script: QueueScript): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const body = requestBody(init);
    calls.push({ url, method, body });
    if (url.startsWith("https://hooks.slack.test/")) return new Response("ok", { status: 200 });
    if (url.startsWith("https://api.telegram.test/")) {
      return jsonResponse({ ok: true, result: { message_id: 7 } });
    }
    if (url.startsWith("https://api.linear.test/")) {
      return jsonResponse({ data: { issueCreate: { success: true, issue: { id: "issue_1" } } } });
    }
    const parsed = new URL(url);
    if (parsed.origin !== CONTROL_PLANE) throw new Error(`Unexpected fetch ${method} ${url}`);
    if (parsed.pathname.startsWith("/api/v1/oversight")) {
      return jsonResponse({
        data: {
          projectHalted: false,
          actionName: null,
          actionHalted: false,
          reason: null,
          previousReason: null,
          reviewerId: null,
          updatedAt: null,
          epoch: 1,
        },
      });
    }
    if (parsed.pathname === "/api/v1/hitl" && method === "POST") {
      const posted = JSON.parse(body) as { actionName?: string };
      return jsonResponse({ data: hitlRecord("pending", posted.actionName ?? REQUEST.actionName) });
    }
    if (parsed.pathname === "/api/v1/hitl/hitl_smoke" && method === "GET") {
      return jsonResponse({ data: hitlRecord(script === "pending" ? "pending" : script, REQUEST.actionName) });
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  };
  return { fetchImpl, calls };
}

function envFor(fetchImpl: typeof fetch): ChannelEnv {
  return {
    signingSecret: SIGNING_SECRET,
    callbackBaseUrl: CALLBACK_BASE_URL,
    fetchImpl,
    slackWebhookUrl: "https://hooks.slack.test/services/replace/me",
    telegramBotToken: "test-token",
    telegramChatId: "chat-test",
    telegramApiBaseUrl: "https://api.telegram.test",
    linearApiKey: "lin_test",
    linearTeamId: "team_test",
    linearApiUrl: "https://api.linear.test/graphql",
  };
}

function clientFor(fetchImpl: typeof fetch, timeoutMs = 30) {
  return createAskHumanClient({
    apiKey: API_KEY,
    signingSecret: SIGNING_SECRET,
    baseUrl: CONTROL_PLANE,
    fetchImpl,
    sleep: async () => undefined,
    timeoutMs,
    pollIntervalMs: 1,
  });
}

function slackActionUrls(body: string): { approveUrl: string; rejectUrl: string } {
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || !("blocks" in parsed) || !Array.isArray(parsed.blocks)) {
    throw new Error("Slack payload has no blocks.");
  }
  const actions = parsed.blocks.find(
    (block: unknown) =>
      block !== null && typeof block === "object" && "type" in block && block.type === "actions",
  );
  if (!actions || typeof actions !== "object" || !("elements" in actions) || !Array.isArray(actions.elements)) {
    throw new Error("Slack payload has no action links.");
  }
  const approve = actions.elements[0];
  const reject = actions.elements[1];
  if (!approve || typeof approve !== "object" || !("url" in approve) || typeof approve.url !== "string") {
    throw new Error("Slack approve link is missing.");
  }
  if (!reject || typeof reject !== "object" || !("url" in reject) || typeof reject.url !== "string") {
    throw new Error("Slack reject link is missing.");
  }
  return { approveUrl: approve.url, rejectUrl: reject.url };
}

async function run(script: QueueScript, timeoutMs = 30, extra?: { callbackUrl?: string; useRejectLink?: boolean }) {
  const plane = createPlane(script);
  const client = clientFor(plane.fetchImpl, timeoutMs);
  try {
    const result = await runRoutedAskHuman({
      env: envFor(plane.fetchImpl),
      client,
      request: REQUEST,
      callbackUrl: extra?.callbackUrl,
      useRejectLink: extra?.useRejectLink,
    });
    return { result, calls: plane.calls };
  } finally {
    await client.shutdown();
  }
}

function assertStopped(
  result: AskHumanResult,
  status: "rejected" | "overridden" | "timeout" | "callback_mismatch",
): void {
  assert.equal(result.continue, false);
  assert.equal(result.status, status);
}

async function main(): Promise<void> {
  assert.equal(typeof spurvik.createMultiChannelApprovalRouter, "function");
  assert.equal(typeof spurvik.createSignedApprovalLinks, "function");
  assert.equal(typeof spurvik.verifyChannelApprovalToken, "function");
  assert.equal(typeof spurvik.verifySignedChannelCallback, "function");

  const approved = await run("approved");
  assert.equal(approved.result.continue, true);
  assert.equal(approved.result.status, "approved");
  if (approved.result.status !== "approved") throw new Error("expected approved");
  assert.equal(approved.result.callbackMatch, true);
  assert.equal(approved.result.record.status, "approved");
  assert.equal(approved.result.gateId, "gate_smoke");
  assert.deepEqual(approved.result.channels, ["slack", "telegram", "linear"]);

  const routed = approved.calls.filter((call) => call.method === "POST").slice(0, 3);
  assert.deepEqual(
    routed.map((call) => call.url),
    [
      "https://hooks.slack.test/services/replace/me",
      "https://api.telegram.test/bottest-token/sendMessage",
      "https://api.linear.test/graphql",
    ],
  );
  const slack = routed[0];
  const linear = routed[2];
  if (!slack || !linear) throw new Error("missing channel call");
  assert.ok(routed.every((call) => call.body.includes("gate_smoke")));
  assert.ok(linear.body.includes("team_test"));

  const { approveUrl, rejectUrl } = slackActionUrls(slack.body);
  const approveParsed = new URL(approveUrl);
  const rejectParsed = new URL(rejectUrl);
  const issuedAtUnix = Number(approveParsed.searchParams.get("ts"));
  const dispatchedNonce = approveParsed.searchParams.get("nonce") ?? undefined;
  assert.equal(Number.isInteger(issuedAtUnix), true);
  assert.equal(typeof dispatchedNonce, "string");
  assert.equal(rejectParsed.searchParams.get("nonce"), dispatchedNonce);
  assert.equal(
    verifyChannelApprovalToken({
      gateId: "gate_smoke",
      actionHmac: approved.result.actionHmac,
      decision: "approved",
      issuedAtUnix,
      nonce: dispatchedNonce,
      signature: approveParsed.searchParams.get("sig") ?? "",
      signingSecret: SIGNING_SECRET,
      nowUnixSeconds: issuedAtUnix,
    }),
    true,
  );
  const links = createSignedApprovalLinks(REQUEST, SIGNING_SECRET, issuedAtUnix);
  assert.equal(links.actionHmac, approved.result.actionHmac);
  assert.equal(
    verifyChannelApprovalToken({
      gateId: links.gateId,
      actionHmac: links.actionHmac,
      decision: "approved",
      issuedAtUnix: links.issuedAtUnix,
      nonce: links.nonce,
      signature: links.approveToken,
      signingSecret: SIGNING_SECRET,
      nowUnixSeconds: links.issuedAtUnix,
    }),
    true,
  );
  assert.equal(
    verifyChannelApprovalToken({
      gateId: links.gateId,
      actionHmac: links.actionHmac,
      decision: "rejected",
      issuedAtUnix: links.issuedAtUnix,
      nonce: links.nonce,
      signature: links.approveToken,
      signingSecret: SIGNING_SECRET,
      nowUnixSeconds: links.issuedAtUnix,
    }),
    false,
  );
  const flippedSignature = `${links.approveToken.slice(0, -1)}${links.approveToken.endsWith("0") ? "1" : "0"}`;
  assert.equal(
    verifyChannelApprovalToken({
      gateId: links.gateId,
      actionHmac: links.actionHmac,
      decision: "approved",
      issuedAtUnix: links.issuedAtUnix,
      nonce: links.nonce,
      signature: flippedSignature,
      signingSecret: SIGNING_SECRET,
      nowUnixSeconds: links.issuedAtUnix,
    }),
    false,
  );
  assert.equal(
    verifyChannelApprovalToken({
      gateId: links.gateId,
      actionHmac: links.actionHmac,
      decision: "approved",
      issuedAtUnix: links.issuedAtUnix,
      nonce: links.nonce,
      signature: links.approveToken,
      signingSecret: SIGNING_SECRET,
      maxAgeSeconds: 60,
      nowUnixSeconds: links.issuedAtUnix + 120,
    }),
    false,
  );

  const rejected = await run("rejected");
  assertStopped(rejected.result, "rejected");
  assert.equal(rejected.result.callbackMatch, true);
  if (rejected.result.status === "rejected") assert.equal(rejected.result.record?.status, "rejected");

  const overridden = await run("overridden");
  assertStopped(overridden.result, "overridden");
  assert.equal(overridden.result.callbackMatch, true);
  if (overridden.result.status === "overridden") assert.equal(overridden.result.record.status, "overridden");

  const timedOut = await run("pending", 25);
  assertStopped(timedOut.result, "timeout");
  assert.equal(timedOut.result.callbackMatch, true);

  const rejectLink = await run("approved", 30, { useRejectLink: true });
  assertStopped(rejectLink.result, "rejected");
  assert.equal(rejectLink.result.callbackMatch, true);
  if (rejectLink.result.status === "rejected") assert.equal(rejectLink.result.record, undefined);
  assert.equal(rejectLink.calls.some((call) => call.url.includes("/api/v1/hitl")), false);

  const mismatch = await run("approved", 30, {
    callbackUrl: `${CALLBACK_BASE_URL}?gateId=gate_smoke&ts=1&hmac=abcd&decision=approved&sig=00`,
  });
  assertStopped(mismatch.result, "callback_mismatch");
  assert.equal(mismatch.result.callbackMatch, false);
  assert.equal(mismatch.calls.some((call) => call.url.includes("/api/v1/hitl")), false);

  console.log("smoke ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
