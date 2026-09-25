"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Where this sits and why.
 *
 * The portal already owns the bottom-right corner: the landing page has
 * `.ref-floating-call` (bottom 20px, z 480) and citizen pages have `AgentFab`
 * (bottom var(--space-xl), z 40). A chat launcher dropped into the same corner
 * would sit on top of the 16699 call button, which is the single most important
 * action on the site.
 *
 * So the chat launcher is stacked directly ABOVE the call button and the panel
 * opens above both. The call button is untouched — it keeps its exact position,
 * label and behaviour — so nothing about the tested voice path changes.
 *
 * Offsets are fixed px rather than derived from the call button, because the two
 * live in different CSS systems (portal.css vs inline styles) and a shared token
 * would couple them. 84px clears a 52px pill sitting 20px off the bottom edge.
 */

const FAB_BOTTOM_PX = 84;
const PANEL_BOTTOM_PX = 148;

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "আইনি সহায়তার জন্য কী কী ডকুমেন্ট লাগে?",
  "কোনো সমস্যায় কীভাবে আবেদন করব?",
  "আমার ডকেট নম্বর কীভাবে ট্র্যাক করব?",
];

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border border-border bg-muted text-foreground"
        }`}
      >
        {turn.content}
      </div>
    </div>
  );
}

export function UniversalChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");

  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const openedAtRef = useRef<number>(0);
  const cacheOpenedAtRef = useRef<number>(0);
  const titleId = useId();
  const logId = useId();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, busy, open]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const history = turns
        .filter((turn) => turn.id !== "pending")
        .slice(-6)
        .map((turn) => ({ role: turn.role, content: turn.content }));

      setTurns((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: question },
        { id: "pending", role: "assistant", content: "" },
      ]);
      setDraft("");
      setError("");
      setBusy(true);

      // Open the retention window on the first question, then at most once every
      // four minutes. Re-sending a ttl re-bills the cache write premium, so
      // ordinary turns must omit it and pay the cache-read rate.
      const now = Date.now();
      const openCache =
        cacheOpenedAtRef.current === 0 || now - cacheOpenedAtRef.current > 4 * 60 * 1000;
      if (openCache) cacheOpenedAtRef.current = now;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: question, conversationId, history, openCache }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          answer?: string;
          error?: string;
          conversationId?: string;
        };
        if (!response.ok || !payload.ok || !payload.answer) {
          throw new Error(payload.error || "উত্তর দেওয়া যায়নি");
        }
        if (payload.conversationId) setConversationId(payload.conversationId);
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === "pending"
              ? { ...turn, id: `a-${Date.now()}`, content: payload.answer || "" }
              : turn,
          ),
        );
      } catch (cause) {
        setTurns((prev) => prev.filter((turn) => turn.id !== "pending"));
        setError(cause instanceof Error ? cause.message : "উত্তর দেওয়া যায়নি");
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, turns],
  );

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next) openedAtRef.current = Date.now();
      else fabRef.current?.focus();
      return next;
    });
  }

  const showWelcome = turns.length === 0;

  return (
    <>
      {/* Launcher: stacked above the 16699 call button. */}
      <button
        ref={fabRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? "universal-chat-panel" : undefined}
        aria-label={open ? "সহায়ক বন্ধ করুন" : "আইনি সহায়তা সহায়ক খুলুন"}
        data-testid="chat-fab"
        style={{
          position: "fixed",
          right: 20,
          bottom: FAB_BOTTOM_PX,
          zIndex: 481,
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          padding: "8px 15px",
          border: "2px solid var(--portal-accent)",
          borderRadius: 22,
          background: "var(--portal-surface, #fff)",
          color: "var(--portal-accent)",
          fontFamily: "var(--font-bn)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <Bot aria-hidden="true" style={{ width: 18, height: 18 }} />
        আইনি সহায়তা
      </button>

      {open ? (
        <div
          ref={panelRef}
          id="universal-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          data-testid="chat-panel"
          style={{
            position: "fixed",
            right: 20,
            bottom: PANEL_BOTTOM_PX,
            zIndex: 482,
            display: "flex",
            flexDirection: "column",
            width: "min(380px, calc(100vw - 32px))",
            height: "min(560px, calc(100dvh - 200px))",
            border: "1px solid var(--portal-border, #e2e8f0)",
            borderRadius: 16,
            background: "var(--portal-surface, #fff)",
            boxShadow: "0 18px 50px rgba(15, 23, 42, 0.22)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 12px",
              borderBottom: "1px solid var(--portal-border, #e2e8f0)",
              background: "var(--portal-accent)",
              color: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Bot aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span id={titleId} style={{ fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: 14 }}>
                আইনি সহায়তা সহায়ক
              </span>
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-label="সহায়ক বন্ধ করুন"
              style={{ display: "inline-flex", background: "transparent", border: 0, color: "#fff", cursor: "pointer", padding: 4 }}
            >
              <X aria-hidden="true" style={{ width: 18, height: 18 }} />
            </button>
          </div>

          <div
            ref={logRef}
            id={logId}
            role="log"
            aria-live="polite"
            aria-label="সহায়কের উত্তর"
            style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
          >
            {showWelcome ? (
              <div style={{ fontFamily: "var(--font-bn)", fontSize: 13, lineHeight: 1.7, color: "var(--portal-text-secondary)" }}>
                <p style={{ margin: "0 0 8px" }}>
                  স্বাগতম। আইনি সহায়তা, আবেদন ও ডকেট সম্পর্কে সংক্ষেপে জানতে চাইলে লিখুন। জটিল মামলার চূড়ান্ত সিদ্ধান্তের জন্য ১৬৬৯৯ এ কল করুন।
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "1px solid var(--portal-border, #e2e8f0)",
                        borderRadius: 10,
                        background: "transparent",
                        color: "var(--portal-accent)",
                        fontFamily: "var(--font-bn)",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.map((turn) => (
              <Bubble key={turn.id} turn={turn} />
            ))}

            {busy ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                ভাবছি…
              </div>
            ) : null}

            {error ? (
              <p role="alert" style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>
                {error}
              </p>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
            style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--portal-border, #e2e8f0)" }}
          >
            <label htmlFor={`${logId}-input`} className="sr-only">
              আপনার প্রশ্ন
            </label>
            <input
              id={`${logId}-input`}
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="প্রশ্ন লিখুন…"
              maxLength={800}
              style={{
                flex: 1,
                minWidth: 0,
                height: 40,
                padding: "0 10px",
                border: "1px solid var(--portal-border, #e2e8f0)",
                borderRadius: 10,
                fontFamily: "var(--font-bn)",
                fontSize: 14,
              }}
            />
            <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="প্রশ্ন পাঠান">
              <Send aria-hidden="true" />
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
