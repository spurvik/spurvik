import { pathToFileURL } from "node:url";
import {
  createMultiChannelApprovalRouter,
  SpurvikClient,
  SpurvikHitlRejectedError,
  SpurvikHitlTimeoutError,
  verifyChannelApprovalToken,
  type HitlRecordWire,
  type HumanApprovalChannelConfig,
  type HumanChannelActionRequest,
  type SpurvikConfig,
} from "spurvik";

export interface ChannelEnv {
  signingSecret: string;
  callbackBaseUrl?: string;
  fetchImpl?: typeof fetch;
  slackWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramApiBaseUrl?: string;
  linearApiKey?: string;
  linearTeamId?: string;
  linearApiUrl?: string;
}

export interface SignedCallbackQuery {
  gateId: string;
  actionHmac: string;
  decision: "approved" | "rejected";
  issuedAtUnix: number;
  nonce?: string;
  signature: string;
}

function trimmed(source: Record<string, string | undefined>, name: string): string | undefined {
  const value = source[name]?.trim();
  return value ? value : undefined;
}

export function readChannelEnv(source: Record<string, string | undefined>): ChannelEnv {
  return {
    signingSecret: trimmed(source, "SPURVIK_SIGNING_SECRET") ?? "",
    callbackBaseUrl: trimmed(source, "CALLBACK_BASE_URL"),
    slackWebhookUrl: trimmed(source, "SLACK_WEBHOOK_URL"),
    telegramBotToken: trimmed(source, "TELEGRAM_BOT_TOKEN"),
    telegramChatId: trimmed(source, "TELEGRAM_CHAT_ID"),
    telegramApiBaseUrl: trimmed(source, "TELEGRAM_API_BASE_URL"),
    linearApiKey: trimmed(source, "LINEAR_API_KEY"),
    linearTeamId: trimmed(source, "LINEAR_TEAM_ID"),
    linearApiUrl: trimmed(source, "LINEAR_API_URL"),
  };
}

export function createApprovalRouter(env: ChannelEnv) {
  const channels: HumanApprovalChannelConfig[] = [];
  if (env.slackWebhookUrl) {
    channels.push({ type: "slack", webhookUrl: env.slackWebhookUrl });
  }
  if (env.telegramBotToken && env.telegramChatId) {
    channels.push({
      type: "telegram",
      botToken: env.telegramBotToken,
      chatId: env.telegramChatId,
      ...(env.telegramApiBaseUrl ? { apiBaseUrl: env.telegramApiBaseUrl } : {}),
    });
  }
  if (env.linearApiKey && env.linearTeamId) {
    channels.push({
      type: "linear",
      apiKey: env.linearApiKey,
      teamId: env.linearTeamId,
      ...(env.linearApiUrl ? { apiUrl: env.linearApiUrl } : {}),
    });
  }
  return createMultiChannelApprovalRouter({
    signingSecret: env.signingSecret,
    channels,
    ...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {}),
  });
}

/** Read the query string written by createSignedApprovalLinks. */
export function readSignedCallback(target: string | URL): SignedCallbackQuery | null {
  let url: URL;
  try {
    url = target instanceof URL ? target : new URL(target);
  } catch {
    return null;
  }
  const gateId = url.searchParams.get("gateId");
  const actionHmac = url.searchParams.get("hmac");
  const decision = url.searchParams.get("decision");
  const ts = url.searchParams.get("ts");
  const nonce = url.searchParams.get("nonce") ?? undefined;
  const signature = url.searchParams.get("sig");
  if (!gateId || !actionHmac || !signature || !ts) return null;
  if (decision !== "approved" && decision !== "rejected") return null;
  if (!/^\d+$/.test(ts)) return null;
  return {
    gateId,
    actionHmac,
    decision,
    issuedAtUnix: Number(ts),
    ...(nonce ? { nonce } : {}),
    signature,
  };
}

/** Checks Spurvik's approval-link token. This is not a Slack, Telegram, or Linear signature check. */
export function checkSignedCallback(
  signingSecret: string,
  query: SignedCallbackQuery,
  options?: { nowUnixSeconds?: number; maxAgeSeconds?: number },
): boolean {
  return verifyChannelApprovalToken({
    signingSecret,
    gateId: query.gateId,
    actionHmac: query.actionHmac,
    decision: query.decision,
    issuedAtUnix: query.issuedAtUnix,
    ...(query.nonce ? { nonce: query.nonce } : {}),
    signature: query.signature,
    ...(options?.nowUnixSeconds !== undefined ? { nowUnixSeconds: options.nowUnixSeconds } : {}),
    ...(options?.maxAgeSeconds !== undefined ? { maxAgeSeconds: options.maxAgeSeconds } : {}),
  });
}

const CHANNELS = ["slack", "telegram", "linear"] as const;

export type RoutedChannel = (typeof CHANNELS)[number];

type ResultBase = {
  callbackMatch: boolean;
  gateId: string;
  actionHmac: string;
  channels: RoutedChannel[];
};

export type AskHumanResult =
  | (ResultBase & { continue: true; status: "approved"; record: HitlRecordWire })
  | (ResultBase & { continue: false; status: "rejected"; record?: HitlRecordWire })
  | (ResultBase & { continue: false; status: "overridden"; record: HitlRecordWire })
  | (ResultBase & { continue: false; status: "timeout" })
  | (ResultBase & { continue: false; status: "callback_mismatch" });

export interface RunRoutedAskHumanInput {
  env: ChannelEnv;
  client: SpurvikClient;
  request: HumanChannelActionRequest;
  /** Full callback URL. When omitted, the approve link from this dispatch is checked. */
  callbackUrl?: string;
  /** Check the reject link from this dispatch instead of the approve link. */
  useRejectLink?: boolean;
  nowUnixSeconds?: number;
}

export function assertSlackTelegramLinear(env: ChannelEnv): void {
  const missing: string[] = [];
  if (!env.slackWebhookUrl) missing.push("SLACK_WEBHOOK_URL");
  if (!env.telegramBotToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!env.telegramChatId) missing.push("TELEGRAM_CHAT_ID");
  if (!env.linearApiKey) missing.push("LINEAR_API_KEY");
  if (!env.linearTeamId) missing.push("LINEAR_TEAM_ID");
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}.`);
  }
}

/** Keep Slack, Telegram, and Linear even if the process also has other channel settings. */
export function slackTelegramLinearEnv(env: ChannelEnv): ChannelEnv {
  assertSlackTelegramLinear(env);
  return {
    signingSecret: env.signingSecret,
    callbackBaseUrl: env.callbackBaseUrl,
    fetchImpl: env.fetchImpl,
    slackWebhookUrl: env.slackWebhookUrl,
    telegramBotToken: env.telegramBotToken,
    telegramChatId: env.telegramChatId,
    telegramApiBaseUrl: env.telegramApiBaseUrl,
    linearApiKey: env.linearApiKey,
    linearTeamId: env.linearTeamId,
    linearApiUrl: env.linearApiUrl,
  };
}

export function createAskHumanClient(input: {
  apiKey: string;
  signingSecret: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): SpurvikClient {
  const config: SpurvikConfig = {
    apiKey: input.apiKey,
    signingSecret: input.signingSecret,
    baseUrl: input.baseUrl,
    riskTier: "limited_art50",
    contentHash: { mode: "off" },
    enforceHaltOnInference: false,
    registerProcessHooks: false,
    oversight: { pushInvalidation: false, cacheMs: 0 },
    hitl: {
      timeoutMs: input.timeoutMs ?? 120_000,
      pollIntervalMs: input.pollIntervalMs ?? 1_000,
    },
    ...(input.fetchImpl ? { fetch: input.fetchImpl } : {}),
    ...(input.sleep ? { sleep: input.sleep } : {}),
  };
  return new SpurvikClient(config);
}

function stopped(
  base: ResultBase,
  status: "rejected" | "timeout" | "callback_mismatch",
  record?: HitlRecordWire,
): AskHumanResult {
  if (status === "rejected") {
    return record ? { ...base, continue: false, status, record } : { ...base, continue: false, status };
  }
  return { ...base, continue: false, status };
}

/**
 * Fan out to Slack, Telegram, and Linear, check the callback HMAC signature,
 * then read the human-oversight queue.
 * Continue only when the callback decision is "approved", the signature matches,
 * and the queue status is "approved".
 * From spurvik 1.0.7, requireHumanApproval throws SpurvikHitlRejectedError on
 * "rejected" and "overridden". This function reports which one through `status`.
 */
export async function runRoutedAskHuman(input: RunRoutedAskHumanInput): Promise<AskHumanResult> {
  const env = slackTelegramLinearEnv(input.env);
  if (!input.request.callbackBaseUrl && !env.callbackBaseUrl) {
    throw new Error("Missing CALLBACK_BASE_URL.");
  }
  const request: HumanChannelActionRequest = {
    ...input.request,
    callbackBaseUrl: input.request.callbackBaseUrl ?? env.callbackBaseUrl,
  };
  const router = createApprovalRouter(env);
  const dispatched = await router.requestApproval(request);
  const channels = dispatched.receipts.map((receipt) => receipt.channel);
  if (
    channels.length !== CHANNELS.length ||
    channels.some((channel, index) => channel !== CHANNELS[index])
  ) {
    throw new Error(`Expected Slack, Telegram, and Linear receipts, received ${channels.join(", ")}.`);
  }
  const base: ResultBase = {
    callbackMatch: false,
    gateId: dispatched.links.gateId,
    actionHmac: dispatched.links.actionHmac,
    channels: [...CHANNELS],
  };
  const callbackTarget =
    input.callbackUrl ?? (input.useRejectLink ? dispatched.links.rejectUrl : dispatched.links.approveUrl);
  const query = readSignedCallback(callbackTarget);
  if (!query) return stopped(base, "callback_mismatch");
  const nowUnixSeconds = input.nowUnixSeconds ?? dispatched.links.issuedAtUnix;
  const callbackMatch = checkSignedCallback(env.signingSecret, query, { nowUnixSeconds });
  base.callbackMatch = callbackMatch;
  if (!callbackMatch) return stopped(base, "callback_mismatch");
  if (query.decision === "rejected") return stopped(base, "rejected");

  try {
    const record = await input.client.requireHumanApproval(request.actionName, request.context ?? {});
    if (record.status === "approved") {
      return { ...base, continue: true, status: "approved", record };
    }
    if (record.status === "overridden") {
      return { ...base, continue: false, status: "overridden", record };
    }
    if (record.status === "rejected") {
      return stopped(base, "rejected", record);
    }
    throw new Error(`Queue status "${record.status}" does not let the action continue.`);
  } catch (error) {
    if (error instanceof SpurvikHitlTimeoutError) return stopped(base, "timeout");
    if (error instanceof SpurvikHitlRejectedError) {
      if (error.record.status === "overridden") {
        return { ...base, continue: false, status: "overridden", record: error.record };
      }
      return stopped(base, "rejected", error.record);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const env = readChannelEnv(process.env);
  assertSlackTelegramLinear(env);
  const apiKey = process.env.SPURVIK_API_KEY?.trim() ?? "";
  const baseUrl = process.env.SPURVIK_BASE_URL?.trim() ?? "";
  if (!apiKey || !baseUrl) {
    throw new Error("Missing SPURVIK_API_KEY or SPURVIK_BASE_URL.");
  }
  const client = createAskHumanClient({
    apiKey,
    signingSecret: env.signingSecret,
    baseUrl,
  });
  try {
    const result = await runRoutedAskHuman({
      env,
      client,
      request: {
        gateId: process.env.ASK_HUMAN_GATE_ID?.trim() || `gate_${Date.now()}`,
        actionName: process.env.ASK_HUMAN_ACTION?.trim() || "billing.refund",
        summary: process.env.ASK_HUMAN_SUMMARY?.trim() || "Review the queued action before it runs.",
        context: { source: "slack-telegram-linear" },
      },
    });
    console.log(
      JSON.stringify(
        {
          continue: result.continue,
          status: result.status,
          callbackMatch: result.callbackMatch,
          gateId: result.gateId,
        },
        null,
        2,
      ),
    );
    if (!result.continue) process.exitCode = 2;
  } finally {
    await client.shutdown();
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
