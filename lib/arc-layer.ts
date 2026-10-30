import type {
  Map as MapboxMap,
  GeoJSONSource,
  ExpressionSpecification,
} from "mapbox-gl";
import { arcCoordinates, distanceMeters } from "@/lib/arcs";
import {
  createArc3DLayer,
  FADE_ZOOMS,
  FLAT_UNTIL,
  type Arc3DLayer,
  type Line3D,
} from "@/lib/arc-3d";

// Connection arcs on the map: one line per live chat. New arcs draw
// themselves in, held arcs stay faintly lit with a spark that travels along
// them now and then, and arcs whose chat ended fade out.
//
// Two renderers share this animation. Zoomed in, arcs rise off the map in
// 3D (lib/arc-3d.ts, a custom WebGL layer), so they stand up when the map
// is tilted. On the globe (below zoom 6) they're flat Mapbox line layers:
// you look straight down at a ball there, and the custom layer's camera
// only matches the map once the globe has flattened out.
//
// Mapbox paint properties like line-trim-offset apply to a whole layer, not
// one line, so every flat arc shares one GeoJSON source and the animation
// rewrites its data each frame (setData), only while something is moving.

type LatLng = { lat: number; lng: number };
export type ArcInput = { key: string; a: LatLng; b: LatLng; mine: boolean };

const LIVE = "#4ade80"; // --color-live in app/globals.css: a live status
const SPARK = "#dcfce7"; // a lighter live green, so the spark reads as light

export const DRAW_MS = 1200; // draw-in, end to end
const FADE_MS = 600; // fade in (no draw-in) and fade out
const SPARK_MS = 2400; // one spark trip along an arc
const SPARK_TAIL = 0.15; // 3D spark streak length, as a share of the arc
const MAX_ARCS = 100; // keeps a very busy map smooth

// Peak height of a 3D arc, as a share of its length, capped so long arcs
// don't shoot off into space.
const LIFT = 0.25;
const MAX_LIFT_M = 300_000;

const ARC_SOURCE = "pulse-arcs";
const SPARK_SOURCE = "pulse-arc-sparks";
const ARC_3D = "pulse-arc-3d";

type Arc = {
  coords: [number, number][];
  height: number; // peak height in 3D, meters
  ends: string; // both ends' positions, to notice if a dot moved
  mine: boolean;
  born: number; // performance.now() when it appeared
  drawIn: boolean; // false: fades in instead (already there, reduced motion)
  leaving: number | null; // when its chat ended
  sparkCycle: number; // trip + pause, different per arc
  sparkPhase: number; // so sparks don't all leave at once
};

export type ArcLayer = {
  // The full set of live chats. `seed` marks the first set after entering:
  // those chats were already going, so they fade in instead of drawing in.
  // Returns the keys of arcs that start drawing in now (none under reduced
  // motion), so their dots can mark the moment.
  setArcs: (arcs: ArcInput[], opts: { seed: boolean }) => string[];
  destroy: () => void;
};

const empty = (): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

// Your own chat is brighter than strangers' chats.
const byMine = (mine: number, others: number): ExpressionSpecification => [
  "case",
  ["get", "mine"],
  mine,
  others,
];
// The flat layers fade out as the 3D arcs fade in (lib/arc-3d.ts).
const flatOnly = (
  opacity: ExpressionSpecification,
): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  FLAT_UNTIL,
  opacity,
  FLAT_UNTIL + FADE_ZOOMS,
  0,
];
const fade = (mine: number, others: number): ExpressionSpecification =>
  flatOnly(["*", ["get", "alpha"], byMine(mine, others)]);

export function createArcLayer(map: MapboxMap): ArcLayer {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // Under the labels, so place names stay readable through an arc. The
  // dots are DOM markers, so they're always above every layer.
  const beforeId = map
    .getStyle()
    ?.layers.find((l) => l.type === "symbol")?.id;

  if (!map.getSource(ARC_SOURCE)) {
    map.addSource(ARC_SOURCE, { type: "geojson", data: empty() });
    map.addSource(SPARK_SOURCE, { type: "geojson", data: empty() });
    const lineLayout = { "line-cap": "round", "line-join": "round" } as const;
    map.addLayer(
      {
        id: "pulse-arc-glow",
        type: "line",
        source: ARC_SOURCE,
        layout: lineLayout,
        paint: {
          "line-color": LIVE,
          "line-width": byMine(8, 6),
          "line-blur": 5,
          "line-opacity": fade(0.35, 0.2),
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: "pulse-arc-core",
        type: "line",
        source: ARC_SOURCE,
        layout: lineLayout,
        paint: {
          "line-color": LIVE,
          "line-width": byMine(2, 1.25),
          "line-opacity": fade(0.95, 0.6),
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: "pulse-arc-spark-glow",
        type: "circle",
        source: SPARK_SOURCE,
        paint: {
          "circle-color": LIVE,
          "circle-radius": byMine(9, 7),
          "circle-blur": 1,
          "circle-opacity": fade(0.6, 0.45),
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: "pulse-arc-spark",
        type: "circle",
        source: SPARK_SOURCE,
        paint: {
          "circle-color": SPARK,
          "circle-radius": byMine(2.5, 2),
          "circle-opacity": flatOnly(["get", "alpha"]),
        },
      },
      beforeId,
    );
  }

  // The 3D layer holds its own GL state, so it's always a fresh one.
  if (map.getLayer(ARC_3D)) map.removeLayer(ARC_3D);
  const arc3d: Arc3DLayer = createArc3DLayer(ARC_3D);
  map.addLayer(arc3d, beforeId);

  const arcSource = map.getSource<GeoJSONSource>(ARC_SOURCE);
  const sparkSource = map.getSource<GeoJSONSource>(SPARK_SOURCE);
  const arcs = new Map<string, Arc>();
  let frame: number | null = null;
  // Lines need new data this frame (an arc was added, removed or moving).
  let linesDirty = false;
  // Sparks were drawn last frame, so they need clearing when they stop.
  let sparksShown = false;

  function render(now: number) {
    frame = null;
    const lines: Line3D[] = [];
    const sparks: Line3D[] = [];
    const heads: GeoJSON.Feature[] = []; // flat sparks: a dot at the head
    let animating = false;

    for (const [key, arc] of arcs) {
      const age = now - arc.born;
      let alpha = 1;
      let span = 1; // how much of the arc is drawn
      let drawn = true; // fully drawn and not leaving: may carry a spark

      if (arc.leaving !== null) {
        alpha = 1 - (now - arc.leaving) / FADE_MS;
        if (alpha <= 0) {
          arcs.delete(key);
          linesDirty = true;
          continue;
        }
        animating = true;
        drawn = false;
      } else if (arc.drawIn && age < DRAW_MS) {
        span = easeOut(age / DRAW_MS);
        animating = true;
        drawn = false;
      } else if (!arc.drawIn && age < FADE_MS) {
        alpha = age / FADE_MS;
        animating = true;
      }

      const base = { height: arc.height, alpha, mine: arc.mine };
      lines.push({ ...base, points: slice(arc.coords, 0, span) });

      if (drawn && !reducedMotion) {
        // Spark time starts once the arc is fully drawn.
        const sparkAge = arc.drawIn ? age - DRAW_MS : age;
        const t = (sparkAge + arc.sparkPhase) % arc.sparkCycle;
        if (t < SPARK_MS) {
          const f = t / SPARK_MS;
          const head = easeInOut(f);
          // Fades in as it leaves one dot and out as it reaches the other.
          const sparkAlpha = alpha * Math.sin(Math.PI * f);
          const coordinates = pointAt(arc.coords, head);
          heads.push(
            feature({ type: "Point", coordinates }, arc.mine, sparkAlpha),
          );
          const tail = Math.max(0, head - SPARK_TAIL);
          if (head - tail > 0.005) {
            sparks.push({
              ...base,
              alpha: sparkAlpha,
              points: slice(arc.coords, tail, head),
              streak: true,
            });
          }
        }
      }
    }

    if (animating || linesDirty) {
      arcSource?.setData({
        type: "FeatureCollection",
        features: lines.map((l) => {
          const coordinates = l.points.map(([lng, lat]) => [lng, lat]);
          return feature({ type: "LineString", coordinates }, l.mine, l.alpha);
        }),
      });
      arc3d.setLines(lines);
      linesDirty = false;
    }
    if (heads.length > 0 || sparksShown) {
      sparkSource?.setData({ type: "FeatureCollection", features: heads });
      arc3d.setSparks(sparks);
      sparksShown = heads.length > 0;
    }

    // Keep going while anything moves; held arcs keep their sparks moving.
    const sparking =
      !reducedMotion && [...arcs.values()].some((a) => a.leaving === null);
    if (animating || sparking || sparksShown) start();
  }

  function start() {
    frame ??= requestAnimationFrame(render);
  }

  return {
    setArcs(inputs, { seed }) {
      const now = performance.now();
      const seen = new Set<string>();
      const drawing: string[] = [];

      for (const { key, a, b, mine } of inputs.slice(0, MAX_ARCS)) {
        seen.add(key);
        const ends = `${a.lat},${a.lng}|${b.lat},${b.lng}`;
        const arc = arcs.get(key);
        if (arc && arc.leaving === null) {
          if (arc.ends !== ends) {
            arc.coords = arcCoordinates(a, b);
            arc.height = liftFor(a, b);
            arc.ends = ends;
            linesDirty = true;
          }
          continue;
        }
        // New, or the same two reconnected while it was fading out.
        const gap = 2000 + Math.random() * 4000;
        const drawIn = !seed && !reducedMotion;
        if (drawIn) drawing.push(key);
        arcs.set(key, {
          coords: arcCoordinates(a, b),
          height: liftFor(a, b),
          ends,
          mine,
          born: now,
          drawIn,
          leaving: null,
          sparkCycle: SPARK_MS + gap,
          // A freshly drawn arc sends its first spark right away.
          sparkPhase: seed ? Math.random() * (SPARK_MS + gap) : 0,
        });
        linesDirty = true;
      }

      for (const [key, arc] of arcs) {
        if (!seen.has(key) && arc.leaving === null) {
          arc.leaving = now;
          linesDirty = true;
        }
      }

      if (linesDirty) start();
      return drawing;
    },

    // Only stops the animation: on unmount the map is removed with its
    // layers, possibly before this runs.
    destroy() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

function liftFor(a: LatLng, b: LatLng) {
  return Math.min(LIFT * distanceMeters(a, b), MAX_LIFT_M);
}

function feature(
  geometry: GeoJSON.Geometry,
  mine: boolean,
  alpha: number,
): GeoJSON.Feature {
  return { type: "Feature", properties: { mine, alpha }, geometry };
}

// The part of the arc from `from` to `to` (0–1), as [lng, lat, progress]
// points (progress along the whole arc, which sets the 3D height). The ends
// are interpolated so a growing line or a moving spark glides instead of
// jumping from point to point.
function slice(
  coords: [number, number][],
  from: number,
  to: number,
): [number, number, number][] {
  const last = coords.length - 1;
  const out: [number, number, number][] = [[...pointAt(coords, from), from]];
  for (let i = Math.floor(from * last) + 1; i < to * last; i++) {
    out.push([...coords[i], i / last]);
  }
  out.push([...pointAt(coords, to), to]);
  return out;
}

// The point `f` (0–1) of the way along the arc. Points are evenly spaced
// (lib/arcs.ts), so an index fraction is a distance fraction.
function pointAt(coords: [number, number][], f: number): [number, number] {
  const x = f * (coords.length - 1);
  const i = Math.min(Math.floor(x), coords.length - 2);
  const t = x - i;
  const [lng1, lat1] = coords[i];
  const [lng2, lat2] = coords[i + 1];
  return [lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t];
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}
