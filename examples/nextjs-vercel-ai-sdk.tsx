import React from "react";
import { wrapLanguageModel, generateText } from "ai";
import { spurvikMiddleware } from "spurvik/ai";
import { AIDisclosureLabel } from "spurvik/react";

/**
 * 1. Server-side: Wrap any Vercel AI SDK LanguageModel with `spurvikMiddleware`
 *    to emit chained HMAC-SHA256 provenance receipts with 0 raw prompt bytes stored.
 */
export async function runGuardedAssistant(baseModel: any, userPrompt: string) {
  const model = wrapLanguageModel({
    model: baseModel,
    middleware: spurvikMiddleware({
      signingSecret: process.env.SPURVIK_HMAC_SECRET!,
      apiKey: process.env.SPURVIK_API_KEY,
      baseUrl: "https://console.spurvik.com",
      riskTier: "limited_art50",
    }),
  });

  const { text } = await generateText({
    model,
    prompt: userPrompt,
  });

  return text;
}

/**
 * 2. Client-side: Render an EU AI Act Art. 50(1) AI interaction notice badge
 *    in all 24 EU languages.
 */
export function AssistantChatHeader({ locale = "en" }: { locale?: string }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <AIDisclosureLabel
        notice="interaction"
        presentation="inline"
        locale={locale}
        euIcon
      />
    </header>
  );
}
