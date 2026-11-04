import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, wrapLanguageModel, type UIMessage } from "ai";
import { after } from "next/server";
import { provenanceFromMetadata, spurvikMiddleware, type SpurvikMiddleware } from "spurvik/ai";
import { missingSpurvikMessage, spurvikConfig } from "@/lib/spurvik-config";

export const runtime = "nodejs";

let middleware: SpurvikMiddleware | undefined;

function spurvik(): SpurvikMiddleware {
  middleware ??= spurvikMiddleware(spurvikConfig());
  return middleware;
}

function plain(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
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
 * passed to `wrapLanguageModel`. With content-hash mode `keyed`, the middleware
 * records a keyed HMAC-SHA256 fingerprint of the input on the HMAC receipt
 * attached to provider metadata. It does not mark the reply.
 */
export async function POST(req: Request) {
  if (!openAiKey()) {
    return plain("Set OPENAI_API_KEY in .env.local before sending a message.", 400);
  }

  const spurvikMessage = missingSpurvikMessage();
  if (spurvikMessage) {
    return plain(spurvikMessage, 400);
  }

  const body = (await req.json()) as { messages?: UIMessage[] };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return plain("Send a message.", 400);
  }

  let model: ReturnType<typeof wrapLanguageModel>;
  try {
    model = wrapLanguageModel({
      model: openai("gpt-4o-mini"),
      middleware: spurvik(),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The Spurvik settings were rejected.";
    return plain(detail, 400);
  }

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
