import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildChannelOutboundRequest,
  createMultiChannelApprovalRouter,
  createSignedApprovalLinks,
  dispatchHumanApprovalChannel,
  verifyChannelApprovalToken,
  verifySignedChannelCallback,
  type HumanApprovalChannelConfig,
} from "./channels.js";
import { SpurvikConfigError } from "./errors.js";

const SECRET = "release-1104-channel-secret-xyz";
const T0 = 1_793_770_000;
const req = {
  gateId: "gate_r1104",
  actionName: "db.delete_records",
  summary: "Delete 12 archived rows",
  callbackBaseUrl: "https://approvals.example/hitl/callback",
};

const VALID: HumanApprovalChannelConfig[] = [
  { type: "slack", webhookUrl: "https://hooks.slack.com/services/T0/B0/X0" },
  { type: "telegram", botToken: "123:ABC", chatId: "-100999" },
  { type: "email", resendApiKey: "re_test_123", from: "a@example.eu", to: ["b@example.eu"] },
  { type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/abc" },
  { type: "teams", webhookUrl: "https://example.webhook.office.com/x" },
  { type: "linear", apiKey: "lin_api_test", teamId: "team_eu" },
  { type: "jira", baseUrl: "https://c.atlassian.net", email: "o@example.eu", apiToken: "tok", projectKey: "AI" },
  { type: "monday", apiToken: "mon_tok", boardId: "987654" },
  { type: "asana", accessToken: "asana_pat", projectGid: "120001" },
];
const REQUIRED: Record<string, string[]> = {
  slack: ["webhookUrl"],
  telegram: ["botToken", "chatId"],
  email: ["resendApiKey", "from", "to"],
  discord: ["webhookUrl"],
  teams: ["webhookUrl"],
  linear: ["apiKey", "teamId"],
  jira: ["baseUrl", "email", "apiToken", "projectKey"],
  monday: ["apiToken", "boardId"],
  asana: ["accessToken", "projectGid"],
};

function expectedToken(decision: "approved" | "rejected", actionHmac: string, ts: number, nonce: string, secret = SECRET) {
  return createHmac("sha256", secret)
    .update(`spurvik:art14:decision:v1|${req.gateId}|${actionHmac}|${decision}|${ts}|${nonce}`, "utf8")
    .digest("hex");
}

describe("verifyChannelApprovalToken (independent HMAC computation)", () => {
  const links = createSignedApprovalLinks(req, SECRET, T0);
  const base = { gateId: req.gateId, actionHmac: links.actionHmac, issuedAtUnix: T0, signingSecret: SECRET, nowUnixSeconds: T0 + 60, nonce: links.nonce };

  it("matches an independently computed HMAC-SHA256 and accepts it", () => {
    const actionHmac = createHmac("sha256", SECRET).update(`spurvik:art12:v1|${req.gateId}|${req.actionName}|`, "utf8").digest("hex");
    expect(links.actionHmac).toBe(actionHmac);
    expect(links.approveToken).toBe(expectedToken("approved", actionHmac, T0, links.nonce));
    expect(links.rejectToken).toBe(expectedToken("rejected", actionHmac, T0, links.nonce));
    expect(verifyChannelApprovalToken({ ...base, decision: "approved", signature: links.approveToken })).toBe(true);
    expect(verifyChannelApprovalToken({ ...base, decision: "rejected", signature: links.rejectToken })).toBe(true);
  });

  it("rejects a tampered signature, gate, action HMAC, timestamp or decision", () => {
    const flipped = (links.approveToken[0] === "a" ? "b" : "a") + links.approveToken.slice(1);
    expect(verifyChannelApprovalToken({ ...base, decision: "approved", signature: flipped })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, gateId: "gate_other", decision: "approved", signature: links.approveToken })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, actionHmac: "0".repeat(64), decision: "approved", signature: links.approveToken })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, issuedAtUnix: T0 + 1, decision: "approved", signature: links.approveToken })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, decision: "rejected", signature: links.approveToken })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, decision: "approved", signature: "zz" + links.approveToken.slice(2) })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, decision: "approved", signature: links.approveToken.slice(0, 63) })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, decision: "approved", signature: undefined as unknown as string })).toBe(false);
  });

  it("rejects a token signed with another secret", () => {
    const other = createSignedApprovalLinks(req, "another-secret-of-16-plus", T0);
    expect(verifyChannelApprovalToken({ ...base, actionHmac: other.actionHmac, decision: "approved", signature: other.approveToken })).toBe(false);
  });

  it("rejects an expired token (default 15 min and custom window)", () => {
    expect(verifyChannelApprovalToken({ ...base, nowUnixSeconds: T0 + 901, decision: "approved", signature: links.approveToken })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, nowUnixSeconds: T0 + 900, decision: "approved", signature: links.approveToken })).toBe(true);
    expect(verifyChannelApprovalToken({ ...base, maxAgeSeconds: 300, nowUnixSeconds: T0 + 301, decision: "approved", signature: links.approveToken })).toBe(false);
  });

  it("throws when the signing secret is missing or short", () => {
    for (const bad of [undefined, "", "   ", "short-secret"]) {
      expect(() => createSignedApprovalLinks(req, bad as unknown as string, T0)).toThrow(SpurvikConfigError);
      expect(() =>
        verifyChannelApprovalToken({ ...base, signingSecret: bad as unknown as string, decision: "approved", signature: links.approveToken }),
      ).toThrow(SpurvikConfigError);
      expect(() => createMultiChannelApprovalRouter({ signingSecret: bad as unknown as string, channels: [VALID[0]!] })).toThrow(SpurvikConfigError);
    }
  });
});

describe("channel config validation (throw when no key is passed)", () => {
  const links = createSignedApprovalLinks(req, SECRET, T0);
  for (const ch of VALID) {
    for (const field of REQUIRED[ch.type]!) {
      it(`${ch.type}: throws when "${field}" is missing or blank`, () => {
        const missing = { ...ch } as Record<string, unknown>;
        delete missing[field];
        expect(() => buildChannelOutboundRequest(missing as unknown as HumanApprovalChannelConfig, req, links)).toThrow(SpurvikConfigError);
        const blank = { ...ch, [field]: field === "to" ? [] : "  " } as unknown as HumanApprovalChannelConfig;
        expect(() => buildChannelOutboundRequest(blank, req, links)).toThrow(SpurvikConfigError);
        expect(() => createMultiChannelApprovalRouter({ signingSecret: SECRET, channels: [blank] })).toThrow(SpurvikConfigError);
      });
    }
    it(`${ch.type}: a complete config builds an https request carrying the gate id`, () => {
      const built = buildChannelOutboundRequest(ch, req, links);
      expect(built.url).toMatch(/^https:\/\//);
      expect(typeof built.body).toBe("string");
      expect(built.body).toContain(req.gateId);
    });
  }
  it("throws for an unknown channel type", () => {
    expect(() => buildChannelOutboundRequest({ type: "fax" } as unknown as HumanApprovalChannelConfig, req, links)).toThrow(SpurvikConfigError);
  });
});

describe("outbound payload safety", () => {
  it("escapes HTML in the email body", () => {
    const evil = { ...req, summary: '<img src=x onerror="alert(1)">' };
    const links = createSignedApprovalLinks(evil, SECRET, T0);
    const built = buildChannelOutboundRequest(VALID[2]!, evil, links);
    const html = (JSON.parse(built.body) as { html: string }).html;
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("throws on GraphQL errors returned with HTTP 200 (Linear, Monday)", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ errors: [{ message: "bad team" }] }), { status: 200 })) as typeof fetch;
    await expect(dispatchHumanApprovalChannel(VALID[5]!, req, { signingSecret: SECRET, fetchImpl })).rejects.toThrow(/GraphQL/);
    await expect(dispatchHumanApprovalChannel(VALID[7]!, req, { signingSecret: SECRET, fetchImpl })).rejects.toThrow(/GraphQL/);
  });

  it("reads the Monday create_item id", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { create_item: { id: "555" } } }), { status: 200 })) as typeof fetch;
    const r = await dispatchHumanApprovalChannel(VALID[7]!, req, { signingSecret: SECRET, fetchImpl });
    expect(r.externalId).toBe("555");
  });

  it("throws on a non-2xx reply", async () => {
    const fetchImpl = (async () => new Response("no", { status: 403 })) as typeof fetch;
    await expect(dispatchHumanApprovalChannel(VALID[0]!, req, { signingSecret: SECRET, fetchImpl })).rejects.toThrow(/HTTP 403/);
  });
});

describe("1.0.5 timestamp handling", () => {
  const links = createSignedApprovalLinks(req, SECRET, T0);
  const base = { gateId: req.gateId, actionHmac: links.actionHmac, issuedAtUnix: T0, signingSecret: SECRET, decision: "approved" as const, signature: links.approveToken, nonce: links.nonce };
  it("rejects a token issued more than 5 minutes in the future", () => {
    expect(verifyChannelApprovalToken({ ...base, nowUnixSeconds: T0 - 301 })).toBe(false);
    expect(verifyChannelApprovalToken({ ...base, nowUnixSeconds: T0 - 300 })).toBe(true);
  });
  it("rejects a non-numeric issuedAt", () => {
    expect(verifyChannelApprovalToken({ ...base, issuedAtUnix: Number.NaN, nowUnixSeconds: T0 })).toBe(false);
  });
});

describe("domain prefixes, legacy tokens, and verifySignedChannelCallback", () => {
  const links = createSignedApprovalLinks(req, SECRET, T0);

  it("pins spurvik:art12 and spurvik:art14 prefixes and still verifies a 1.0.4 token with no nonce", () => {
    const actionHmac = createHmac("sha256", SECRET)
      .update(`spurvik:art12:v1|${req.gateId}|${req.actionName}|`, "utf8")
      .digest("hex");
    expect(links.actionHmac).toBe(actionHmac);
    const legacy = createHmac("sha256", SECRET)
      .update(`spurvik:art14:decision:v1|${req.gateId}|${actionHmac}|approved|${T0}`, "utf8")
      .digest("hex");
    expect(
      verifyChannelApprovalToken({
        gateId: req.gateId,
        actionHmac,
        decision: "approved",
        issuedAtUnix: T0,
        signature: legacy,
        signingSecret: SECRET,
        nowUnixSeconds: T0 + 30,
      }),
    ).toBe(true);
    const current = createHmac("sha256", SECRET)
      .update(`spurvik:art14:decision:v1|${req.gateId}|${actionHmac}|approved|${T0}|${links.nonce}`, "utf8")
      .digest("hex");
    expect(links.approveToken).toBe(current);
  });

  it("rejects a secret with leading or trailing whitespace", () => {
    expect(() => createSignedApprovalLinks(req, ` ${SECRET}`, T0)).toThrow(/whitespace/);
    expect(() => createSignedApprovalLinks(req, `${SECRET}\n`, T0)).toThrow(/whitespace/);
  });

  it("throws when callbackBaseUrl is missing", () => {
    const { callbackBaseUrl: _omit, ...without } = req;
    expect(() => createSignedApprovalLinks(without, SECRET, T0)).toThrow(/callbackBaseUrl is required/);
  });

  it("verifySignedChannelCallback is an alias that returns false for a missing signature and does not throw", () => {
    expect(
      verifySignedChannelCallback({
        gateId: req.gateId,
        actionHmac: links.actionHmac,
        decision: "approved",
        issuedAtUnix: T0,
        signature: undefined,
        nonce: links.nonce,
        signingSecret: "short",
      }),
    ).toBe(false);
    const ok = verifySignedChannelCallback({
      gateId: req.gateId,
      actionHmac: links.actionHmac,
      decision: "approved",
      issuedAtUnix: T0,
      signature: links.approveToken,
      nonce: links.nonce,
      signingSecret: SECRET,
      nowUnixSeconds: T0 + 10,
    });
    expect(ok).toEqual({
      ok: true,
      decision: "approved",
      gateId: req.gateId,
      actionHmac: links.actionHmac,
      issuedAtUnix: T0,
      nonce: links.nonce,
    });
  });
});
