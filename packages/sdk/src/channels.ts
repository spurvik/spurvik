import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SpurvikConfigError } from "./errors.js";

/**
 * Supported drop-in human-in-the-loop (`ask_human`) channels for EU AI Act Art. 14 oversight:
 * - Instant messaging & email: `slack`, `telegram`, `email`, `discord`, `teams`
 * - Work & issue trackers: `linear`, `jira`, `monday` (creates an item only; no Approve or Block links), `asana`
 */
export type HumanApprovalChannelType =
  | "slack"
  | "telegram"
  | "email"
  | "discord"
  | "teams"
  | "linear"
  | "jira"
  | "monday"
  | "asana";

export interface HumanChannelActionRequest {
  /** Unique gate/request ID (e.g. UUID). */
  gateId: string;
  /** Deterministic action name (e.g. `"stripe.refunds.create"` or `"db.delete_workspace"`). */
  actionName: string;
  /**
   * Short summary sent to the channel as provided.
   * The SDK does not add the prompt. If the summary itself contains prompt text, that text is sent.
   */
  summary: string;
  /** Optional pre-hashed or structured non-PII metadata (e.g. `{ amountEur: 240, currency: "EUR" }`). */
  context?: Record<string, string | number | boolean>;
  /**
   * Required at runtime. URL that accepts GET clicks on the Approve and Block links.
   * The SDK does not default to a console route. The console HITL create route is POST-only.
   */
  callbackBaseUrl?: string;
}

export interface SignedApprovalLinks {
  gateId: string;
  actionName: string;
  actionHmac: string;
  approveToken: string;
  rejectToken: string;
  approveUrl: string;
  rejectUrl: string;
  /** Random id mixed into new tokens. 1.0.4 tokens have no nonce. */
  nonce: string;
  issuedAtUnix: number;
}

export interface SlackChannelConfig {
  type: "slack";
  webhookUrl: string;
}

export interface TelegramChannelConfig {
  type: "telegram";
  botToken: string;
  chatId: string;
  apiBaseUrl?: string;
}

export interface EmailChannelConfig {
  type: "email";
  resendApiKey: string;
  from: string;
  to: string | string[];
  apiBaseUrl?: string;
}

export interface DiscordChannelConfig {
  type: "discord";
  webhookUrl: string;
}

export interface TeamsChannelConfig {
  type: "teams";
  webhookUrl: string;
}

export interface LinearChannelConfig {
  type: "linear";
  apiKey: string;
  teamId: string;
  apiUrl?: string;
}

export interface JiraChannelConfig {
  type: "jira";
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueTypeName?: string;
}

export interface MondayChannelConfig {
  type: "monday";
  apiToken: string;
  boardId: string;
  groupId?: string;
  apiUrl?: string;
}

export interface AsanaChannelConfig {
  type: "asana";
  accessToken: string;
  projectGid: string;
  apiBaseUrl?: string;
}

export type HumanApprovalChannelConfig =
  | SlackChannelConfig
  | TelegramChannelConfig
  | EmailChannelConfig
  | DiscordChannelConfig
  | TeamsChannelConfig
  | LinearChannelConfig
  | JiraChannelConfig
  | MondayChannelConfig
  | AsanaChannelConfig;

export interface ChannelDispatchReceipt {
  channel: HumanApprovalChannelType;
  gateId: string;
  actionHmac: string;
  httpStatus: number;
  externalId: string | null;
}

const MIN_SECRET_LENGTH = 16;
const MAX_CLOCK_SKEW_SECONDS = 300;
/** Default lifetime of an approval link, same as 1.0.4. A link can be reused until this window ends. */
const DEFAULT_LINK_MAX_AGE_SECONDS = 86_400;
/** Upper bound for a caller-supplied maxAgeSeconds. Longer values use this cap. */
const MAX_LINK_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const REQUIRED_CHANNEL_FIELDS: { [K in HumanApprovalChannelType]: string[] } = {
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

/** Throws when a channel is unknown or a required credential/target field is missing or blank. */
function assertChannelConfig(channel: HumanApprovalChannelConfig): void {
  const required = channel && REQUIRED_CHANNEL_FIELDS[channel.type as HumanApprovalChannelType];
  if (!required) {
    throw new SpurvikConfigError(`Unknown approval channel type: ${String((channel as { type?: unknown })?.type)}.`);
  }
  for (const field of required) {
    const value = (channel as unknown as Record<string, unknown>)[field];
    const present = Array.isArray(value)
      ? value.length > 0 && value.every((v) => typeof v === "string" && v.trim().length > 0)
      : typeof value === "string" && value.trim().length > 0;
    if (!present) {
      throw new SpurvikConfigError(`Approval channel "${channel.type}" requires a non-empty "${field}".`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveMaxAgeSeconds(value: number | undefined): number {
  if (value === 0) {
    throw new SpurvikConfigError(
      "maxAgeSeconds must be greater than 0. Omit it to use the 86400 second default.",
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return DEFAULT_LINK_MAX_AGE_SECONDS;
  return Math.min(value, MAX_LINK_MAX_AGE_SECONDS);
}

function assertSigningSecret(secret: string): void {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new SpurvikConfigError("Channel approval secret is missing.");
  }
  if (secret !== secret.trim()) {
    throw new SpurvikConfigError("Channel approval secret must not have leading or trailing whitespace.");
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new SpurvikConfigError(`Channel approval secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
}

/**
 * HMAC payload for an approval link.
 * A nonce is appended only when present, so a 1.0.4 token (no nonce) still matches.
 * Domain prefixes `spurvik:art12` and `spurvik:art14` are part of the signed bytes.
 */
function decisionMacPayload(
  gateId: string,
  actionHmac: string,
  decision: "approved" | "rejected",
  issuedAtUnix: number,
  nonce?: string | null,
): string {
  const base = `spurvik:art14:decision:v1|${gateId}|${actionHmac}|${decision}|${issuedAtUnix}`;
  if (typeof nonce === "string" && nonce.length > 0) return `${base}|${nonce}`;
  return base;
}

/**
 * Generates a deterministic HMAC-SHA256 digest and signed Approve / Block URLs
 * without persisting raw prompt text (GDPR Art. 5(1)(c) & EU AI Act Art. 12/14).
 */
export function createSignedApprovalLinks(
  request: HumanChannelActionRequest,
  signingSecret: string,
  issuedAtUnix = Math.floor(Date.now() / 1000),
): SignedApprovalLinks {
  assertSigningSecret(signingSecret);
  const contextPairs = Object.entries(request.context ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");

  const actionHmac = createHmac("sha256", signingSecret)
    .update(`spurvik:art12:v1|${request.gateId}|${request.actionName}|${contextPairs}`, "utf8")
    .digest("hex");

  const nonce = randomBytes(16).toString("hex");
  const approveToken = createHmac("sha256", signingSecret)
    .update(decisionMacPayload(request.gateId, actionHmac, "approved", issuedAtUnix, nonce), "utf8")
    .digest("hex");

  const rejectToken = createHmac("sha256", signingSecret)
    .update(decisionMacPayload(request.gateId, actionHmac, "rejected", issuedAtUnix, nonce), "utf8")
    .digest("hex");

  const callbackBaseUrl = request.callbackBaseUrl?.trim() ?? "";
  if (!callbackBaseUrl) {
    throw new SpurvikConfigError(
      "callbackBaseUrl is required. Pass a URL that accepts GET clicks on the Approve and Block links. The SDK does not supply a console default.",
    );
  }
  const base = callbackBaseUrl.replace(/\/+$/, "");
  const queryBase = `gateId=${encodeURIComponent(request.gateId)}&ts=${issuedAtUnix}&hmac=${actionHmac}&nonce=${encodeURIComponent(nonce)}`;

  return {
    gateId: request.gateId,
    actionName: request.actionName,
    actionHmac,
    approveToken,
    rejectToken,
    approveUrl: `${base}?${queryBase}&decision=approved&sig=${approveToken}`,
    rejectUrl: `${base}?${queryBase}&decision=rejected&sig=${rejectToken}`,
    nonce,
    issuedAtUnix,
  };
}

/**
 * Checks Spurvik's own Approve / Block link token in constant time.
 * This does not verify a Slack, Telegram, Discord, Teams, or other platform webhook signature.
 * Approvers click signed links. The SDK does not receive platform webhooks.
 * Pass `nonce` for tokens created by this version. Omit it for a 1.0.4 token, which has no nonce.
 */
export function verifyChannelApprovalToken(params: {
  gateId: string;
  actionHmac: string;
  decision: "approved" | "rejected";
  issuedAtUnix: number;
  signature: string;
  signingSecret: string;
  nonce?: string | null;
  maxAgeSeconds?: number;
  nowUnixSeconds?: number;
}): boolean {
  if (typeof params.signature !== "string") return false;
  assertSigningSecret(params.signingSecret);
  const maxAge = resolveMaxAgeSeconds(params.maxAgeSeconds);
  const now = params.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.issuedAtUnix)) return false;
  if (now - params.issuedAtUnix > maxAge) return false;
  if (params.issuedAtUnix - now > MAX_CLOCK_SKEW_SECONDS) return false;

  const expectedHex = createHmac("sha256", params.signingSecret)
    .update(decisionMacPayload(params.gateId, params.actionHmac, params.decision, params.issuedAtUnix, params.nonce), "utf8")
    .digest("hex");

  if (params.signature.length !== expectedHex.length) return false;
  try {
    const actualBuf = Buffer.from(params.signature, "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");
    return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

export interface SignedChannelCallbackResult {
  ok: true;
  decision: "approved" | "rejected";
  gateId: string;
  actionHmac: string;
  issuedAtUnix: number;
  nonce: string | null;
}

/**
 * Checks Spurvik's own approval-link token.
 * Returns `{ ok: true, decision, gateId, actionHmac, issuedAtUnix, nonce }` when the token matches.
 * Returns `false` when it does not, including when `signature` is missing or not a string.
 * A missing signature does not throw. A missing or too-short signing secret still throws.
 * This does not verify a Slack, Telegram, Discord, or other platform webhook signature.
 */
export function verifySignedChannelCallback(input: {
  gateId?: unknown;
  actionHmac?: unknown;
  decision?: unknown;
  issuedAtUnix?: unknown;
  signature?: unknown;
  nonce?: unknown;
  signingSecret: string;
  maxAgeSeconds?: number;
  nowUnixSeconds?: number;
}): SignedChannelCallbackResult | false {
  if (input == null || typeof input.signature !== "string" || input.signature.length === 0) return false;
  if (typeof input.gateId !== "string" || input.gateId.length === 0) return false;
  if (typeof input.actionHmac !== "string" || input.actionHmac.length === 0) return false;
  if (input.decision !== "approved" && input.decision !== "rejected") return false;
  const issuedAtUnix = typeof input.issuedAtUnix === "number" ? input.issuedAtUnix : Number.NaN;
  if (!Number.isFinite(issuedAtUnix)) return false;
  const nonce = typeof input.nonce === "string" && input.nonce.length > 0 ? input.nonce : null;
  const ok = verifyChannelApprovalToken({
    gateId: input.gateId,
    actionHmac: input.actionHmac,
    decision: input.decision,
    issuedAtUnix,
    signature: input.signature,
    nonce,
    signingSecret: input.signingSecret,
    maxAgeSeconds: input.maxAgeSeconds,
    nowUnixSeconds: input.nowUnixSeconds,
  });
  if (!ok) return false;
  return {
    ok: true,
    decision: input.decision,
    gateId: input.gateId,
    actionHmac: input.actionHmac,
    issuedAtUnix,
    nonce,
  };
}

/**
 * Builds the native channel request URL, headers, and body for any of the 9 supported
 * human-in-the-loop channels (`slack`, `telegram`, `email`, `discord`, `teams`, `linear`, `jira`, `monday`, `asana`).
 */
export function buildChannelOutboundRequest(
  channel: HumanApprovalChannelConfig,
  request: HumanChannelActionRequest,
  links: SignedApprovalLinks,
): { url: string; headers: Record<string, string>; body: string } {
  assertChannelConfig(channel);
  const shortHmac = links.actionHmac.slice(0, 12);
  const title = `[Spurvik Art. 14 Gate] ${request.actionName}`;
  const details = `${request.summary} (gate=${request.gateId}, hmac=${shortHmac})`;

  switch (channel.type) {
    case "slack":
      return {
        url: channel.webhookUrl,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `${title}: ${details}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${title}*\n${request.summary}\n\`gate=${request.gateId}\` · \`hmac=${shortHmac}\``,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Approve Action" },
                  style: "primary",
                  url: links.approveUrl,
                  action_id: `spurvik_approve_${request.gateId}`,
                },
                {
                  type: "button",
                  text: { type: "plain_text", text: "Block Agent" },
                  style: "danger",
                  url: links.rejectUrl,
                  action_id: `spurvik_reject_${request.gateId}`,
                },
              ],
            },
          ],
        }),
      };

    case "telegram": {
      const apiBase = (channel.apiBaseUrl?.trim() || "https://api.telegram.org").replace(/\/+$/, "");
      return {
        url: `${apiBase}/bot${channel.botToken}/sendMessage`,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: channel.chatId,
          text: `${title}\n${request.summary}\ngate=${request.gateId} · hmac=${shortHmac}`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Approve Action", url: links.approveUrl },
                { text: "Block Agent", url: links.rejectUrl },
              ],
            ],
          },
        }),
      };
    }

    case "email": {
      const apiBase = (channel.apiBaseUrl?.trim() || "https://api.resend.com").replace(/\/+$/, "");
      const recipients = Array.isArray(channel.to) ? channel.to : [channel.to];
      return {
        url: `${apiBase}/emails`,
        headers: {
          authorization: `Bearer ${channel.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: channel.from,
          to: recipients,
          subject: `${title} — Human approval required`,
          text: `${title}\n\n${request.summary}\nGate ID: ${request.gateId}\nHMAC-SHA256: ${links.actionHmac}\n\nApprove: ${links.approveUrl}\nBlock: ${links.rejectUrl}`,
          html: `<div style="font-family:sans-serif;background:#05080F;color:#F8FAFC;padding:24px;border-radius:12px;">
  <h2 style="margin:0 0 8px;color:#10B981;">${escapeHtml(title)}</h2>
  <p style="margin:0 0 16px;color:#CBD5E1;">${escapeHtml(request.summary)}</p>
  <p style="font-family:monospace;font-size:12px;color:#94A3B8;">gate=${escapeHtml(request.gateId)} · hmac=${escapeHtml(shortHmac)}</p>
  <div style="margin-top:20px;">
    <a href="${escapeHtml(links.approveUrl)}" style="background:#10B981;color:#05080F;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:12px;">Approve Action</a>
    <a href="${escapeHtml(links.rejectUrl)}" style="background:#EF4444;color:#FFFFFF;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Block Agent</a>
  </div>
</div>`,
        }),
      };
    }

    case "discord":
      return {
        url: channel.webhookUrl,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: `**${title}**\n${request.summary}\n\`gate=${request.gateId}\` · \`hmac=${shortHmac}\`\nApprove: <${links.approveUrl}> | Block: <${links.rejectUrl}>`,
        }),
      };

    case "teams":
      return {
        url: channel.webhookUrl,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                type: "AdaptiveCard",
                version: "1.4",
                body: [
                  { type: "TextBlock", text: title, weight: "Bolder", size: "Medium" },
                  { type: "TextBlock", text: request.summary, wrap: true },
                  { type: "TextBlock", text: `gate=${request.gateId} · hmac=${shortHmac}`, isSubtle: true, wrap: true },
                ],
                actions: [
                  { type: "Action.OpenUrl", title: "Approve Action", url: links.approveUrl },
                  { type: "Action.OpenUrl", title: "Block Agent", url: links.rejectUrl },
                ],
              },
            },
          ],
        }),
      };

    case "linear":
      return {
        url: channel.apiUrl?.trim() || "https://api.linear.app/graphql",
        headers: {
          authorization: channel.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: `mutation SpurvikCreateHitlIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`,
          variables: {
            input: {
              teamId: channel.teamId,
              title,
              description: `${request.summary}\n\n- **Gate ID**: \`${request.gateId}\`\n- **Art. 12 HMAC-SHA256**: \`${links.actionHmac}\`\n- [Approve Action](${links.approveUrl})\n- [Block Agent](${links.rejectUrl})`,
            },
          },
        }),
      };

    case "jira": {
      const base = channel.baseUrl.replace(/\/+$/, "");
      const basic = Buffer.from(`${channel.email}:${channel.apiToken}`, "utf8").toString("base64");
      return {
        url: `${base}/rest/api/3/issue`,
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            project: { key: channel.projectKey },
            summary: title,
            issuetype: { name: channel.issueTypeName || "Task" },
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: `${details}\nApprove: ${links.approveUrl}\nBlock: ${links.rejectUrl}`,
                    },
                  ],
                },
              ],
            },
          },
        }),
      };
    }

    case "monday":
      // Creates a board item only. The item name does not include Approve or Block links.
      return {
        url: channel.apiUrl?.trim() || "https://api.monday.com/v2",
        headers: {
          authorization: channel.apiToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: `mutation ($boardId: ID!, $groupId: String, $itemName: String!) { create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName) { id } }`,
          variables: {
            boardId: channel.boardId,
            groupId: channel.groupId,
            itemName: `${title} — ${request.summary} [gate=${request.gateId}]`,
          },
        }),
      };

    case "asana": {
      const apiBase = (channel.apiBaseUrl?.trim() || "https://app.asana.com/api/1.0").replace(/\/+$/, "");
      return {
        url: `${apiBase}/tasks`,
        headers: {
          authorization: `Bearer ${channel.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: {
            name: title,
            projects: [channel.projectGid],
            notes: `${request.summary}\n\nGate ID: ${request.gateId}\nHMAC-SHA256: ${links.actionHmac}\nApprove: ${links.approveUrl}\nBlock: ${links.rejectUrl}`,
          },
        }),
      };
    }
  }
}

/**
 * Dispatches a signed human-in-the-loop (`ask_human`) approval request to any supported channel
 * (`slack`, `telegram`, `email`, `discord`, `teams`, `linear`, `jira`, `monday`, `asana`).
 */
export async function dispatchHumanApprovalChannel(
  channel: HumanApprovalChannelConfig,
  request: HumanChannelActionRequest,
  opts: {
    signingSecret: string;
    fetchImpl?: typeof fetch;
    issuedAtUnix?: number;
  },
): Promise<ChannelDispatchReceipt> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const links = createSignedApprovalLinks(request, opts.signingSecret, opts.issuedAtUnix);
  const outbound = buildChannelOutboundRequest(channel, request, links);

  const response = await fetchImpl(outbound.url, {
    method: "POST",
    headers: outbound.headers,
    body: outbound.body,
  });

  if (!response.ok) {
    throw new Error(`Channel dispatch (${channel.type}) failed with HTTP ${response.status}.`);
  }

  let externalId: string | null = null;
  let notSent: string | null = null;
  try {
    const data = (await response.json()) as Record<string, unknown>;
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      notSent = `Channel dispatch (${channel.type}) returned ${data.errors.length} GraphQL error(s) with HTTP ${response.status}.`;
    } else if (data?.error_code !== undefined && data.error_code !== null && String(data.error_code).length > 0) {
      notSent = `Channel dispatch (${channel.type}) was not sent (error_code ${String(data.error_code)}) with HTTP ${response.status}.`;
    } else {
      const issueCreate = (data?.data as { issueCreate?: { success?: boolean; issue?: { id?: string } } } | undefined)
        ?.issueCreate;
      if (issueCreate && issueCreate.success === false) {
        notSent = `Channel dispatch (${channel.type}) was not sent (success is false) with HTTP ${response.status}.`;
      } else if (typeof data?.id === "string") externalId = data.id;
      else if (typeof (data?.result as { message_id?: number } | undefined)?.message_id === "number") {
        externalId = String((data.result as { message_id: number }).message_id);
      } else if (typeof issueCreate?.issue?.id === "string") {
        externalId = issueCreate.issue.id;
      } else if (typeof (data?.data as { gid?: string } | undefined)?.gid === "string") {
        externalId = (data.data as { gid: string }).gid;
      } else if (typeof (data?.data as { create_item?: { id?: string } } | undefined)?.create_item?.id === "string") {
        externalId = (data.data as { create_item: { id: string } }).create_item.id;
      }
    }
  } catch {
    // Non-JSON responses (e.g. Slack `"ok"` text) are valid.
  }
  if (notSent) {
    throw new Error(notSent);
  }

  return {
    channel: channel.type,
    gateId: request.gateId,
    actionHmac: links.actionHmac,
    httpStatus: response.status,
    externalId,
  };
}

/**
 * Multi-channel `ask_human()` router that fans out a deterministic pre-flight approval request
 * across all configured channels (e.g. Slack + Linear, or Telegram + Email) in parallel.
 */
export function createMultiChannelApprovalRouter(opts: {
  signingSecret: string;
  channels: HumanApprovalChannelConfig[];
  fetchImpl?: typeof fetch;
}) {
  assertSigningSecret(opts.signingSecret);
  if (!Array.isArray(opts.channels) || opts.channels.length === 0) {
    throw new SpurvikConfigError("Provide at least one channel in createMultiChannelApprovalRouter.");
  }
  opts.channels.forEach(assertChannelConfig);

  return {
    async requestApproval(
      request: HumanChannelActionRequest,
    ): Promise<{ links: SignedApprovalLinks; receipts: ChannelDispatchReceipt[] }> {
      const links = createSignedApprovalLinks(request, opts.signingSecret);
      const receipts = await Promise.all(
        opts.channels.map((channel) =>
          dispatchHumanApprovalChannel(channel, request, {
            signingSecret: opts.signingSecret,
            fetchImpl: opts.fetchImpl,
            issuedAtUnix: links.issuedAtUnix,
          }),
        ),
      );
      return { links, receipts };
    },
    verifyCallback(params: {
      gateId: string;
      actionHmac: string;
      decision: "approved" | "rejected";
      issuedAtUnix: number;
      signature: string;
      nonce?: string | null;
      maxAgeSeconds?: number;
    }): boolean {
      return verifyChannelApprovalToken({
        ...params,
        signingSecret: opts.signingSecret,
      });
    },
  };
}
