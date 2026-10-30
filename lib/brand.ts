// Brand art for the app icons and the link-preview image (app/icon.tsx,
// app/apple-icon.tsx, app/opengraph-image.tsx). Plain SVG strings, drawn
// with the "Night signal" tokens from app/globals.css, so all three share
// one source. They go into next/og images as data URIs.

export const INK = "#070b14"; // --color-ink
export const FG = "#e8ecf4"; // --color-fg
export const MUTED = "#8a93a6"; // --color-muted
const ACCENT = "#ffb547"; // --color-accent
const LIVE = "#4ade80"; // --color-live
const LAND = "#111a2c"; // map land (lib/map-theme.ts)
const RIM = "#1b2a4a"; // the globe's atmosphere rim (lib/map-theme.ts)

// The mark: a glowing amber dot with its heartbeat ring, like the dots on
// the map, on an ink tile. 64-unit viewBox.
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${INK}"/>
  <circle cx="32" cy="32" r="24" fill="${ACCENT}" opacity="0.08"/>
  <circle cx="32" cy="32" r="19" fill="none" stroke="${ACCENT}" stroke-width="2" opacity="0.45"/>
  <circle cx="32" cy="32" r="14" fill="${ACCENT}" opacity="0.18"/>
  <circle cx="32" cy="32" r="10" fill="${ACCENT}"/>
</svg>`;

// For the preview image: the night globe, a few strangers (amber = free,
// hollow gray = busy) and a live connection arc between two of them.
// 760-unit viewBox.
export const GLOBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 760">
  <defs>
    <radialGradient id="land" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="${LAND}"/>
      <stop offset="1" stop-color="${INK}"/>
    </radialGradient>
  </defs>
  <circle cx="380" cy="380" r="372" fill="none" stroke="${RIM}" stroke-width="16" opacity="0.5"/>
  <circle cx="380" cy="380" r="360" fill="url(#land)" stroke="${RIM}" stroke-width="3"/>
  ${glowDot(250, 300)}
  ${glowDot(520, 250)}
  ${glowDot(430, 520)}
  ${glowDot(210, 470)}
  <circle cx="330" cy="200" r="9" fill="none" stroke="${MUTED}" stroke-width="3" opacity="0.7"/>
  <circle cx="600" cy="420" r="9" fill="none" stroke="${MUTED}" stroke-width="3" opacity="0.7"/>
  <path d="M250 300 Q 390 120 520 250" fill="none" stroke="${LIVE}" stroke-width="14" stroke-linecap="round" opacity="0.18"/>
  <path d="M250 300 Q 390 120 520 250" fill="none" stroke="${LIVE}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="392" cy="216" r="7" fill="#dcfce7"/>
</svg>`;

function glowDot(x: number, y: number) {
  return `<circle cx="${x}" cy="${y}" r="26" fill="${ACCENT}" opacity="0.12"/>
  <circle cx="${x}" cy="${y}" r="17" fill="none" stroke="${ACCENT}" stroke-width="3" opacity="0.5"/>
  <circle cx="${x}" cy="${y}" r="10" fill="${ACCENT}"/>`;
}

export function dataUri(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
