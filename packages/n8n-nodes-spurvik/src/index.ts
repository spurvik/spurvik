import { createHmac } from "node:crypto";
import {
  createSignedApprovalLinks,
  dispatchHumanApprovalChannel,
  type ChannelDispatchReceipt,
  type HumanApprovalChannelConfig,
} from "../../sdk/src/channels.js";

export type SpurvikWorkflowOperation = "art50_disclosure" | "art12_hmac_log" | "art14_ask_human";

export interface SpurvikWorkflowNodeInput {
  operation: SpurvikWorkflowOperation;
  /** Secret key (>=16 chars) used for HMAC-SHA256 digests and approval signatures. Never leaves the server. */
  hmacSecret: string;
  /** Name of the AI system or workflow (e.g. `"Support Refund Workflow"`). */
  systemName: string;
  /** Raw prompt/input text — hashed in-memory with HMAC-SHA256 and NEVER persisted in the output record. */
  rawInputText?: string;
  /** AI output text (for Art. 50(1) notice injection or Art. 12 output HMAC). */
  outputText?: string;
  /** Previous chained record hash for Art. 12 tamper-evident audit chains. */
  previousRecordHash?: string;
  /** For `art14_ask_human`: deterministic action identifier (e.g. `"stripe.refunds.create"`). */
  actionName?: string;
  /** For `art14_ask_human`: non-PII summary shown to the human reviewer. */
  actionSummary?: string;
  /** For `art14_ask_human`: unique gate ID. */
  gateId?: string;
  /** For `art14_ask_human`: optional channel config (Slack, Telegram, Email, Discord, Teams, Linear, Jira, Monday, Asana). */
  channel?: HumanApprovalChannelConfig;
  /** Optional callback base URL for 1-click Approve/Block links. */
  callbackBaseUrl?: string;
}

export interface SpurvikWorkflowNodeOutput {
  operation: SpurvikWorkflowOperation;
  systemName: string;
  /** EU AI Act Art. 50(1) interactive disclosure badge text. */
  art50Notice: string;
  /** Output text with Art. 50(1) notice prepended (when `outputText` is provided). */
  disclosedOutputText: string | null;
  /** EU AI Act Art. 12 & GDPR Art. 5(1)(c) pseudonymised HMAC-SHA256 record (`rawPromptBytes: 0`). */
  art12Record: {
    rawPromptBytes: 0;
    inputHmac: string;
    outputHmac: string | null;
    previousRecordHash: string;
    recordHash: string;
    timestampIso: string;
  };
  /** EU AI Act Art. 14 human oversight gate status and signed 1-click approval links. */
  art14Gate: {
    required: boolean;
    status: "not_required" | "pending_human_approval";
    gateId: string | null;
    approveUrl: string | null;
    rejectUrl: string | null;
    channelReceipt: ChannelDispatchReceipt | null;
  };
}

/**
 * Executes a Spurvik EU AI Act Art. 50 / Art. 12 / Art. 14 workflow step for **n8n** or **Make.com**.
 * - Never persists or logs raw user prompts (`rawPromptBytes: 0`).
 * - Supports 1-click human approval routing across Slack, Telegram, Email, Discord, Teams, Linear, Jira, Monday, and Asana.
 */
export async function executeSpurvikWorkflowStep(
  input: SpurvikWorkflowNodeInput,
  opts: { fetchImpl?: typeof fetch; nowIso?: string; issuedAtUnix?: number } = {},
): Promise<SpurvikWorkflowNodeOutput> {
  if (!input.hmacSecret || input.hmacSecret.trim().length < 16) {
    throw new Error("Spurvik workflow node requires an hmacSecret of at least 16 characters.");
  }
  const secret = input.hmacSecret.trim();
  const timestampIso = opts.nowIso ?? new Date().toISOString();
  const prevHash = input.previousRecordHash?.trim() || "0".repeat(64);

  const inputHmac = createHmac("sha256", secret)
    .update(`spurvik:workflow:input:v1|${input.rawInputText ?? ""}`, "utf8")
    .digest("hex");

  const outputHmac =
    typeof input.outputText === "string"
      ? createHmac("sha256", secret).update(`spurvik:workflow:output:v1|${input.outputText}`, "utf8").digest("hex")
      : null;

  const recordHash = createHmac("sha256", secret)
    .update(
      `spurvik:workflow:chain:v1|${prevHash}|${input.systemName}|${inputHmac}|${outputHmac ?? "none"}|${timestampIso}`,
      "utf8",
    )
    .digest("hex");

  const art50Notice = `[AI System Notice · EU AI Act Art. 50(1)] You are interacting with an AI system (${input.systemName}).`;
  const disclosedOutputText =
    typeof input.outputText === "string" ? `${art50Notice}\n\n${input.outputText}` : null;

  if (input.operation !== "art14_ask_human") {
    return {
      operation: input.operation,
      systemName: input.systemName,
      art50Notice,
      disclosedOutputText,
      art12Record: {
        rawPromptBytes: 0,
        inputHmac,
        outputHmac,
        previousRecordHash: prevHash,
        recordHash,
        timestampIso,
      },
      art14Gate: {
        required: false,
        status: "not_required",
        gateId: null,
        approveUrl: null,
        rejectUrl: null,
        channelReceipt: null,
      },
    };
  }

  const gateId = input.gateId?.trim() || `gate_${recordHash.slice(0, 16)}`;
  const actionName = input.actionName?.trim() || "workflow.risky_action";
  const actionSummary = input.actionSummary?.trim() || `Human approval required for ${actionName}`;

  const links = createSignedApprovalLinks(
    {
      gateId,
      actionName,
      summary: actionSummary,
      callbackBaseUrl: input.callbackBaseUrl,
    },
    secret,
    opts.issuedAtUnix,
  );

  let channelReceipt: ChannelDispatchReceipt | null = null;
  if (input.channel) {
    channelReceipt = await dispatchHumanApprovalChannel(
      input.channel,
      {
        gateId,
        actionName,
        summary: actionSummary,
        callbackBaseUrl: input.callbackBaseUrl,
      },
      {
        signingSecret: secret,
        fetchImpl: opts.fetchImpl,
        issuedAtUnix: links.issuedAtUnix,
      },
    );
  }

  return {
    operation: "art14_ask_human",
    systemName: input.systemName,
    art50Notice,
    disclosedOutputText,
    art12Record: {
      rawPromptBytes: 0,
      inputHmac,
      outputHmac,
      previousRecordHash: prevHash,
      recordHash,
      timestampIso,
    },
    art14Gate: {
      required: true,
      status: "pending_human_approval",
      gateId,
      approveUrl: links.approveUrl,
      rejectUrl: links.rejectUrl,
      channelReceipt,
    },
  };
}

/**
 * n8n Declarative / Programmatic Node Descriptor (`n8n-nodes-spurvik`).
 */
export const SpurvikN8nNodeDescription = {
  displayName: "Spurvik EU AI Act Guard",
  name: "spurvikEuAiActGuard",
  group: ["transform"],
  version: 1,
  description:
    "EU AI Act Art. 50 AI interaction notice, Art. 12 HMAC-SHA256 zero-raw-prompt logging, and Art. 14 multi-channel ask_human() approval gate.",
  defaults: {
    name: "Spurvik Guard",
  },
  inputs: ["main"],
  outputs: ["main"],
  properties: [
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "art50_disclosure",
      options: [
        { name: "Art. 50(1) AI Notice + Art. 12 HMAC Log", value: "art50_disclosure" },
        { name: "Art. 12 Chained HMAC-SHA256 Log Only", value: "art12_hmac_log" },
        { name: "Art. 14 Pre-Flight ask_human() Gate", value: "art14_ask_human" },
      ],
    },
    {
      displayName: "AI System Name",
      name: "systemName",
      type: "string",
      default: "Customer Support AI Agent",
      required: true,
    },
  ],
};
