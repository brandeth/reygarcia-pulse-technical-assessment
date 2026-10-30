"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Short-lived notices ("Request declined.", "Camera unavailable.").
// Each toast owns its own timer, so a new toast never cuts an older one
// short, and an old timer never clears a newer toast.

type ToastVariant = "info" | "error";

interface Toast {
  id: number;
  text: string;
  variant: ToastVariant;
  leaving: boolean;
}

const SHOW_MS = 3500;
const EXIT_MS = 200; // matches --animate-toast-out
const MAX_VISIBLE = 3;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Play the exit animation, then drop the toast.
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    setToasts((all) =>
      all.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setToasts((all) => all.filter((t) => t.id !== id));
      }, EXIT_MS),
    );
  }, []);

  // `sticky` toasts stay until dismissed (used for "Session expired").
  const toast = useCallback(
    (
      text: string,
      { variant = "info", sticky = false }: { variant?: ToastVariant; sticky?: boolean } = {},
    ) => {
      const id = nextId.current++;
      // Keep the newest few; anything pushed out just disappears.
      setToasts((all) =>
        [...all, { id, text, variant, leaving: false }].slice(-MAX_VISIBLE),
      );
      if (!sticky) timers.current.set(id, setTimeout(() => dismiss(id), SHOW_MS));
    },
    [dismiss],
  );

  // Don't let pending timers fire after the page unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { toasts, toast };
}

export function Toaster({ toasts }: { toasts: Toast[] }) {
  return (
    // Always mounted so screen readers pick up each new toast;
    // pointer-events-none so toasts never block the map.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-[calc(4.5rem+var(--safe-top))] z-40 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex max-w-sm items-center gap-2 rounded-full border bg-glass px-4 py-2 text-sm text-fg shadow-panel backdrop-blur-glass motion-reduce:animate-none ${
            t.variant === "error" ? "border-danger/40" : "border-line"
          } ${t.leaving ? "animate-toast-out" : "animate-toast-in"}`}
        >
          {t.variant === "error" && (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
          )}
          {t.text}
        </div>
      ))}
    </div>
  );
}
