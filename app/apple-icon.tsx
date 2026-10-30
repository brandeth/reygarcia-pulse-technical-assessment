import { ImageResponse } from "next/og";
import { INK, MARK_SVG, dataUri } from "@/lib/brand";

// Home-screen icon on iPhones / iPads. iOS rounds the corners itself and
// shows transparent ones as black, so the mark sits on a full ink square.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: INK }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG by next/og */}
      <img src={dataUri(MARK_SVG)} width={size.width} height={size.height} alt="" />
    </div>,
    size,
  );
}
