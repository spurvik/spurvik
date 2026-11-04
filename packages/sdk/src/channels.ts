import { createHmac, timingSafeEqual } from "node:crypto";
import { SpurvikConfigError } from "./errors.js";

/**
 * Supported drop-in human-in-the-loop (`ask_human`) channels for EU AI Act Art. 14 oversight:
 * - Instant messaging & email: `slack`, `telegram`, `email`, `discord`, `teams`
 * - Work & issue trackers: `linear`, `jira`, `monday`, `asana`
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
  /** Short, non-PII summary of the proposed action (raw prompts are never sent or logged). */
  summary: string;
  /** Optional pre-hashed or structured non-PII metadata (e.g. `{ amountEur: 240, currency: "EUR" }`). */
  context?: Record<string, string | number | boolean>;
  /** Base callback URL where 1-click Approve/Block links point (e.g. `https://console.spurvik.com/api/v1/hitl/callback`). */
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

function assertSigningSecret(secret: string): void {
  if (typeof secret !== "string" || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new SpurvikConfigError(
      "Channel approval signing secret must be at least 16 characters (EU AI Act Art. 12 / Art. 14).",
    );
  }
}

/**
 * Generates deterministic HMAC-SHA256 digest and signed 1-click Approve / Block URLs
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

  const approveToken = createHmac("sha256", signingSecret)
    .update(`spurvik:art14:decision:v1|${request.gateId}|${actionHmac}|approved|${issuedAtUnix}`, "utf8")
    .digest("hex");

  const rejectToken = createHmac("sha256", signingSecret)
    .update(`spurvik:art14:decision:v1|${request.gateId}|${actionHmac}|rejected|${issuedAtUnix}`, "utf8")
    .digest("hex");

  const base = (request.callbackBaseUrl?.trim() || "https://console.spurvik.com/api/v1/hitl").replace(/\/+$/, "");
  const queryBase = `gateId=${encodeURIComponent(request.gateId)}&ts=${issuedAtUnix}&hmac=${actionHmac}`;

  return {
    gateId: request.gateId,
    actionName: request.actionName,
    actionHmac,
    approveToken,
    rejectToken,
    approveUrl: `${base}?${queryBase}&decision=approved&sig=${approveToken}`,
    rejectUrl: `${base}?${queryBase}&decision=rejected&sig=${rejectToken}`,
    issuedAtUnix,
  };
}

/**
 * Verifies a 1-click Approve / Block callback signature in constant time.
 */
export function verifyChannelApprovalToken(params: {
  gateId: string;
  actionHmac: string;
  decision: "approved" | "rejected";
  issuedAtUnix: number;
  signature: string;
  signingSecret: string;
  maxAgeSeconds?: number;
  nowUnixSeconds?: number;
}): boolean {
  assertSigningSecret(params.signingSecret);
  const maxAge = params.maxAgeSeconds ?? 86_400;
  const now = params.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - params.issuedAtUnix) > maxAge) return false;

  const expectedHex = createHmac("sha256", params.signingSecret)
    .update(
      `spurvik:art14:decision:v1|${params.gateId}|${params.actionHmac}|${params.decision}|${params.issuedAtUnix}`,
      "utf8",
    )
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

/**
 * Builds the native channel request URL, headers, and body for any of the 9 supported
 * human-in-the-loop channels (`slack`, `telegram`, `email`, `discord`, `teams`, `linear`, `jira`, `monday`, `asana`).
 */
export function buildChannelOutboundRequest(
  channel: HumanApprovalChannelConfig,
  request: HumanChannelActionRequest,
  links: SignedApprovalLinks,
): { url: string; headers: Record<string, string>; body: string } {
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
  <h2 style="margin:0 0 8px;color:#10B981;">${title}</h2>
  <p style="margin:0 0 16px;color:#CBD5E1;">${request.summary}</p>
  <p style="font-family:monospace;font-size:12px;color:#94A3B8;">gate=${request.gateId} · hmac=${shortHmac} · raw_prompt=0B</p>
  <div style="margin-top:20px;">
    <a href="${links.approveUrl}" style="background:#10B981;color:#05080F;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:12px;">Approve Action</a>
    <a href="${links.rejectUrl}" style="background:#EF4444;color:#FFFFFF;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Block Agent</a>
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
  try {
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data?.id === "string") externalId = data.id;
    else if (typeof (data?.result as { message_id?: number } | undefined)?.message_id === "number") {
      externalId = String((data.result as { message_id: number }).message_id);
    } else if (
      typeof (data?.data as { issueCreate?: { issue?: { id?: string } } } | undefined)?.issueCreate?.issue?.id ===
      "string"
    ) {
      externalId = (data.data as { issueCreate: { issue: { id: string } } }).issueCreate.issue.id;
    } else if (typeof (data?.data as { gid?: string } | undefined)?.gid === "string") {
      externalId = (data.data as { gid: string }).gid;
    }
  } catch {
    // Non-JSON responses (e.g. Slack `"ok"` text) are valid.
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
      maxAgeSeconds?: number;
    }): boolean {
      return verifyChannelApprovalToken({
        ...params,
        signingSecret: opts.signingSecret,
      });
    },
  };
}
