"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import Button from "./Button";

type Corner = "tl" | "tr" | "bl" | "br";

const CORNER_CLASS: Record<Corner, string> = {
  tl: "top-4 left-4",
  tr: "top-4 right-4",
  bl: "bottom-24 left-4",
  br: "bottom-24 right-4",
};

// The video call. From md up it fills the map area and the chat panel stays
// beside it; on phones it's full screen, and "Chat" shrinks it to a small
// floating tile so the chat sheet underneath is usable.
export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [minimized, setMinimized] = useState(false);
  // Your own preview snaps to a corner; while dragging it follows the pointer.
  const [corner, setCorner] = useState<Corner>("br");
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [snaps, setSnaps] = useState(0); // bumps on every drop, even onto the same corner
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const dropRect = useRef<DOMRect | null>(null);

  // Re-attach on every render: the <video> elements unmount and remount when
  // the panel is minimized or restored.
  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  });

  // Mute / camera-off just disable the outgoing track: the other side keeps
  // the connection and receives silence or black frames, no renegotiation.
  function toggle(kind: "audio" | "video") {
    const tracks =
      kind === "audio" ? localStream?.getAudioTracks() : localStream?.getVideoTracks();
    const next = kind === "audio" ? !micOn : !camOn;
    tracks?.forEach((t) => (t.enabled = next));
    if (kind === "audio") setMicOn(next);
    else setCamOn(next);
  }

  // Glide from where the preview was dropped into its corner (FLIP: corners
  // are top/bottom/left/right, which CSS can't animate between, so measure
  // the jump and animate a transform back to zero instead).
  useLayoutEffect(() => {
    const el = tileRef.current;
    const from = dropRect.current;
    if (!el || !from) return;
    dropRect.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect();
    el.style.transition = "none";
    el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    el.getBoundingClientRect(); // commit the start position before animating
    el.style.transition = "transform 300ms var(--ease-out-soft)";
    el.style.transform = "";
  }, [corner, snaps]);

  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.transition = "none";
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0 });
  }

  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    setDrag({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }

  // Snap to whichever corner of the call area the preview was dropped nearest.
  function onDragEnd(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    dragStart.current = null;
    const area = e.currentTarget.parentElement!.getBoundingClientRect();
    const tile = e.currentTarget.getBoundingClientRect();
    const right = tile.left + tile.width / 2 > area.left + area.width / 2;
    const bottom = tile.top + tile.height / 2 > area.top + area.height / 2;
    dropRect.current = tile;
    setDrag(null);
    setCorner(`${bottom ? "b" : "t"}${right ? "r" : "l"}` as Corner);
    setSnaps((n) => n + 1);
  }

  if (minimized) {
    // Phones only: the other person stays visible in a small tile above the
    // chat sheet; tapping it brings the call back.
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Back to video call"
        className="absolute top-[calc(4.5rem+var(--safe-top))] left-[calc(1rem+var(--safe-left))] z-30 h-36 w-24 animate-card-in overflow-hidden rounded-panel border border-line bg-surface shadow-panel motion-reduce:animate-none"
      >
        <video ref={remoteRef} autoPlay playsInline className="size-full object-cover" />
      </button>
    );
  }

  return (
    <section
      aria-label="Video call"
      className="absolute inset-0 z-30 animate-card-in overflow-hidden bg-ink motion-reduce:animate-none md:right-[25rem]"
    >
      {/* The other person, filling the call area. */}
      <video ref={remoteRef} autoPlay playsInline className="size-full object-cover" />
      {!remoteStream && (
        <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted">
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-muted/40 border-t-fg motion-reduce:animate-none"
          />
          Waiting for their video…
        </p>
      )}

      {/* You: mirrored like a mirror (what people expect of their own
          preview; the other side still sees you unflipped). Drag to any
          corner. */}
      <div
        ref={tileRef}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
        className={`absolute ${CORNER_CLASS[corner]} h-40 w-28 touch-none overflow-hidden rounded-panel border border-line bg-surface shadow-panel select-none md:h-52 md:w-36 ${
          drag ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={`size-full -scale-x-100 object-cover ${camOn ? "" : "invisible"}`}
        />
        {!camOn && (
          <span className="absolute inset-0 grid place-items-center text-xs text-muted">
            Camera off
          </span>
        )}
      </div>

      {/* Controls: a floating glass bar. Off states turn red, so a muted
          mic or hidden camera is never missed. */}
      <div className="absolute inset-x-0 bottom-[calc(1.25rem+var(--safe-bottom))] flex justify-center px-4">
        <div className="flex items-center gap-2 rounded-full border border-line bg-glass p-2 shadow-panel backdrop-blur-glass">
          <Button
            variant={micOn ? "secondary" : "danger"}
            size="icon"
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={!micOn}
            title={micOn ? "Mute" : "Unmute"}
            onClick={() => toggle("audio")}
          >
            {micOn ? <MicIcon /> : <MicOffIcon />}
          </Button>
          <Button
            variant={camOn ? "secondary" : "danger"}
            size="icon"
            aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            aria-pressed={!camOn}
            title={camOn ? "Camera off" : "Camera on"}
            onClick={() => toggle("video")}
          >
            {camOn ? <CamIcon /> : <CamOffIcon />}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Show chat"
            title="Chat"
            className="md:hidden"
            onClick={() => setMinimized(true)}
          >
            <ChatIcon />
          </Button>
          <Button variant="danger" size="md" onClick={onEnd}>
            End video
          </Button>
        </div>
      </div>
    </section>
  );
}

const iconProps = {
  "aria-hidden": true,
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5" />
      <path d="M5 11a7 7 0 0 0 11.9 5M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18" />
    </svg>
  );
}

function CamIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M15.5 13.5V8.5A2.5 2.5 0 0 0 13 6H9.5M5 6H5a2.5 2.5 0 0 0-2.5 2.5v7A2.5 2.5 0 0 0 5 18h8a2.5 2.5 0 0 0 2.4-1.8" />
      <path d="M15.5 10.5 21 7.5v9l-3-1.6M3 3l18 18" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
