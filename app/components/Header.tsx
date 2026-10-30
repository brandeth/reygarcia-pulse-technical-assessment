// Top bar over the live map: wordmark + how many strangers are online, and
// how many chats are live (the arcs on the map).
// pointer-events-none so the map still pans and zooms through the bar.
export default function Header({
  online,
  chats,
}: {
  online: number;
  chats: number;
}) {
  // `online` counts other people only (the poll excludes self), so the old
  // "0 online" read as if nobody was here, including you.
  const alone = online === 0;
  const label = alone
    ? "Just you right now"
    : `${online} ${online === 1 ? "stranger" : "strangers"} online`;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 pt-[calc(1rem+var(--safe-top))] pr-[calc(1rem+var(--safe-right))] pl-[calc(1rem+var(--safe-left))]">
      <span className="font-display text-xl font-bold tracking-tight text-fg drop-shadow">
        Pulse
      </span>

      <div className="flex items-center gap-2 rounded-full border border-line bg-glass px-3 py-1.5 text-xs font-medium text-fg shadow-panel backdrop-blur-glass">
        {/* Green + beating only when someone else is here to connect with;
            a still gray dot when you're alone. */}
        <span
          aria-hidden
          className={`size-2 rounded-full transition-colors duration-300 ${
            alone
              ? "bg-muted"
              : "animate-heartbeat bg-live shadow-live motion-reduce:animate-none"
          }`}
        />
        <span className="tabular-nums">{label}</span>
        {/* Secondary, so the online count still reads first. Only when
            someone is talking: "0 chats" is noise. */}
        {chats > 0 && (
          <span className="text-muted tabular-nums">
            <span aria-hidden>· </span>
            {chats} {chats === 1 ? "chat" : "chats"}
          </span>
        )}
      </div>
    </header>
  );
}
