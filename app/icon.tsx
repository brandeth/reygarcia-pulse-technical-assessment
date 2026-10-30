import { ImageResponse } from "next/og";
import { MARK_SVG, dataUri } from "@/lib/brand";

// Browser tab icon: the brand mark (lib/brand.ts), rendered at build time.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG by next/og, not the page
    <img src={dataUri(MARK_SVG)} width={size.width} height={size.height} alt="" />,
    size,
  );
}
