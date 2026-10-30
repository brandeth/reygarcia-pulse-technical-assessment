import type { Map as MapboxMap, SymbolPaint } from "mapbox-gl";

// "Night signal" colors for Mapbox's dark-v11 style. They extend the UI tokens
// in app/globals.css (water = --color-ink, big labels = --color-muted), so keep
// the two in sync.
const C = {
  water: "#070b14",
  land: "#111a2c",
  park: "#131d30",
  building: "#0c1322",
  road: "#1a2438",
  tunnel: "#141c2d",
  borderBg: "#0a101c",
  country: "#2b3955",
  state: "#1e2940",
  labelMajor: "#8a93a6",
  labelMinor: "#5b6680",
  halo: "#070b14",
};

// Recolors every dark-v11 layer by its role, then turns the style's flat
// black fog into a night sky. Run on "style.load", before the first render.
export function applyNightSignal(map: MapboxMap) {
  for (const { id, type } of map.getStyle()?.layers ?? []) {
    switch (type) {
      case "background":
        map.setPaintProperty(id, "background-color", C.land);
        break;
      case "fill":
        map.setPaintProperty(id, "fill-color", fillColor(id));
        break;
      case "line":
        map.setPaintProperty(id, "line-color", lineColor(id));
        break;
      case "symbol":
        map.setPaintProperty(id, "text-color", labelColor(id));
        map.setPaintProperty(id, "text-halo-color", C.halo);
        break;
    }
  }

  // Range stays at dark-v11's default; only the colors change.
  map.setFog({
    range: [-1, 10],
    color: "#0e1422", // lower atmosphere: --color-surface
    "high-color": "#1b2a4a", // thin blue rim along the globe's edge
    "space-color": "#03050b",
    "horizon-blend": 0.08,
    "star-intensity": 0.35,
  });
}

// Behind the entry gate the globe should read as a shape: its labels compete
// with the gate's text. Hide them, remembering each layer's own opacity (some
// fade by zoom), and bring them back as the camera flies down to the user.
type TextOpacity = NonNullable<SymbolPaint>["text-opacity"];
const savedLabelOpacity = new WeakMap<MapboxMap, Map<string, TextOpacity>>();

export function hideLabels(map: MapboxMap) {
  const saved = new Map<string, TextOpacity>();
  for (const { id, type } of map.getStyle()?.layers ?? []) {
    if (type !== "symbol") continue;
    saved.set(id, map.getPaintProperty(id, "text-opacity") as TextOpacity);
    map.setPaintProperty(id, "text-opacity-transition", { duration: 0 });
    map.setPaintProperty(id, "text-opacity", 0);
  }
  savedLabelOpacity.set(map, saved);
}

export function showLabels(map: MapboxMap) {
  const saved = savedLabelOpacity.get(map);
  if (!saved) return;
  for (const [id, opacity] of saved) {
    // Fade in during the second half of the 3.5 s fly-in, as places come
    // into view.
    map.setPaintProperty(id, "text-opacity-transition", {
      duration: 1200,
      delay: 1800,
    });
    // `undefined` (layer had no explicit value) restores the default.
    map.setPaintProperty(id, "text-opacity", opacity);
  }
  savedLabelOpacity.delete(map);
}

function fillColor(id: string) {
  if (id === "water") return C.water;
  if (id === "building") return C.building;
  if (id.startsWith("aeroway")) return C.road;
  if (id.startsWith("land-structure")) return C.land;
  return C.park; // national-park, landuse
}

function lineColor(id: string) {
  if (id.startsWith("waterway")) return C.water;
  if (id.endsWith("-bg")) return C.borderBg;
  if (id.startsWith("admin-0")) return C.country;
  if (id.startsWith("admin-1")) return C.state;
  if (id.startsWith("tunnel")) return C.tunnel;
  if (id.startsWith("land-structure") || id.includes("-case-")) return C.land;
  return C.road; // road-*, bridge-*, aeroway-line
}

function labelColor(id: string) {
  // Big place names stay readable; the rest recedes so the dots lead.
  return /^(continent|country|state|settlement-major)/.test(id)
    ? C.labelMajor
    : C.labelMinor;
}
