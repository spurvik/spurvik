"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useState, type FormEvent } from "react";
import { AssistantChatHeader } from "./assistant-chat-header";

export default function Page() {
  const { messages, sendMessage, status, error } = useChat();
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setDraft("");
  }

  return (
    <main>
      <h1>Chat</h1>
      <header>
        <AssistantChatHeader />
      </header>
      <p className="intro">
        Assistant replies come from a model wrapped with Spurvik. The notice above stays on screen. The same notice
        is shown beside each assistant reply.
      </p>
      <ol className="thread">
        {messages.map((message) => (
          <li key={message.id} className="bubble">
            {message.role === "assistant" ? (
              <header>
                <AssistantChatHeader />
              </header>
            ) : (
              <div className="who">You</div>
            )}
            <p>{textOf(message)}</p>
          </li>
        ))}
      </ol>
      {error ? (
        <p className="alert" role="alert">
          {error.message}
        </p>
      ) : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="prompt">Message</label>
        <textarea
          id="prompt"
          name="prompt"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={busy || draft.trim().length === 0}>
          {busy ? "Waiting" : "Send"}
        </button>
      </form>
    </main>
  );
}

function textOf(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}
