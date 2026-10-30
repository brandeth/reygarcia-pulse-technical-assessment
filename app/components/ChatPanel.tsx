"use client";

import { useEffect, useRef, useState } from "react";
import Button from "./Button";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

// The conversation. On phones it's a bottom sheet that leaves the top of the
// map (and your place on it) in view; from md up it floats as a glass panel
// on the right, under the header.
export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section
      aria-label="Chat with a stranger"
      className="absolute inset-x-0 bottom-0 z-20 flex h-[72dvh] animate-card-in flex-col rounded-t-panel border-t border-line bg-surface/90 text-fg shadow-panel backdrop-blur-glass motion-reduce:animate-none md:inset-x-auto md:top-[calc(4.5rem+var(--safe-top))] md:right-[calc(1rem+var(--safe-right))] md:bottom-4 md:h-auto md:w-96 md:rounded-panel md:border"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        {/* The stranger, drawn like their dot on the map. */}
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 ring-1 ring-accent/30"
        >
          <span className="size-2.5 rounded-full bg-accent shadow-glow" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display leading-tight font-semibold">Stranger</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            {connected ? (
              <>
                {/* Green = live / connected (amber is for things you tap). */}
                <span aria-hidden className="size-1.5 rounded-full bg-live" />
                Connected
              </>
            ) : (
              "Connecting…"
            )}
          </p>
        </div>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Start video call"
          title="Start video call"
          onClick={onStartVideo}
          disabled={!connected || videoBusy}
        >
          <VideoIcon />
        </Button>
        <Button variant="danger" size="sm" onClick={onEnd}>
          End
        </Button>
      </header>

      {/* role="log" announces new messages to screen readers. */}
      <div role="log" className="flex-1 overflow-y-auto px-4 py-3">
        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted">
          <LockIcon />
          {connected
            ? "Peer-to-peer: messages go straight to them, never stored"
            : "Setting up a private connection…"}
        </p>
        {connected && messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted">Say hello.</p>
        )}
        {messages.map((m, i) => {
          // Consecutive messages from the same side group into one block:
          // tight spacing, and the corners between them flatten.
          const first = i === 0 || messages[i - 1].mine !== m.mine;
          const last = i === messages.length - 1 || messages[i + 1].mine !== m.mine;
          const shape = m.mine
            ? `${first ? "" : "rounded-tr-md"} ${last ? "" : "rounded-br-md"}`
            : `${first ? "" : "rounded-tl-md"} ${last ? "" : "rounded-bl-md"}`;
          return (
            <div
              key={m.id}
              className={`flex ${m.mine ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-0.5"}`}
            >
              <p
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] ${shape} ${
                  m.mine
                    ? "bg-accent text-on-accent"
                    : "border border-line bg-white/5 text-fg"
                }`}
              >
                {m.text}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-line p-3 pb-[calc(0.75rem+var(--safe-bottom))]"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Message" : "Connecting…"}
          aria-label="Message"
          disabled={!connected}
          enterKeyHint="send"
          // 16px on phones: iOS zooms the page into inputs smaller than that.
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-ink/60 px-4 text-base text-fg outline-none placeholder:text-muted focus:border-accent/60 disabled:opacity-50 md:text-sm"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          disabled={!connected || !draft.trim()}
        >
          <SendIcon />
        </Button>
      </form>
    </section>
  );
}

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

function VideoIcon() {
  return (
    <svg {...iconProps} width="18" height="18">
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg {...iconProps} width="18" height="18">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...iconProps} width="12" height="12">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
