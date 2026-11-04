import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, wrapLanguageModel, type UIMessage } from "ai";
import { after } from "next/server";
import { provenanceFromMetadata, spurvikMiddleware, type SpurvikMiddleware } from "spurvik/ai";
import { spurvikConfig } from "@/lib/spurvik-config";

export const runtime = "nodejs";

let middleware: SpurvikMiddleware | undefined;

function spurvik(): SpurvikMiddleware {
  middleware ??= spurvikMiddleware(spurvikConfig());
  return middleware;
}

function openAiKey(): string | undefined {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value || value === "your-key-here") return undefined;
  return value;
}

/**
 * Chat route adapted from the earlier `runGuardedAssistant` snippet.
 * That snippet called `generateText`. This route calls `streamText` so the page
 * can show the reply as it arrives. The wrap is the same: `spurvikMiddleware`
 * passed to `wrapLanguageModel`. The middleware records the call and attaches
 * an HMAC receipt on provider metadata. It does not mark the reply.
 */
export async function POST(req: Request) {
  if (!openAiKey()) {
    return new Response("Set OPENAI_API_KEY in .env.local before sending a message.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const body = (await req.json()) as { messages?: UIMessage[] };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Send a message.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const model = wrapLanguageModel({
    model: openai("gpt-4o-mini"),
    middleware: spurvik(),
  });

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
    onEnd(event) {
      const record = provenanceFromMetadata(event.finalStep.providerMetadata);
      if (record) console.info("Spurvik receipt id:", record.eventId);
    },
  });

  after(() => spurvik().flush());

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
