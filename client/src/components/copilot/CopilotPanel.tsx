// Flo (Ops Copilot) — embedded slide-over panel.
//
// A Sidekick-style assistant: open with the floating button or Cmd/Ctrl-K.
// Streams answers over SSE from POST /api/copilot/message. Actions arrive as
// proposals rendered as Confirm cards; nothing runs until the user confirms,
// and then it runs through the app's normal endpoints with their session.
// The conversation is kept per store in this browser.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, X, Loader2, Sparkles, SquarePen, Square } from "lucide-react";
import { useActiveStore } from "@/hooks/use-store";
import { getCopilotFocus } from "@/lib/copilot-focus";
import { CopilotMarkdown } from "./CopilotMarkdown";
import { ActionCard } from "./ActionCard";
import { type ActionCardData, executeProposal, isProposal, outcomeLine } from "./actions";
import { queryClient, getActiveStoreId } from "@/lib/queryClient";

type Role = "user" | "assistant";
interface Msg {
  role: Role;
  content: string;
  /** Action proposals Flo made in this reply. */
  actions?: ActionCardData[];
}

const STORE_HEADER_NAME = "X-Active-Store-Id";
const MAX_SAVED_MESSAGES = 40;
const storageKey = (storeId: string | null) => `copilot:chat:${storeId ?? "none"}`;

function loadChat(storeId: string | null): Msg[] {
  try {
    const raw = localStorage.getItem(storageKey(storeId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(Array.isArray(m.actions)
          ? {
              actions: m.actions
                .filter(isProposal)
                // A reload mid-run can't know the outcome; don't leave it spinning.
                .map((a: ActionCardData) => (a.state === "running" ? { ...a, state: "failed", outcome: "Interrupted — check the order before retrying." } : a)),
            }
          : {}),
      }));
  } catch {
    return [];
  }
}

function saveChat(storeId: string | null, messages: Msg[]) {
  try {
    if (messages.length === 0) localStorage.removeItem(storageKey(storeId));
    else localStorage.setItem(storageKey(storeId), JSON.stringify(messages.slice(-MAX_SAVED_MESSAGES)));
  } catch {
    // Storage unavailable (private mode, quota) — chat just won't persist.
  }
}

const STARTERS = [
  "Give me a quick ops check-in for today",
  "Any stuck orders?",
  "What's our delivery rate last month?",
  "Who isn't clocked in today?",
  "Which states have the worst RTO this month?",
];

export default function CopilotPanel() {
  const { activeStoreId, activeStore } = useActiveStore();
  const storeLabel = activeStore?.storeName ?? null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => loadChat(activeStoreId));
  // Store the current `messages` belong to. Kept in state (not read from
  // activeStoreId) so a store switch never saves one store's chat under
  // the other's key during the render where the two disagree.
  const [chatStore, setChatStore] = useState<string | null>(activeStoreId);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Set when we abort because the chat is being replaced (store switch /
  // new chat), so the in-flight reply doesn't write "(stopped)" into it.
  const discardRef = useRef(false);
  const abortAndDiscard = () => {
    if (abortRef.current) {
      discardRef.current = true;
      abortRef.current.abort();
    }
  };

  // Each store has its own conversation. A null activeStoreId is a
  // transient boot/login state (stores still loading), not a real store:
  // ignore it, and when the first real store arrives adopt the current
  // chat unless that store already has a saved one.
  useEffect(() => {
    if (!activeStoreId || activeStoreId === chatStore) return;
    const saved = loadChat(activeStoreId);
    if (chatStore === null) {
      setChatStore(activeStoreId);
      if (saved.length) {
        abortAndDiscard();
        setMessages(saved);
      }
      return;
    }
    abortAndDiscard();
    setChatStore(activeStoreId);
    setMessages(saved);
    setError(null);
  }, [activeStoreId, chatStore]);

  // Persist once a reply has finished (not on every streamed token), and
  // only once we know which store the chat belongs to.
  useEffect(() => {
    if (!pending && chatStore) saveChat(chatStore, messages);
  }, [messages, pending, chatStore]);

  // Toggle with Cmd/Ctrl-K; close with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, toolStatus, pending, open]);

  const newChat = () => {
    abortAndDiscard();
    setMessages([]);
    setError(null);
  };

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || pending) return;
      // Flo answers for exactly one store. Never send without it: the server
      // refuses, rather than guessing a store.
      const storeForRequest = activeStoreId ?? getActiveStoreId();
      if (!storeForRequest) {
        setError("Pick a store in the sidebar first.");
        return;
      }
      setError(null);
      const history: Msg[] = [...messages, { role: "user", content: q }];
      // Append an empty assistant turn we stream into.
      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");
      setPending(true);
      setToolStatus("Thinking…");
      let runningTools = 0;
      // Text resumed after a tool call starts a new paragraph.
      let sawText = false;
      let breakBeforeText = false;

      const appendToAssistant = (delta: string) =>
        setMessages((prev) => {
          const next = prev.slice();
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + delta };
          }
          return next;
        });

      const focus = getCopilotFocus();
      const pageContext =
        `page: ${window.location.pathname}` +
        (focus.open
          ? `; open record: ${focus.open}`
          : focus.recent
            ? `; no record open now, most recently viewed: ${focus.recent}`
            : "");

      const controller = new AbortController();
      abortRef.current = controller;
      discardRef.current = false;
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          [STORE_HEADER_NAME]: storeForRequest,
        };
        const res = await fetch("/api/copilot/message", {
          method: "POST",
          headers,
          credentials: "include",
          signal: controller.signal,
          // Only send completed turns; drop empty/failed assistant replies.
          body: JSON.stringify({
            history: history.filter((m) => m.content.trim()).map(({ role, content }) => ({ role, content })),
            pageContext,
          }),
        });
        if (!res.ok || !res.body) {
          const raw = await res.text().catch(() => "");
          let msg = raw;
          try {
            msg = JSON.parse(raw)?.error ?? raw;
          } catch {
            // not JSON
          }
          throw new Error(msg || `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            let ev: any;
            try {
              ev = JSON.parse(json);
            } catch {
              continue;
            }
            if (ev.type === "text") {
              setToolStatus(null);
              appendToAssistant(breakBeforeText ? `

${ev.delta}` : ev.delta);
              breakBeforeText = false;
              sawText = true;
            } else if (ev.type === "tool") {
              if (sawText) breakBeforeText = true;
              runningTools++;
              setToolStatus(ev.summary);
            } else if (ev.type === "tool_done") {
              runningTools = Math.max(0, runningTools - 1);
              if (runningTools === 0) setToolStatus("Writing answer…");
            }
            else if (ev.type === "action" && isProposal(ev.proposal)) {
              const card: ActionCardData = { ...ev.proposal, state: "pending" };
              setMessages((prev) => {
                const next = prev.slice();
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { ...last, actions: [...(last.actions ?? []), card] };
                }
                return next;
              });
            }
            else if (ev.type === "error") {
              setError(ev.message);
              appendToAssistant(`\n\n⚠️ ${ev.message}`);
            } else if (ev.type === "done") setToolStatus(null);
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          if (!discardRef.current) appendToAssistant("\n\n_(stopped)_");
        } else {
          setError(e?.message ?? "Something went wrong");
          appendToAssistant(`\n\n⚠️ ${e?.message ?? "Something went wrong"}`);
        }
      } finally {
        setPending(false);
        setToolStatus(null);
        abortRef.current = null;
      }
    },
    [messages, pending, activeStoreId],
  );

  const updateCard = (msgIndex: number, id: string, patch: Partial<ActionCardData>, note?: string) =>
    setMessages((prev) => {
      const next = prev.slice();
      const m = next[msgIndex];
      if (!m?.actions) return prev;
      next[msgIndex] = {
        ...m,
        // The outcome line goes into the message text so the next turn of the
        // conversation (which only sends text) knows what happened.
        content: note ? `${m.content}\n\n${note}` : m.content,
        actions: m.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      };
      return next;
    });

  const confirmAction = async (msgIndex: number, card: ActionCardData) => {
    if (runningAction) return;
    setRunningAction(card.id);
    updateCard(msgIndex, card.id, { state: "running" });
    const r = await executeProposal(card, activeStoreId);
    updateCard(msgIndex, card.id, { state: r.state, outcome: r.outcome }, outcomeLine(card, r.state, r.outcome));
    setRunningAction(null);
    // Refresh whatever page is open so it reflects the change.
    void queryClient.invalidateQueries();
    // Audit trail (best effort).
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (activeStoreId) headers[STORE_HEADER_NAME] = activeStoreId;
    void fetch("/api/copilot/action-log", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        proposalId: card.id, action: card.action, title: card.title, ok: r.state === "done",
        error: r.state === "done" ? null : r.outcome, durationMs: r.ms,
        steps: r.steps.map((s) => ({ path: s.path, status: s.status, ok: s.ok, error: s.error })),
      }),
    }).catch(() => {});
  };

  const dismissAction = (msgIndex: number, card: ActionCardData) =>
    updateCard(msgIndex, card.id, { state: "dismissed" }, outcomeLine(card, "dismissed", ""));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask Flo (Ctrl/Cmd+K)"
          className="pointer-events-auto fixed bottom-5 right-5 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
          aria-label="Open Flo"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      {/* Slide-over */}
      {open && (
        <div data-flo-panel className="pointer-events-auto fixed inset-0 z-[60] flex justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Flo</div>
                  <div className="text-[11px] text-muted-foreground" data-flo-store={storeLabel ?? ""}>
                    {storeLabel ? `${storeLabel} only` : "OrderFlow assistant"} · actions need your OK
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={newChat}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="New chat"
                    title="New chat"
                  >
                    <SquarePen className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Hi, I'm Flo. {storeLabel ? `I'm looking at ${storeLabel} only. ` : ""}Ask me about orders, NDRs, delivery, sales, products, stuck orders, your team, payroll or integrations.
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => {
                const hideBubble = m.role === "assistant" && !m.content && pending && !!toolStatus;
                if (hideBubble && !m.actions?.length) return null;
                return (
                  <div
                    key={i}
                    className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start"}
                  >
                    {!hideBubble && (
                      <div
                        className={
                          m.role === "user"
                            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                            : "max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground"
                        }
                      >
                        {m.role === "assistant"
                          ? (m.content ? <CopilotMarkdown text={m.content} /> : pending ? (toolStatus ? null : "…") : "")
                          : m.content}
                      </div>
                    )}
                    {m.actions?.map((card) => (
                      <ActionCard
                        key={card.id}
                        card={card}
                        busy={!!runningAction}
                        onConfirm={() => confirmAction(i, card)}
                        onDismiss={() => dismissAction(i, card)}
                      />
                    ))}
                  </div>
                );
              })}

              {toolStatus && (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {toolStatus}
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} className="border-t border-border p-3">
              {error && <div className="mb-2 px-1 text-xs text-destructive">{error}</div>}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder="Ask Flo…"
                  rows={1}
                  disabled={pending}
                  className="max-h-32 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
                {pending ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-muted"
                    aria-label="Stop"
                    title="Stop"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
