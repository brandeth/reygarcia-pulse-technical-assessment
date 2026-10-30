import { ImageResponse } from "next/og";
import { FG, GLOBE_SVG, INK, MARK_SVG, MUTED, dataUri } from "@/lib/brand";

// The card shown when the link is shared (chats, email, social): the
// wordmark and promise on the left, the night globe with a live connection
// on the right. Rendered at build time. On Vercel, Next builds the image's
// absolute URL from the production domain, so no metadataBase is needed.
export const alt =
  "Pulse: a living globe of anonymous strangers. Tap a dot, start talking.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        background: INK,
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG by next/og */}
      <img
        src={dataUri(GLOBE_SVG)}
        width={760}
        height={760}
        alt=""
        style={{ position: "absolute", right: -150, top: -65 }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 28,
          padding: "0 80px",
          width: 720,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG by next/og */}
          <img src={dataUri(MARK_SVG)} width={84} height={84} alt="" />
          <span
            style={{ color: FG, fontSize: 104, fontWeight: 700, letterSpacing: -3 }}
          >
            Pulse
          </span>
        </div>
        <span style={{ color: FG, fontSize: 44, lineHeight: 1.25 }}>
          A living globe of anonymous strangers. Tap a dot, start talking.
        </span>
        <span style={{ color: MUTED, fontSize: 24, whiteSpace: "nowrap" }}>
          No account · Dot fuzzed 1–3 km · Nothing stored
        </span>
      </div>
    </div>,
    size,
  );
}
