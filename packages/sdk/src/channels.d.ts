/**
 * Supported drop-in human-in-the-loop (`ask_human`) channels for EU AI Act Art. 14 oversight:
 * - Instant messaging & email: `slack`, `telegram`, `email`, `discord`, `teams`
 * - Work & issue trackers: `linear`, `jira`, `monday` (creates an item only; no Approve or Block links), `asana`
 */
export type HumanApprovalChannelType = "slack" | "telegram" | "email" | "discord" | "teams" | "linear" | "jira" | "monday" | "asana";
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
export type HumanApprovalChannelConfig = SlackChannelConfig | TelegramChannelConfig | EmailChannelConfig | DiscordChannelConfig | TeamsChannelConfig | LinearChannelConfig | JiraChannelConfig | MondayChannelConfig | AsanaChannelConfig;
export interface ChannelDispatchReceipt {
    channel: HumanApprovalChannelType;
    gateId: string;
    actionHmac: string;
    httpStatus: number;
    externalId: string | null;
}
/**
 * Generates a deterministic HMAC-SHA256 digest and signed Approve / Block URLs
 * without persisting raw prompt text (GDPR Art. 5(1)(c) & EU AI Act Art. 12/14).
 */
export declare function createSignedApprovalLinks(request: HumanChannelActionRequest, signingSecret: string, issuedAtUnix?: number): SignedApprovalLinks;
/**
 * Checks Spurvik's own Approve / Block link token in constant time.
 * This does not verify a Slack, Telegram, Discord, Teams, or other platform webhook signature.
 * Approvers click signed links. The SDK does not receive platform webhooks.
 * Pass `nonce` for tokens created by this version. Omit it for a 1.0.4 token, which has no nonce.
 */
export declare function verifyChannelApprovalToken(params: {
    gateId: string;
    actionHmac: string;
    decision: "approved" | "rejected";
    issuedAtUnix: number;
    signature: string;
    signingSecret: string;
    nonce?: string | null;
    maxAgeSeconds?: number;
    nowUnixSeconds?: number;
}): boolean;
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
export declare function verifySignedChannelCallback(input: {
    gateId?: unknown;
    actionHmac?: unknown;
    decision?: unknown;
    issuedAtUnix?: unknown;
    signature?: unknown;
    nonce?: unknown;
    signingSecret: string;
    maxAgeSeconds?: number;
    nowUnixSeconds?: number;
}): SignedChannelCallbackResult | false;
/**
 * Builds the native channel request URL, headers, and body for any of the 9 supported
 * human-in-the-loop channels (`slack`, `telegram`, `email`, `discord`, `teams`, `linear`, `jira`, `monday`, `asana`).
 */
export declare function buildChannelOutboundRequest(channel: HumanApprovalChannelConfig, request: HumanChannelActionRequest, links: SignedApprovalLinks): {
    url: string;
    headers: Record<string, string>;
    body: string;
};
/**
 * Dispatches a signed human-in-the-loop (`ask_human`) approval request to any supported channel
 * (`slack`, `telegram`, `email`, `discord`, `teams`, `linear`, `jira`, `monday`, `asana`).
 */
export declare function dispatchHumanApprovalChannel(channel: HumanApprovalChannelConfig, request: HumanChannelActionRequest, opts: {
    signingSecret: string;
    fetchImpl?: typeof fetch;
    issuedAtUnix?: number;
}): Promise<ChannelDispatchReceipt>;
/**
 * Multi-channel `ask_human()` router that fans out a deterministic pre-flight approval request
 * across all configured channels (e.g. Slack + Linear, or Telegram + Email) in parallel.
 */
export declare function createMultiChannelApprovalRouter(opts: {
    signingSecret: string;
    channels: HumanApprovalChannelConfig[];
    fetchImpl?: typeof fetch;
}): {
    requestApproval(request: HumanChannelActionRequest): Promise<{
        links: SignedApprovalLinks;
        receipts: ChannelDispatchReceipt[];
    }>;
    verifyCallback(params: {
        gateId: string;
        actionHmac: string;
        decision: "approved" | "rejected";
        issuedAtUnix: number;
        signature: string;
        nonce?: string | null;
        maxAgeSeconds?: number;
    }): boolean;
};
