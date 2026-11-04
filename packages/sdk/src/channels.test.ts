import { describe, expect, it } from "vitest";
import {
  buildChannelOutboundRequest,
  createMultiChannelApprovalRouter,
  createSignedApprovalLinks,
  dispatchHumanApprovalChannel,
  verifyChannelApprovalToken,
  type HumanApprovalChannelConfig,
} from "./channels.js";

const TEST_SECRET = "spurvik-art14-channel-test-secret-2026";

describe("Multi-Channel Drop-In ask_human() Approval Router (EU AI Act Art. 12 & 14)", () => {
  it("generates deterministic HMAC-SHA256 digests and verifies constant-time callback signatures", () => {
    const links = createSignedApprovalLinks(
      {
        gateId: "gate_001",
        actionName: "stripe.refunds.create",
        summary: "Refund €240 for order #4821",
        context: { amountEur: 240, orderId: 4821 },
        callbackBaseUrl: "https://console.spurvik.com/api/v1/hitl",
      },
      TEST_SECRET,
      1_793_770_000,
    );

    expect(links.actionHmac).toHaveLength(64);
    expect(links.approveUrl).toContain("decision=approved");
    expect(links.rejectUrl).toContain("decision=rejected");

    expect(
      verifyChannelApprovalToken({
        gateId: "gate_001",
        actionHmac: links.actionHmac,
        decision: "approved",
        issuedAtUnix: 1_793_770_000,
        signature: links.approveToken,
        signingSecret: TEST_SECRET,
        nonce: links.nonce,
        nowUnixSeconds: 1_793_770_120,
      }),
    ).toBe(true);

    // Rejects tampered decision (e.g. using approveToken for rejected)
    expect(
      verifyChannelApprovalToken({
        gateId: "gate_001",
        actionHmac: links.actionHmac,
        decision: "rejected",
        issuedAtUnix: 1_793_770_000,
        signature: links.approveToken,
        signingSecret: TEST_SECRET,
        nonce: links.nonce,
        nowUnixSeconds: 1_793_770_120,
      }),
    ).toBe(false);

    // Rejects expired callback token
    expect(
      verifyChannelApprovalToken({
        gateId: "gate_001",
        actionHmac: links.actionHmac,
        decision: "approved",
        issuedAtUnix: 1_793_770_000,
        signature: links.approveToken,
        signingSecret: TEST_SECRET,
        nonce: links.nonce,
        maxAgeSeconds: 60,
        nowUnixSeconds: 1_793_770_300,
      }),
    ).toBe(false);
  });

  it("formats outbound payloads across all 9 supported channels (Slack, Telegram, Email, Discord, Teams, Linear, Jira, Monday, Asana)", () => {
    const req = {
      gateId: "gate_9ch",
      actionName: "db.delete_records",
      summary: "Delete 12 archived rows",
      callbackBaseUrl: "https://approvals.example/hitl/callback",
    };
    const links = createSignedApprovalLinks(req, TEST_SECRET, 1_793_770_000);

    const channels: HumanApprovalChannelConfig[] = [
      { type: "slack", webhookUrl: "https://hooks.slack.com/services/T0/B0/X0" },
      { type: "telegram", botToken: "123:ABC", chatId: "-100999" },
      { type: "email", resendApiKey: "re_test_123", from: "hello@spurvik.com", to: "cto@customer.eu" },
      { type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/abc" },
      { type: "teams", webhookUrl: "https://outlook.office.com/webhook/xyz" },
      { type: "linear", apiKey: "lin_api_test", teamId: "team_eu" },
      {
        type: "jira",
        baseUrl: "https://customer.atlassian.net",
        email: "ops@customer.eu",
        apiToken: "jira_tok",
        projectKey: "AI",
      },
      { type: "monday", apiToken: "mon_tok", boardId: "987654" },
      { type: "asana", accessToken: "asana_pat", projectGid: "120001" },
    ];

    for (const ch of channels) {
      const built = buildChannelOutboundRequest(ch, req, links);
      expect(built.url).toMatch(/^https:\/\//);
      expect(typeof built.body).toBe("string");
      expect(built.body).toContain("gate_9ch");
      if (ch.type === "monday") {
        expect(built.body).not.toContain(links.approveUrl);
        expect(built.body).not.toContain("Approve");
      }
    }
  });

  it("fans out multi-channel approval requests and returns per-channel receipts", async () => {
    const calls: string[] = [];
    const mockFetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ id: `ext_${calls.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const router = createMultiChannelApprovalRouter({
      signingSecret: TEST_SECRET,
      fetchImpl: mockFetch,
      channels: [
        { type: "slack", webhookUrl: "https://hooks.slack.com/services/T0/B0/X0" },
        { type: "linear", apiKey: "lin_api_test", teamId: "team_eu" },
        { type: "telegram", botToken: "123:ABC", chatId: "-100999" },
      ],
    });

    const { links, receipts } = await router.requestApproval({
      gateId: "gate_fanout",
      actionName: "contract.modify_permissions",
      summary: "Grant admin role to service account",
      callbackBaseUrl: "https://approvals.example/hitl/callback",
    });

    expect(calls).toHaveLength(3);
    expect(receipts.map((r) => r.channel)).toEqual(["slack", "linear", "telegram"]);
    expect(
      router.verifyCallback({
        gateId: "gate_fanout",
        actionHmac: links.actionHmac,
        decision: "approved",
        issuedAtUnix: links.issuedAtUnix,
        signature: links.approveToken,
        nonce: links.nonce,
      }),
    ).toBe(true);
  });
});
