import { createHmac, randomUUID } from "node:crypto";
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
  /** Optional project API key for syncing metadata/digests to console.spurvik.com. */
  consoleApiKey?: string;
  /** Optional control-plane base URL (defaults to https://console.spurvik.com). */
  consoleBaseUrl?: string;
}

export interface SpurvikArt12Record {
  inputHmac: string;
  outputHmac: string | null;
  previousRecordHash: string;
  recordHash: string;
  timestampIso: string;
}

export interface SpurvikConsoleSyncReceipt {
  endpoint: "/api/v1/disclosure" | "/api/v1/telemetry" | "/api/v1/hitl";
  httpStatus: number;
  synced: boolean;
  remoteId: string | null;
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
  consoleSync: SpurvikConsoleSyncReceipt | null;
}

const MIN_SECRET_LENGTH = 16;
const PROJECT_KEY_PATTERN = new RegExp(`^(?:${"spurvik"}_live_|${"aegis"}_live_)[A-Za-z0-9_-]{32,}$`);

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

export function resolveConsoleConfig(
  rawApiKey: string | undefined,
  rawBaseUrl: string | undefined,
): { apiKey: string; baseUrl: string } | null {
  if (rawApiKey === undefined || rawApiKey === "") return null;
  if (rawApiKey !== rawApiKey.trim()) {
    throw new Error("Spurvik credential consoleApiKey must not have leading or trailing whitespace.");
  }
  if (!PROJECT_KEY_PATTERN.test(rawApiKey)) {
    throw new Error("Spurvik credential consoleApiKey does not match the project API key format.");
  }
  const base = (rawBaseUrl?.trim() || "https://console.spurvik.com").replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("Spurvik consoleBaseUrl must be a valid URL.");
  }
  const isLocal =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new Error("Spurvik consoleBaseUrl must use https:// (or http://localhost for local testing).");
  }
  return { apiKey: rawApiKey, baseUrl: base };
}

async function postConsoleJson(
  fetchImpl: typeof fetch,
  config: { apiKey: string; baseUrl: string },
  endpoint: SpurvikConsoleSyncReceipt["endpoint"],
  payload: Record<string, unknown>,
): Promise<SpurvikConsoleSyncReceipt> {
  const response = await fetchImpl(`${config.baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Spurvik console sync to ${endpoint} failed with HTTP ${response.status}.`);
  }
  let remoteId: string | null = null;
  try {
    const body = (await response.json()) as { data?: { id?: unknown; sessionId?: unknown } };
    if (typeof body?.data?.id === "string") {
      remoteId = body.data.id;
    } else if (typeof body?.data?.sessionId === "string") {
      remoteId = body.data.sessionId;
    }
  } catch {
    remoteId = null;
  }
  return {
    endpoint,
    httpStatus: response.status,
    synced: true,
    remoteId,
  };
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
 * art50_disclosure adds a notice (and optionally records a disclosure session when consoleApiKey is set).
 * art12_hmac_log records an HMAC-SHA256 digest (and optionally syncs the hashed event to console.spurvik.com).
 * art14_ask_human sends an approval request through createMultiChannelApprovalRouter (and optionally opens a console HITL row).
 */
export async function executeSpurvikWorkflowStep(
  input: SpurvikWorkflowNodeInput,
  opts: { fetchImpl?: typeof fetch; nowIso?: string } = {},
): Promise<SpurvikWorkflowNodeOutput> {
  const secret = assertHmacSecret(input.hmacSecret);
  const systemName = input.systemName?.trim() || "AI system";
  const consoleConfig = resolveConsoleConfig(input.consoleApiKey, input.consoleBaseUrl);
  const fetchFn = opts.fetchImpl ?? fetch;

  if (input.operation === "art50_disclosure") {
    if (typeof input.outputText !== "string") {
      throw new Error("art50_disclosure requires the AI output text. The output field was missing.");
    }
    const notice =
      input.noticeText?.trim() ||
      `You are interacting with an AI system (${systemName}). This notice is designed to support transparency about that interaction.`;
    const body = input.outputText;
    let consoleSync: SpurvikConsoleSyncReceipt | null = null;
    if (consoleConfig) {
      const timestampIso = opts.nowIso ?? new Date().toISOString();
      const sessionDigest = createHmac("sha256", secret)
        .update(`spurvik:workflow:disclosure:v1|${systemName}|${body}`, "utf8")
        .digest("hex")
        .slice(0, 24);
      consoleSync = await postConsoleJson(fetchFn, consoleConfig, "/api/v1/disclosure", {
        sessionId: `n8n_${sessionDigest}`,
        jurisdiction: "EU",
        timestamp: timestampIso,
        noticeKind: "interaction",
      });
    }
    return {
      operation: "art50_disclosure",
      systemName,
      art50Notice: notice,
      disclosedOutputText: `${notice}\n\n${body}`,
      art12Record: null,
      art14Gate: idleGate(),
      consoleSync,
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
    let consoleSync: SpurvikConsoleSyncReceipt | null = null;
    if (consoleConfig) {
      const eventId = randomUUID();
      consoleSync = await postConsoleJson(fetchFn, consoleConfig, "/api/v1/telemetry", {
        events: [
          {
            eventId,
            timestamp: timestampIso,
            modelProvider: "n8n",
            modelVersion: systemName.slice(0, 200),
            inputHash: inputHmac,
            outputHash: outputHmac,
            contentHashMode: "keyed",
            latencyMs: 0,
            temperature: null,
            contentMarkingApplied: false,
            evidenceTrailerAttached: false,
            markingHookId: null,
            hitlStatus: "not_required",
          },
        ],
      });
      if (!consoleSync.remoteId) {
        consoleSync.remoteId = eventId;
      }
    }
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
      consoleSync,
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
  let consoleSync: SpurvikConsoleSyncReceipt | null = null;
  if (consoleConfig) {
    const contentFingerprint = createHmac("sha256", secret)
      .update(`spurvik:workflow:hitl:v1|${links.gateId}|${actionName}`, "utf8")
      .digest("hex");
    const payloadSummary = JSON.stringify({
      contentFingerprint,
      keys: ["channel", "gateId"],
      schema: "spurvik.payload_summary.v1",
    });
    consoleSync = await postConsoleJson(fetchFn, consoleConfig, "/api/v1/hitl", {
      actionName: actionName.slice(0, 200),
      payloadSummary,
    });
  }
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
    consoleSync,
  };
}
