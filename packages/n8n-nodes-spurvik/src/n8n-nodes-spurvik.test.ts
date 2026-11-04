import { describe, expect, it } from "vitest";
import { executeSpurvikWorkflowStep, SpurvikN8nNodeDescription } from "./index.js";

const SECRET = "spurvik-n8n-make-test-secret-2026";

describe("n8n-nodes-spurvik & Make.com Workflow Guard", () => {
  it("prepends EU AI Act Art. 50(1) notice and emits chained HMAC-SHA256 Art. 12 record with 0 raw prompt bytes", async () => {
    const out = await executeSpurvikWorkflowStep(
      {
        operation: "art50_disclosure",
        hmacSecret: SECRET,
        systemName: "Nordic Support Bot",
        rawInputText: "Sensitive customer prompt with CPR 123456-7890",
        outputText: "Your invoice #4821 has been updated.",
      },
      { nowIso: "2026-11-04T07:45:00.000Z" },
    );

    expect(out.art12Record.rawPromptBytes).toBe(0);
    expect(out.art12Record.inputHmac).toHaveLength(64);
    expect(out.art12Record.recordHash).toHaveLength(64);
    expect(JSON.stringify(out)).not.toContain("123456-7890");
    expect(out.disclosedOutputText).toContain("[AI System Notice · EU AI Act Art. 50(1)]");
    expect(out.art14Gate.required).toBe(false);
  });

  it("triggers pre-flight Art. 14 ask_human() gate and dispatches signed Approve/Block links to Slack/Telegram/Linear", async () => {
    const dispatchedUrls: string[] = [];
    const mockFetch = (async (url: string | URL | Request) => {
      dispatchedUrls.push(String(url));
      return new Response(JSON.stringify({ ok: true, id: "msg_1" }), { status: 200 });
    }) as typeof fetch;

    const out = await executeSpurvikWorkflowStep(
      {
        operation: "art14_ask_human",
        hmacSecret: SECRET,
        systemName: "Refund Automation Agent",
        actionName: "stripe.refunds.create",
        actionSummary: "Issue €450 refund for order #4821",
        gateId: "gate_n8n_4821",
        channel: {
          type: "slack",
          webhookUrl: "https://hooks.slack.com/services/T00/B00/X00",
        },
      },
      { fetchImpl: mockFetch, issuedAtUnix: 1_793_778_000 },
    );

    expect(out.art14Gate.required).toBe(true);
    expect(out.art14Gate.status).toBe("pending_human_approval");
    expect(out.art14Gate.approveUrl).toContain("gateId=gate_n8n_4821");
    expect(out.art14Gate.channelReceipt?.channel).toBe("slack");
    expect(dispatchedUrls).toEqual(["https://hooks.slack.com/services/T00/B00/X00"]);
    expect(SpurvikN8nNodeDescription.name).toBe("spurvikEuAiActGuard");
  });
});
