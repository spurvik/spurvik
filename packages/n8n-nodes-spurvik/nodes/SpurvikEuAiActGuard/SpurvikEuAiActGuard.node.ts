import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import type { HumanApprovalChannelConfig } from "spurvik-sdk";
import {
  executeSpurvikWorkflowStep,
  type SpurvikWorkflowNodeInput,
  type SpurvikWorkflowOperation,
} from "../../workflow";

const PROMPT_FIELD_NAMES = new Set(["prompttext", "prompt", "chatinput", "query", "input"]);

const BLOCKED_PASSTHROUGH = new Set([
  ...PROMPT_FIELD_NAMES,
  "rawinputtext",
  "rawprompt",
  "signingsecret",
  "hmacsecret",
]);

function isPromptFieldName(name: string): boolean {
  return PROMPT_FIELD_NAMES.has(name.trim().toLowerCase());
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
  credentials: [{ name: "spurvikApi", required: true }],
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
          description: "Designed to support Article 12 record-keeping. The field value is not returned.",
        },
        {
          name: "Send an ask_human() approval request",
          value: "art14_ask_human",
          description: "Designed to support Article 14 human oversight.",
        },
      ],
    },
    {
      displayName: "AI System Name",
      name: "systemName",
      type: "string",
      default: "AI system",
      required: true,
    },
    {
      displayName: "Input Field",
      name: "inputField",
      type: "string",
      default: "promptText",
      displayOptions: { show: { operation: ["art50_disclosure", "art12_hmac_log"] } },
      description:
        "Name of the incoming JSON field that holds the prompt. Shown for the notice and the digest. The digest is HMAC-SHA256 of spurvik:workflow:input:v1| plus this field. The notice throws if outputField equals this name. The field value is not returned.",
    },
    {
      displayName: "Output Field",
      name: "outputField",
      type: "string",
      default: "outputText",
      displayOptions: { show: { operation: ["art50_disclosure"] } },
      description:
        "The notice operation reads outputField (default outputText) and inputField (default promptText). inputField is shown for the notice and the digest. It throws if outputField is missing or is not a string, if outputField equals inputField in any letter case, or if outputField matches promptText, prompt, chatInput, query, or input in any letter case. It does not read the prompt field. Output is { spurvik: result } plus explicitly named fields other than those prompt names. Those prompt names are never copied. The digest is HMAC-SHA256 of the prefix spurvik:workflow:input:v1| plus the input field.",
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
      displayName: "Pass-through Fields",
      name: "passThroughFields",
      type: "string",
      default: "",
      description:
        "Comma-separated names of incoming fields to copy beside the spurvik result. promptText, prompt, chatInput, query, and input are never copied, in any letter case.",
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
    const credentials = (await this.getCredentials("spurvikApi")) as Record<string, unknown>;
    const signingSecret = credentials?.signingSecret;
    if (typeof signingSecret !== "string" || signingSecret.length === 0) {
      throw new Error(
        "Missing Spurvik credential signingSecret. Set it on the spurvikApi credential. The node does not read environment variables.",
      );
    }
    if (signingSecret !== signingSecret.trim()) {
      throw new Error("Channel approval secret must not have leading or trailing whitespace.");
    }
    if (signingSecret.length < 16) {
      throw new Error("Channel approval secret must be at least 16 characters.");
    }

    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]?.json ?? {};
      const operation = String(this.getNodeParameter("operation", i, "art50_disclosure")) as SpurvikWorkflowOperation;
      const systemName = String(this.getNodeParameter("systemName", i, "AI system"));
      const inputField = String(this.getNodeParameter("inputField", i, "promptText"));

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

      const result = await executeSpurvikWorkflowStep(stepInput);
      const json: IDataObject = { spurvik: result as unknown as IDataObject };
      const passThrough = String(this.getNodeParameter("passThroughFields", i, ""));
      for (const field of passThrough.split(",").map((part) => part.trim()).filter(Boolean)) {
        if (BLOCKED_PASSTHROUGH.has(field.toLowerCase())) continue;
        if (Object.prototype.hasOwnProperty.call(item, field)) json[field] = item[field];
      }
      returnData.push({ json });
    }
    return [returnData];
  }
}
