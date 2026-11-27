import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import type { HumanApprovalChannelConfig } from "spurvik-sdk";
import { spurvikAnnexIvDraft } from "../../annex-iv-draft";
import { checkSpurvikImageC2paUrl } from "../../check-image-c2pa-url";
import { spurvikGateSelfTest } from "../../gate-self-test";
import { batchScanSpurvikDomains, scanSpurvikDomain } from "../../scan-domain";
import { spurvikVendorQuestionnaireAnswers } from "../../vendor-questionnaire";
import {
  executeSpurvikWorkflowStep,
  type SpurvikWorkflowNodeInput,
  type SpurvikWorkflowOperation,
} from "../../workflow";

/** Zero-key operations: they read no credential and copy nothing from the incoming item. */
const SCAN_DOMAIN_OPERATION = "scanDomain";
const BATCH_SCAN_DOMAINS_OPERATION = "batchScanDomains";
const CHECK_IMAGE_C2PA_URL_OPERATION = "checkImageC2paUrl";
const VENDOR_QUESTIONNAIRE_OPERATION = "vendorQuestionnaireAnswers";
const GATE_SELF_TEST_OPERATION = "gateSelfTest";
const ANNEX_IV_DRAFT_OPERATION = "annexIvDraft";
const ZERO_KEY_OPERATIONS: readonly string[] = [
  SCAN_DOMAIN_OPERATION,
  BATCH_SCAN_DOMAINS_OPERATION,
  CHECK_IMAGE_C2PA_URL_OPERATION,
  VENDOR_QUESTIONNAIRE_OPERATION,
  GATE_SELF_TEST_OPERATION,
  ANNEX_IV_DRAFT_OPERATION,
];
const DEFAULT_CONSOLE_BASE_URL = "https://console.spurvik.com";

const PROMPT_FIELD_NAMES = new Set(["prompttext", "prompt", "chatinput", "query", "input"]);

const BLOCKED_PASSTHROUGH = new Set([
  ...PROMPT_FIELD_NAMES,
  "rawinputtext",
  "rawprompt",
  "signingsecret",
  "hmacsecret",
  "consoleapikey",
]);

function isPromptFieldName(name: string): boolean {
  return PROMPT_FIELD_NAMES.has(name.trim().toLowerCase());
}

/** Name check only. Trimmed, case-insensitive. Does not read the field value. */
function skipPassThroughField(field: string, inputField: string): boolean {
  const key = field.trim().toLowerCase();
  return BLOCKED_PASSTHROUGH.has(key) || key === inputField.trim().toLowerCase();
}

export const SpurvikN8nNodeDescription: INodeTypeDescription = {
  displayName: "Spurvik AI Act Guard",
  name: "spurvikEuAiActGuard",
  icon: "file:spurvik.svg",
  group: ["transform"],
  version: 1,
  description:
    "Designed to support an AI interaction notice, an HMAC-SHA256 digest, and a human approval request. It does not by itself mean anyone meets the AI Act.",
  defaults: {
    name: "Spurvik AI Act Guard",
  },
  inputs: ["main"],
  outputs: ["main"],
  credentials: [
    {
      name: "spurvikApi",
      required: true,
      displayOptions: {
        hide: {
          operation: [
            "scanDomain",
            "batchScanDomains",
            "checkImageC2paUrl",
            "vendorQuestionnaireAnswers",
            "gateSelfTest",
            "annexIvDraft",
          ],
        },
      },
    },
  ],
  properties: [
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "art50_disclosure",
      options: [
        {
          name: "Add an AI interaction notice",
          value: "art50_disclosure",
          description: "Prepend a notice to one text field. Does not record a digest.",
        },
        {
          name: "Record an HMAC-SHA256 digest",
          value: "art12_hmac_log",
          description:
            "Designed to support Article 12 record-keeping for high-risk AI systems. The field value is not returned (including when listed in passThroughFields).",
        },
        {
          name: "Send an ask_human() approval request",
          value: "art14_ask_human",
          description: "Designed to support Article 14 human oversight for high-risk AI systems.",
        },
        {
          name: "Scan Live Domain (Art. 50 & Client Brief)",
          value: "scanDomain",
          description:
            "Check one public site for AI chat widgets and an Art. 50 notice, and return a badge snippet, status shield, plus report and upgrade links. Needs no credential or API key.",
        },
        {
          name: "Batch Scan up to 10 Domains (Agency Roster)",
          value: "batchScanDomains",
          description:
            "Scan 1 to 10 public client sites in one step and count the Art. 50 notice gaps. Every entry is checked before any request. Needs no credential or API key.",
        },
        {
          name: "Check Image C2PA & CDN Strip (Art. 50(2))",
          value: "checkImageC2paUrl",
          description:
            "Read-only C2PA JUMBF manifest & CDN-strip checker for one public https image (PNG, JPEG or WebP, up to 4 MB). It never signs or adds a manifest. Needs no credential or API key.",
        },
        {
          name: "Answer Vendor Security Questionnaire (Art. 50/12/14 RFP)",
          value: "vendorQuestionnaireAnswers",
          description:
            "Copy-paste Markdown answers to the five EU AI Act questions in enterprise vendor security questionnaires and DPO RFPs, from Spurvik's shipped controls. Built locally: no request, no credential or API key.",
        },
        {
          name: "Test Art. 14 Human Approval Blocking (6 Vectors)",
          value: "gateSelfTest",
          description:
            "Offline 6-vector HMAC-SHA256 self-test of Spurvik's fail-closed Art. 14 human approval gate (unapproved halt, signed reject, payload tamper, decision-flip forgery, expired TTL replay, and authentic approval). Runs locally: no request, no credential or API key.",
        },
        {
          name: "Draft Annex IV Technical Documentation (Art. 11)",
          value: "annexIvDraft",
          description:
            "Generate a 9-section EU AI Act Article 11(1) & Annex IV technical documentation Markdown draft and JSON structure matched to Annex III use cases. Runs locally: no request, no credential or API key.",
        },
      ],
    },
    {
      displayName: "Domain or URL",
      name: "domainOrUrl",
      type: "string",
      default: "",
      required: true,
      placeholder: "stepnetwork.dk",
      displayOptions: { show: { operation: ["scanDomain"] } },
      description:
        "Public domain or http(s) URL of the site to scan, for example stepnetwork.dk. Only the hostname is sent to the console. localhost, IP addresses, internal names (.local, .internal, .lan, .home.arpa), single-label hosts, user:password@ and non-default ports are refused.",
    },
    {
      displayName: "Domains",
      name: "domainsList",
      type: "string",
      typeOptions: { rows: 3 },
      default: "",
      required: true,
      placeholder: "folk.app, stepnetwork.dk",
      displayOptions: { show: { operation: ["batchScanDomains"] } },
      description:
        "1 to 10 public domains or http(s) URLs, separated by commas, spaces or new lines (an expression may also return an array of strings). Every entry is checked before any request: one localhost, IP address, internal name, user:password@ or non-default port refuses the whole batch. Only hostnames are sent to the console, and duplicates are scanned once.",
    },
    {
      displayName: "Image URL",
      name: "imageUrl",
      type: "string",
      default: "",
      required: true,
      placeholder: "https://example.com/hero.png",
      displayOptions: { show: { operation: ["checkImageC2paUrl"] } },
      description:
        "Public https URL of a PNG, JPEG or WebP image up to 4 MB, or a bare public domain / https store page URL (e.g. charlie-paris.com) to auto-discover its frontpage hero image in 1 hop. http, ports other than 443, user:password@, localhost, IP addresses, internal names (.local, .internal, .lan, .home.arpa) and single-label hosts are refused before any request.",
    },
    {
      displayName: "Spurvik Plan",
      name: "questionnairePlan",
      type: "options",
      default: "pro",
      displayOptions: { show: { operation: ["vendorQuestionnaireAnswers"] } },
      description: "Spurvik plan the answers describe. Prices excl. VAT, B2B.",
      options: [
        { name: "Free (€0, 10,000 events/mo, 30 days)", value: "free" },
        { name: "Pro (€19/mo, 250,000 events/mo, 90 days)", value: "pro" },
        { name: "Team (€79/mo, 2,000,000 events/mo, 12 months)", value: "team" },
        { name: "Done-For-You 24h Setup (€199 once, incl. 1 yr Pro)", value: "concierge" },
      ],
    },
    {
      displayName: "Model Provider or Framework",
      name: "questionnaireProvider",
      type: "options",
      default: "openai",
      displayOptions: { show: { operation: ["vendorQuestionnaireAnswers"] } },
      description: "Model provider or agent framework your product uses. It picks the wrapper and approval API named in the answers.",
      options: [
        { name: "OpenAI", value: "openai" },
        { name: "Anthropic", value: "anthropic" },
        { name: "Google Gemini (Google Gen AI SDK)", value: "google-genai" },
        { name: "Vercel AI SDK", value: "vercel-ai-sdk" },
        { name: "LangGraph", value: "langgraph" },
        { name: "OpenAI Agents SDK", value: "openai-agents" },
        { name: "Mastra", value: "mastra" },
        { name: "Python (FastAPI / LangChain / PydanticAI)", value: "python" },
        { name: "Custom", value: "custom" },
      ],
    },
    {
      displayName: "Has High-Risk Agent Actions",
      name: "hasHighRiskActions",
      type: "boolean",
      default: true,
      displayOptions: { show: { operation: ["vendorQuestionnaireAnswers"] } },
      description: "Whether agents or tools can issue refunds, send emails, change permissions or delete data.",
    },
    {
      displayName: "Generates Synthetic Media",
      name: "generatesMedia",
      type: "boolean",
      default: false,
      displayOptions: { show: { operation: ["vendorQuestionnaireAnswers"] } },
      description: "Whether the product generates synthetic images, audio or video (Art. 50(2)).",
    },
    {
      displayName: "Product Domain",
      name: "questionnaireDomain",
      type: "string",
      default: "",
      placeholder: "acme.eu",
      displayOptions: { show: { operation: ["vendorQuestionnaireAnswers"] } },
      description:
        "Optional public domain or http(s) URL of your product, used to prefill the answers and links. It is never sent anywhere. localhost, IP addresses, internal names and anything else that is not a public hostname are ignored and not repeated in the output.",
    },
    {
      displayName: "Answer Language",
      name: "questionnaireLocale",
      type: "options",
      default: "en",
      displayOptions: { show: { operation: ["vendorQuestionnaireAnswers"] } },
      description: "Language of the generated Q1–Q5 vendor security questionnaire answers and interactive DPO/DSB/FG cockpit links.",
      options: [
        { name: "English (en)", value: "en" },
        { name: "Deutsch — DSB (de)", value: "de" },
        { name: "Français — DPO (fr)", value: "fr" },
        { name: "Nederlands — FG (nl)", value: "nl" },
        { name: "Dansk — DPO (da)", value: "da" },
        { name: "Svenska — DSO / DPO (sv)", value: "sv" },
        { name: "Español — DPD (es)", value: "es" },
        { name: "Italiano — RPD / DPO (it)", value: "it" },
      ],
    },
    {
      displayName: "Product Domain",
      name: "gateTestDomain",
      type: "string",
      default: "",
      placeholder: "acme.eu",
      displayOptions: { show: { operation: ["gateSelfTest"] } },
      description:
        "Optional public domain or http(s) URL of your product, used only to prefill the Art. 14 cockpit and signup links. Never sent over the network; private, IP, or localhost values are ignored.",
    },
    {
      displayName: "Cockpit Language",
      name: "gateTestLocale",
      type: "options",
      default: "en",
      displayOptions: { show: { operation: ["gateSelfTest"] } },
      description: "Language of the linked interactive EU AI Act Art. 14 oversight cockpit and upgrade links.",
      options: [
        { name: "English (en)", value: "en" },
        { name: "Deutsch (de)", value: "de" },
        { name: "Français (fr)", value: "fr" },
        { name: "Nederlands (nl)", value: "nl" },
        { name: "Dansk (da)", value: "da" },
        { name: "Svenska (sv)", value: "sv" },
        { name: "Español (es)", value: "es" },
        { name: "Italiano (it)", value: "it" },
      ],
    },
    {
      displayName: "Product Domain",
      name: "annexIvDomain",
      type: "string",
      default: "",
      placeholder: "personio.de",
      displayOptions: { show: { operation: ["annexIvDraft"] } },
      description:
        "Optional public domain or http(s) URL of your AI system, used only to prefill the 9-section Annex IV draft and studio links. Never sent over the network; private, IP, or localhost values are ignored.",
    },
    {
      displayName: "Annex III Use Case",
      name: "annexIvUseCase",
      type: "options",
      default: "employment",
      displayOptions: { show: { operation: ["annexIvDraft"] } },
      description: "High-risk Annex III category or voluntary enterprise B2B agent scope.",
      options: [
        { name: "Employment, HR & Recruitment (Annex III §4)", value: "employment" },
        { name: "Creditworthiness & Underwriting (Annex III §5b)", value: "credit" },
        { name: "Education & Assessment (Annex III §3)", value: "education" },
        { name: "Essential Services & Claims Triage (Annex III §5a/c)", value: "essential_services" },
        { name: "Permitted Biometric Verification (Annex III §1)", value: "biometrics" },
        { name: "Enterprise B2B Agent (Voluntary / Procurement)", value: "support_agent" },
      ],
    },
    {
      displayName: "Upstream Model Stack",
      name: "annexIvProvider",
      type: "options",
      default: "openai",
      displayOptions: { show: { operation: ["annexIvDraft"] } },
      description: "Model provider or Python runtime named in Section 02 of the Annex IV draft.",
      options: [
        { name: "OpenAI", value: "openai" },
        { name: "Anthropic Claude", value: "anthropic" },
        { name: "Google Gemini", value: "gemini" },
        { name: "Mistral AI (EU)", value: "mistral" },
        { name: "Azure OpenAI (EU Sweden / Germany)", value: "azure-openai" },
        { name: "AWS Bedrock (EU Frankfurt)", value: "aws-bedrock" },
        { name: "Python 3.10+ (FastAPI / LangChain)", value: "python" },
        { name: "Ruby 3.1+ / Rails 7 & 8", value: "rails" },
        { name: "Java 21+ / Spring Boot 3 / LangChain4j", value: "spring-boot" },
      ],
    },
    {
      displayName: "Preview Tier",
      name: "annexIvTier",
      type: "options",
      default: "team",
      displayOptions: { show: { operation: ["annexIvDraft"] } },
      description: "Team (€79/mo) previews 9/9 populated sections; Free (€0) previews the 4/9 static skeleton.",
      options: [
        { name: "Team (€79/mo or €790/yr — 9/9 sections)", value: "team" },
        { name: "Free (€0 — 4/9 static skeleton)", value: "free" },
      ],
    },
    {
      displayName: "Studio Language",
      name: "annexIvLocale",
      type: "options",
      default: "en",
      displayOptions: { show: { operation: ["annexIvDraft"] } },
      description: "Language of the linked interactive 9-section Annex IV Studio and upgrade links.",
      options: [
        { name: "English (en)", value: "en" },
        { name: "Deutsch (de)", value: "de" },
        { name: "Français (fr)", value: "fr" },
        { name: "Nederlands (nl)", value: "nl" },
        { name: "Dansk (da)", value: "da" },
        { name: "Svenska (sv)", value: "sv" },
        { name: "Español (es)", value: "es" },
        { name: "Italiano (it)", value: "it" },
      ],
    },
    {
      displayName: "AI System Name",
      name: "systemName",
      type: "string",
      default: "AI system",
      required: true,
      displayOptions: {
        hide: {
          operation: [
            "scanDomain",
            "batchScanDomains",
            "checkImageC2paUrl",
            "vendorQuestionnaireAnswers",
            "gateSelfTest",
            "annexIvDraft",
          ],
        },
      },
    },
    {
      displayName: "Input Field",
      name: "inputField",
      type: "string",
      default: "promptText",
      displayOptions: { show: { operation: ["art50_disclosure", "art12_hmac_log"] } },
      description:
        "Name of the incoming JSON field that holds the prompt. Shown for the notice and the digest. The digest is HMAC-SHA256 of spurvik:workflow:input:v1| plus this field. The notice throws if outputField equals this name. The field value is not returned (including when listed in passThroughFields).",
    },
    {
      displayName: "Output Field",
      name: "outputField",
      type: "string",
      default: "outputText",
      displayOptions: { show: { operation: ["art50_disclosure"] } },
      description:
        "The notice operation reads outputField (default outputText) and inputField (default promptText). inputField is shown for the notice and the digest. It throws if outputField is missing or is not a string, if outputField equals inputField in any letter case, or if outputField matches promptText, prompt, chatInput, query, or input in any letter case. It does not read the prompt field. Output is { spurvik: result } plus explicitly named fields other than those prompt names. Those prompt names and the configured inputField are never copied (name check only, any letter case). The digest is HMAC-SHA256 of the prefix spurvik:workflow:input:v1| plus the input field.",
    },
    {
      displayName: "Notice Text",
      name: "noticeText",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["art50_disclosure"] } },
      description: "Notice prepended to the output field. Leave empty for the default notice.",
    },
    {
      displayName: "Channel",
      name: "channel",
      type: "options",
      default: "slack",
      displayOptions: { show: { operation: ["art14_ask_human"] } },
      description: "Where the approval request is sent.",
      options: [
        { name: "Slack", value: "slack" },
        { name: "Telegram", value: "telegram" },
        { name: "Email (Resend)", value: "email" },
        { name: "Discord", value: "discord" },
        { name: "Microsoft Teams", value: "teams" },
        { name: "Linear", value: "linear" },
        { name: "Jira", value: "jira" },
        {
          name: "Monday.com (creates an item only)",
          value: "monday",
          description: "Monday.com only creates a board item. It does not send Approve or Block links.",
        },
        { name: "Asana", value: "asana" },
      ],
    },
    {
      displayName: "Approver Target",
      name: "approverTarget",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["art14_ask_human"] } },
      description:
        "Telegram chat id, email recipient, Linear team id, Jira project key, Monday.com board id, or Asana project gid. Monday.com only creates an item and does not send Approve or Block links. Slack, Discord, and Teams use the webhook credential.",
    },
    {
      displayName: "Callback URL",
      name: "callbackBaseUrl",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["art14_ask_human"] } },
      description: "Required. URL that accepts GET clicks on Approve and Block links. There is no console default.",
    },
    {
      displayName: "Action Name",
      name: "actionName",
      type: "string",
      default: "workflow.action",
      displayOptions: { show: { operation: ["art14_ask_human"] } },
    },
    {
      displayName: "Action Summary",
      name: "actionSummary",
      type: "string",
      default: "Human approval requested",
      displayOptions: { show: { operation: ["art14_ask_human"] } },
      description: "Short summary sent to the approver. Do not put a raw prompt here.",
    },
    {
      displayName: "Email From",
      name: "emailFrom",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["art14_ask_human"], channel: ["email"] } },
    },
    {
      displayName: "Jira Base URL",
      name: "jiraBaseUrl",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["art14_ask_human"], channel: ["jira"] } },
    },
    {
      displayName: "Jira Email",
      name: "jiraEmail",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["art14_ask_human"], channel: ["jira"] } },
    },
    {
      displayName: "Console Base URL",
      name: "consoleBaseUrl",
      type: "string",
      default: "https://console.spurvik.com",
      displayOptions: { hide: { operation: ["vendorQuestionnaireAnswers", "gateSelfTest", "annexIvDraft"] } },
      description:
        "Spurvik console base URL. Scan Live Domain and Batch Scan call its public scan endpoint, and Check Image C2PA its public C2PA check, without a key. The notice, digest and approval operations sync to it only when Spurvik Console API Key is set on the spurvikApi credential, and otherwise use it for the signup links in upgradeUrls.",
    },
    {
      displayName: "Pass-through Fields",
      name: "passThroughFields",
      type: "string",
      default: "",
      displayOptions: {
        hide: {
          operation: [
            "scanDomain",
            "batchScanDomains",
            "checkImageC2paUrl",
            "vendorQuestionnaireAnswers",
            "gateSelfTest",
            "annexIvDraft",
          ],
        },
      },
      description:
        "Comma-separated names of incoming fields to copy beside the spurvik result. promptText, prompt, chatInput, query, input, and the configured inputField are never copied (name check only, any letter case, surrounding whitespace ignored).",
    },
  ],
};

function credentialValue(credentials: Record<string, unknown>, field: string, label: string): string {
  const value = credentials[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing Spurvik credential ${field} (${label}). Set it on the spurvikApi credential.`);
  }
  if (value !== value.trim()) {
    throw new Error(`Spurvik credential ${field} must not have leading or trailing whitespace.`);
  }
  return value;
}

function buildChannel(
  channel: string,
  approverTarget: string,
  credentials: Record<string, unknown>,
  extras: { emailFrom: string; jiraBaseUrl: string; jiraEmail: string },
): HumanApprovalChannelConfig {
  const target = approverTarget.trim();
  switch (channel) {
    case "slack":
      return { type: "slack", webhookUrl: credentialValue(credentials, "slackWebhookUrl", "Slack webhook URL") };
    case "telegram":
      if (!target) throw new Error("Telegram requires an approver target (chat id).");
      return {
        type: "telegram",
        botToken: credentialValue(credentials, "telegramBotToken", "Telegram bot token"),
        chatId: target,
      };
    case "email":
      if (!target) throw new Error("Email requires an approver target (recipient).");
      if (!extras.emailFrom.trim()) throw new Error("Email requires the Email From parameter.");
      return {
        type: "email",
        resendApiKey: credentialValue(credentials, "resendApiKey", "Resend API key"),
        from: extras.emailFrom.trim(),
        to: target,
      };
    case "discord":
      return { type: "discord", webhookUrl: credentialValue(credentials, "discordWebhookUrl", "Discord webhook URL") };
    case "teams":
      return {
        type: "teams",
        webhookUrl: credentialValue(credentials, "teamsWebhookUrl", "Microsoft Teams webhook URL"),
      };
    case "linear":
      if (!target) throw new Error("Linear requires an approver target (team id).");
      return {
        type: "linear",
        apiKey: credentialValue(credentials, "linearApiKey", "Linear API key"),
        teamId: target,
      };
    case "jira":
      if (!target) throw new Error("Jira requires an approver target (project key).");
      if (!extras.jiraBaseUrl.trim() || !extras.jiraEmail.trim()) {
        throw new Error("Jira requires the Jira Base URL and Jira Email parameters.");
      }
      return {
        type: "jira",
        baseUrl: extras.jiraBaseUrl.trim(),
        email: extras.jiraEmail.trim(),
        apiToken: credentialValue(credentials, "jiraApiToken", "Jira API token"),
        projectKey: target,
      };
    case "monday":
      if (!target) {
        throw new Error(
          "Monday.com requires an approver target (board id). Monday.com only creates an item and does not send Approve or Block links.",
        );
      }
      return {
        type: "monday",
        apiToken: credentialValue(credentials, "mondayApiToken", "Monday.com API token"),
        boardId: target,
      };
    case "asana":
      if (!target) throw new Error("Asana requires an approver target (project gid).");
      return {
        type: "asana",
        accessToken: credentialValue(credentials, "asanaAccessToken", "Asana access token"),
        projectGid: target,
      };
    default:
      throw new Error(`Unknown Spurvik channel: ${channel}`);
  }
}

export class SpurvikEuAiActGuard implements INodeType {
  description: INodeTypeDescription = SpurvikN8nNodeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const operationAt = (index: number): string =>
      String(this.getNodeParameter("operation", index, "art50_disclosure"));
    const operations = items.map((_, index) => operationAt(index));
    // The scan, C2PA and questionnaire operations never read the credential, so a node set to one of them works with no credential at all.
    const needsCredentials =
      items.length === 0
        ? !ZERO_KEY_OPERATIONS.includes(operationAt(0))
        : operations.some((operation) => !ZERO_KEY_OPERATIONS.includes(operation));

    let credentials: Record<string, unknown> = {};
    let signingSecret = "";
    let consoleApiKey: string | undefined;
    if (needsCredentials) {
      credentials = (await this.getCredentials("spurvikApi")) as Record<string, unknown>;
      const rawSigningSecret = credentials?.signingSecret;
      if (typeof rawSigningSecret !== "string" || rawSigningSecret.length === 0) {
        throw new Error(
          "Missing Spurvik credential signingSecret. Set it on the spurvikApi credential. The node does not read environment variables.",
        );
      }
      if (rawSigningSecret !== rawSigningSecret.trim()) {
        throw new Error("Channel approval secret must not have leading or trailing whitespace.");
      }
      if (rawSigningSecret.length < 16) {
        throw new Error("Channel approval secret must be at least 16 characters.");
      }
      signingSecret = rawSigningSecret;

      const rawConsoleApiKey = credentials?.consoleApiKey;
      if (typeof rawConsoleApiKey === "string" && rawConsoleApiKey.length > 0) {
        if (rawConsoleApiKey !== rawConsoleApiKey.trim()) {
          throw new Error("Spurvik credential consoleApiKey must not have leading or trailing whitespace.");
        }
        consoleApiKey = rawConsoleApiKey;
      }
    }

    const returnData: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {
      if (operations[i] === SCAN_DOMAIN_OPERATION) {
        const scan = await scanSpurvikDomain({
          domainOrUrl: this.getNodeParameter("domainOrUrl", i, ""),
          consoleBaseUrl: this.getNodeParameter("consoleBaseUrl", i, DEFAULT_CONSOLE_BASE_URL),
        });
        returnData.push({ json: scan as unknown as IDataObject });
        continue;
      }
      if (operations[i] === BATCH_SCAN_DOMAINS_OPERATION) {
        const batch = await batchScanSpurvikDomains({
          domainsList: this.getNodeParameter("domainsList", i, ""),
          consoleBaseUrl: this.getNodeParameter("consoleBaseUrl", i, DEFAULT_CONSOLE_BASE_URL),
        });
        returnData.push({ json: batch as unknown as IDataObject });
        continue;
      }
      if (operations[i] === CHECK_IMAGE_C2PA_URL_OPERATION) {
        const check = await checkSpurvikImageC2paUrl({
          imageUrl: this.getNodeParameter("imageUrl", i, ""),
          consoleBaseUrl: this.getNodeParameter("consoleBaseUrl", i, DEFAULT_CONSOLE_BASE_URL),
        });
        returnData.push({ json: check as unknown as IDataObject });
        continue;
      }
      if (operations[i] === VENDOR_QUESTIONNAIRE_OPERATION) {
        const answers = spurvikVendorQuestionnaireAnswers({
          plan: this.getNodeParameter("questionnairePlan", i, "pro"),
          provider: this.getNodeParameter("questionnaireProvider", i, "openai"),
          hasHighRiskActions: this.getNodeParameter("hasHighRiskActions", i, true),
          generatesMedia: this.getNodeParameter("generatesMedia", i, false),
          domain: this.getNodeParameter("questionnaireDomain", i, ""),
          locale: this.getNodeParameter("questionnaireLocale", i, "en"),
        });
        returnData.push({ json: answers as unknown as IDataObject });
        continue;
      }
      if (operations[i] === GATE_SELF_TEST_OPERATION) {
        const gateTest = spurvikGateSelfTest({
          domain: this.getNodeParameter("gateTestDomain", i, ""),
          locale: this.getNodeParameter("gateTestLocale", i, "en"),
        });
        returnData.push({ json: gateTest as unknown as IDataObject });
        continue;
      }
      if (operations[i] === ANNEX_IV_DRAFT_OPERATION) {
        const annexIv = spurvikAnnexIvDraft({
          domain: this.getNodeParameter("annexIvDomain", i, ""),
          useCase: this.getNodeParameter("annexIvUseCase", i, "employment"),
          provider: this.getNodeParameter("annexIvProvider", i, "openai"),
          tier: this.getNodeParameter("annexIvTier", i, "team"),
          locale: this.getNodeParameter("annexIvLocale", i, "en"),
        });
        returnData.push({ json: annexIv as unknown as IDataObject });
        continue;
      }
      const item = items[i]?.json ?? {};
      const operation = operations[i] as SpurvikWorkflowOperation;
      const systemName = String(this.getNodeParameter("systemName", i, "AI system"));
      const inputField = String(this.getNodeParameter("inputField", i, "promptText"));
      const consoleBaseUrl = String(this.getNodeParameter("consoleBaseUrl", i, DEFAULT_CONSOLE_BASE_URL));

      let stepInput: SpurvikWorkflowNodeInput;
      if (operation === "art50_disclosure") {
        const outputField = String(this.getNodeParameter("outputField", i, "outputText"));
        if (
          outputField.trim().toLowerCase() === inputField.trim().toLowerCase() ||
          isPromptFieldName(outputField)
        ) {
          throw new Error(
            `art50_disclosure outputField ("${outputField}") must be the AI output. It cannot equal inputField ("${inputField}") and it cannot match promptText, prompt, chatInput, query, or input.`,
          );
        }
        if (!Object.prototype.hasOwnProperty.call(item, outputField) || typeof item[outputField] !== "string") {
          throw new Error(
            `art50_disclosure requires a string field "${outputField}" on the incoming item. The notice is applied to the AI output, not the prompt.`,
          );
        }
        const noticeText = String(this.getNodeParameter("noticeText", i, ""));
        stepInput = {
          operation,
          hmacSecret: signingSecret,
          systemName,
          outputText: item[outputField] as string,
          noticeText,
        };
      } else if (operation === "art12_hmac_log") {
        const fieldValue = item[inputField];
        const text = typeof fieldValue === "string" ? fieldValue : fieldValue == null ? "" : String(fieldValue);
        const previous = item.previousRecordHash;
        stepInput = {
          operation,
          hmacSecret: signingSecret,
          systemName,
          rawInputText: text,
          previousRecordHash: typeof previous === "string" ? previous : undefined,
        };
      } else if (operation === "art14_ask_human") {
        const channelName = String(this.getNodeParameter("channel", i, "slack"));
        stepInput = {
          operation,
          hmacSecret: signingSecret,
          systemName,
          actionName: String(this.getNodeParameter("actionName", i, "workflow.action")),
          actionSummary: String(this.getNodeParameter("actionSummary", i, "Human approval requested")),
          callbackBaseUrl: String(this.getNodeParameter("callbackBaseUrl", i, "")),
          channel: buildChannel(channelName, String(this.getNodeParameter("approverTarget", i, "")), credentials, {
            emailFrom: String(this.getNodeParameter("emailFrom", i, "")),
            jiraBaseUrl: String(this.getNodeParameter("jiraBaseUrl", i, "")),
            jiraEmail: String(this.getNodeParameter("jiraEmail", i, "")),
          }),
        };
      } else {
        throw new Error(`Unknown Spurvik operation: ${operation}`);
      }

      stepInput.consoleApiKey = consoleApiKey;
      stepInput.consoleBaseUrl = consoleBaseUrl;

      const result = await executeSpurvikWorkflowStep(stepInput);
      const json: IDataObject = { spurvik: result as unknown as IDataObject };
      const passThrough = String(this.getNodeParameter("passThroughFields", i, ""));
      for (const field of passThrough.split(",").map((part) => part.trim()).filter(Boolean)) {
        if (skipPassThroughField(field, inputField)) continue;
        if (Object.prototype.hasOwnProperty.call(item, field)) json[field] = item[field];
      }
      returnData.push({ json });
    }
    return [returnData];
  }
}
