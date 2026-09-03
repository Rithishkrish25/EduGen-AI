"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AiConversation,
  AiMessage,
  ApiError,
  askSubjectQuestion,
  AskMode,
  deleteConversation,
  getConversation,
  listConversations,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const QUICK_MODES: Array<{ mode: AskMode; label: string }> = [
  { mode: "explain_simple", label: "Explain Simply" },
  { mode: "example", label: "Give Example" },
  { mode: "two_mark", label: "2 Mark Answer" },
  { mode: "five_mark", label: "5 Mark Answer" },
  { mode: "sixteen_mark", label: "16 Mark Answer" },
  { mode: "tamil", label: "Tamil" },
  { mode: "tanglish", label: "Tanglish" },
];

interface AskPanelProps {
  subjectId: string;
}

export default function AskPanel({ subjectId }: AskPanelProps) {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);

  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<AskMode>("normal");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [conversationsRefreshKey, setConversationsRefreshKey] = useState(0);

  function refetchConversations() {
    setConversationsLoading(true);
    setConversationsRefreshKey((key) => key + 1);
  }

  useEffect(() => {
    let active = true;

    listConversations({ subjectId })
      .then((data) => {
        if (active) setConversations(data.items);
      })
      .catch(() => {
        if (active) setConversations([]);
      })
      .finally(() => {
        if (active) setConversationsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [subjectId, conversationsRefreshKey]);

  async function openConversation(conversationId: string) {
    setError("");
    try {
      const data = await getConversation(conversationId);
      setActiveConversationId(data.conversation.id);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load conversation");
    }
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setError("");
  }

  async function handleDeleteConversation(conversationId: string) {
    try {
      await deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        startNewConversation();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete conversation");
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!question.trim()) {
      setError("Please enter a question");
      return;
    }

    const askedQuestion = question.trim();
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        conversation_id: activeConversationId ?? "",
        role: "user",
        content: askedQuestion,
        citations: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setQuestion("");

    try {
      const result = await askSubjectQuestion(subjectId, {
        question: askedQuestion,
        conversationId: activeConversationId ?? undefined,
        mode,
      });

      setActiveConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-assistant`,
          conversation_id: result.conversationId,
          role: "assistant",
          content: result.answer,
          citations: result.insufficientMaterial ? null : result.citations,
          created_at: new Date().toISOString(),
        },
      ]);
      refetchConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get an answer");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:items-start">
      <div className="rounded-lg border border-border bg-surface-muted p-3 lg:col-span-1 lg:sticky lg:top-20">
        <button
          type="button"
          onClick={startNewConversation}
          className="mb-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + New Conversation
        </button>
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Conversation History
        </h3>
        <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
          {conversationsLoading ? (
            <p className="px-1 text-sm text-muted">Loading...</p>
          ) : conversations.length === 0 ? (
            <p className="px-1 text-xs text-muted">No previous conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group flex items-center justify-between rounded-md border p-2 text-xs transition-colors ${
                  activeConversationId === conversation.id
                    ? "border-primary bg-background"
                    : "border-transparent bg-background hover:border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => openConversation(conversation.id)}
                  className="flex-1 truncate text-left"
                >
                  <span className="block truncate font-medium text-foreground">
                    {conversation.title || "Untitled conversation"}
                  </span>
                  <span className="text-[11px] text-muted">
                    {formatDateTime(conversation.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteConversation(conversation.id)}
                  className="ml-2 shrink-0 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                  aria-label="Delete conversation"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-3">
        <div className="flex min-h-[240px] flex-col gap-5 rounded-lg border border-border bg-background p-5">
          {messages.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-foreground">Ask your study assistant</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Questions are answered strictly from this subject&apos;s approved materials, with
                citations back to the source.
              </p>
            </div>
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    Q
                  </span>
                  <p className="whitespace-pre-wrap text-sm font-medium text-foreground">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                    A
                  </span>
                  <div className="min-w-0 flex-1 border-l-2 border-border pl-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {message.content}
                    </p>
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-3">
                        <ul className="flex flex-col gap-1.5">
                          {message.citations.map((citation, index) => (
                            <li
                              key={`${citation.documentId}-${index}`}
                              className="rounded-md border border-border bg-surface-muted px-2.5 py-1.5 text-xs text-muted"
                            >
                              <span className="font-medium text-foreground">[{index + 1}]</span>{" "}
                              {citation.documentName}
                              {citation.pageNumber ? ` (page ${citation.pageNumber})` : ""}
                              {citation.slideNumber ? ` (slide ${citation.slideNumber})` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )
            )
          )}
        </div>

        <form
          onSubmit={handleSend}
          noValidate
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4"
        >
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Answer Style
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_MODES.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => setMode(option.mode)}
                  aria-pressed={mode === option.mode}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    mode === option.mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
              {mode !== "normal" && (
                <button
                  type="button"
                  onClick={() => setMode("normal")}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type your question..."
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div>
            <button
              type="submit"
              disabled={sending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {sending ? "Thinking..." : "Ask"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
