import { createHmac } from "node:crypto";
import {
  createMultiChannelApprovalRouter,
  type ChannelDispatchReceipt,
  type HumanApprovalChannelConfig,
} from "spurvik-sdk";

export type SpurvikWorkflowOperation = "art50_disclosure" | "art12_hmac_log" | "art14_ask_human";

export interface SpurvikWorkflowNodeInput {
  operation: SpurvikWorkflowOperation;
  /** HMAC secret. Rejected when missing, short, or padded with whitespace. */
  hmacSecret: string;
  systemName: string;
  /** Text to digest. Returned only as an HMAC, never as the original string. */
  rawInputText?: string;
  /** Text that receives an AI interaction notice. */
  outputText?: string;
  /** Optional notice. When empty, a default notice that names systemName is used. */
  noticeText?: string;
  previousRecordHash?: string;
  actionName?: string;
  actionSummary?: string;
  gateId?: string;
  channel?: HumanApprovalChannelConfig;
  /** Required for art14_ask_human. A URL that accepts GET clicks. */
  callbackBaseUrl?: string;
}

export interface SpurvikArt12Record {
  inputHmac: string;
  outputHmac: string | null;
  previousRecordHash: string;
  recordHash: string;
  timestampIso: string;
}

export interface SpurvikWorkflowNodeOutput {
  operation: SpurvikWorkflowOperation;
  systemName: string;
  art50Notice: string | null;
  disclosedOutputText: string | null;
  art12Record: SpurvikArt12Record | null;
  art14Gate: {
    required: boolean;
    status: "not_required" | "pending_human_approval";
    gateId: string | null;
    approveUrl: string | null;
    rejectUrl: string | null;
    linksDelivered: boolean;
    channelReceipt: ChannelDispatchReceipt | null;
  };
}

const MIN_SECRET_LENGTH = 16;

export function assertHmacSecret(secret: unknown): string {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("Channel approval secret is missing.");
  }
  if (secret !== secret.trim()) {
    throw new Error("Channel approval secret must not have leading or trailing whitespace.");
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Channel approval secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return secret;
}

function idleGate(): SpurvikWorkflowNodeOutput["art14Gate"] {
  return {
    required: false,
    status: "not_required",
    gateId: null,
    approveUrl: null,
    rejectUrl: null,
    linksDelivered: false,
    channelReceipt: null,
  };
}

/**
 * art50_disclosure only adds a notice.
 * art12_hmac_log only records an HMAC-SHA256 digest.
 * art14_ask_human only sends an approval request through createMultiChannelApprovalRouter.
 */
export async function executeSpurvikWorkflowStep(
  input: SpurvikWorkflowNodeInput,
  opts: { fetchImpl?: typeof fetch; nowIso?: string } = {},
): Promise<SpurvikWorkflowNodeOutput> {
  const secret = assertHmacSecret(input.hmacSecret);
  const systemName = input.systemName?.trim() || "AI system";

  if (input.operation === "art50_disclosure") {
    const notice =
      input.noticeText?.trim() ||
      `You are interacting with an AI system (${systemName}). This notice is designed to support transparency about that interaction.`;
    const body = input.outputText ?? "";
    return {
      operation: "art50_disclosure",
      systemName,
      art50Notice: notice,
      disclosedOutputText: `${notice}\n\n${body}`,
      art12Record: null,
      art14Gate: idleGate(),
    };
  }

  if (input.operation === "art12_hmac_log") {
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
        `spurvik:workflow:chain:v1|${prevHash}|${systemName}|${inputHmac}|${outputHmac ?? "none"}|${timestampIso}`,
        "utf8",
      )
      .digest("hex");
    return {
      operation: "art12_hmac_log",
      systemName,
      art50Notice: null,
      disclosedOutputText: null,
      art12Record: {
        inputHmac,
        outputHmac,
        previousRecordHash: prevHash,
        recordHash,
        timestampIso,
      },
      art14Gate: idleGate(),
    };
  }

  if (input.operation !== "art14_ask_human") {
    throw new Error(`Unknown Spurvik operation: ${String(input.operation)}`);
  }
  if (!input.channel) {
    throw new Error("art14_ask_human requires a channel.");
  }
  const callbackBaseUrl = input.callbackBaseUrl?.trim() ?? "";
  if (!callbackBaseUrl) {
    throw new Error(
      "art14_ask_human requires callbackBaseUrl, a URL that accepts GET clicks on Approve and Block links.",
    );
  }
  const actionName = input.actionName?.trim() || "workflow.action";
  const actionSummary = input.actionSummary?.trim() || `Human approval requested for ${systemName}`;
  const gateId =
    input.gateId?.trim() ||
    `gate_${createHmac("sha256", secret).update(`${actionName}|${actionSummary}`).digest("hex").slice(0, 16)}`;

  const router = createMultiChannelApprovalRouter({
    signingSecret: secret,
    channels: [input.channel],
    fetchImpl: opts.fetchImpl,
  });
  const { links, receipts } = await router.requestApproval({
    gateId,
    actionName,
    summary: actionSummary,
    callbackBaseUrl,
  });
  const linksDelivered = input.channel.type !== "monday";
  return {
    operation: "art14_ask_human",
    systemName,
    art50Notice: null,
    disclosedOutputText: null,
    art12Record: null,
    art14Gate: {
      required: true,
      status: "pending_human_approval",
      gateId: links.gateId,
      approveUrl: links.approveUrl,
      rejectUrl: links.rejectUrl,
      linksDelivered,
      channelReceipt: receipts[0] ?? null,
    },
  };
}
