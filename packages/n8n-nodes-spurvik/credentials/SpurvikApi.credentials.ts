import type {
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

const password = {
  type: "string" as const,
  typeOptions: { password: true },
  default: "",
};

export class SpurvikApi implements ICredentialType {
  name = "spurvikApi";
  displayName = "Spurvik";
  documentationUrl = "https://github.com/spurvik/spurvik/blob/main/packages/n8n-nodes-spurvik/README.md";
  properties: INodeProperties[] = [
    {
      displayName: "Signing Secret",
      name: "signingSecret",
      ...password,
      required: true,
      description: "HMAC secret of at least 16 characters, with no leading or trailing whitespace.",
    },
    {
      displayName: "Slack Webhook URL",
      name: "slackWebhookUrl",
      ...password,
      description: "Incoming webhook for the Slack channel.",
    },
    {
      displayName: "Telegram Bot Token",
      name: "telegramBotToken",
      ...password,
    },
    {
      displayName: "Resend API Key",
      name: "resendApiKey",
      ...password,
      description: "Token for Email via Resend.",
    },
    {
      displayName: "Discord Webhook URL",
      name: "discordWebhookUrl",
      ...password,
    },
    {
      displayName: "Microsoft Teams Webhook URL",
      name: "teamsWebhookUrl",
      ...password,
    },
    {
      displayName: "Linear API Key",
      name: "linearApiKey",
      ...password,
    },
    {
      displayName: "Jira API Token",
      name: "jiraApiToken",
      ...password,
    },
    {
      displayName: "Monday.com API Token",
      name: "mondayApiToken",
      ...password,
      description: "Monday.com only creates a board item. It does not send Approve or Block links.",
    },
    {
      displayName: "Asana Access Token",
      name: "asanaAccessToken",
      ...password,
    },
  ];
}
