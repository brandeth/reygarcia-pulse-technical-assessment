import type {
  Map as MapboxMap,
  GeoJSONSource,
  ExpressionSpecification,
} from "mapbox-gl";
import { arcCoordinates } from "@/lib/arcs";

// Connection arcs on the map: one line per live chat. New arcs draw
// themselves in, held arcs stay faintly lit with a spark that travels along
// them now and then, and arcs whose chat ended fade out.
//
// Mapbox paint properties like line-trim-offset apply to a whole layer, not
// one line, so every arc shares one GeoJSON source and the animation
// rewrites its data each frame (setData), only while something is moving.

type LatLng = { lat: number; lng: number };
export type ArcInput = { key: string; a: LatLng; b: LatLng; mine: boolean };

const LIVE = "#4ade80"; // --color-live in app/globals.css: a live status
const SPARK = "#dcfce7"; // a lighter live green, so the spark reads as light

const DRAW_MS = 1200; // draw-in, end to end
const FADE_MS = 600; // fade in (no draw-in) and fade out
const SPARK_MS = 2400; // one spark trip along an arc
const MAX_ARCS = 100; // keeps a very busy map smooth

const ARC_SOURCE = "pulse-arcs";
const SPARK_SOURCE = "pulse-arc-sparks";

type Arc = {
  coords: [number, number][];
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
  setArcs: (arcs: ArcInput[], opts: { seed: boolean }) => void;
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
const fade = (mine: number, others: number): ExpressionSpecification => [
  "*",
  ["get", "alpha"],
  byMine(mine, others),
];

export function createArcLayer(map: MapboxMap): ArcLayer {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (!map.getSource(ARC_SOURCE)) {
    map.addSource(ARC_SOURCE, { type: "geojson", data: empty() });
    map.addSource(SPARK_SOURCE, { type: "geojson", data: empty() });
    // Under the labels, so place names stay readable through an arc. The
    // dots are DOM markers, so they're always above every layer.
    const beforeId = map
      .getStyle()
      ?.layers.find((l) => l.type === "symbol")?.id;
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
          "circle-opacity": ["get", "alpha"],
        },
      },
      beforeId,
    );
  }

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
    const lines: GeoJSON.Feature[] = [];
    const sparks: GeoJSON.Feature[] = [];
    let animating = false;

    for (const [key, arc] of arcs) {
      const age = now - arc.born;
      let alpha = 1;
      let coords = arc.coords;
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
        coords = partial(arc.coords, easeOut(age / DRAW_MS));
        animating = true;
        drawn = false;
      } else if (!arc.drawIn && age < FADE_MS) {
        alpha = age / FADE_MS;
        animating = true;
      }

      lines.push(line(coords, { mine: arc.mine, alpha }));

      if (drawn && !reducedMotion) {
        // Spark time starts once the arc is fully drawn.
        const sparkAge = arc.drawIn ? age - DRAW_MS : age;
        const t = (sparkAge + arc.sparkPhase) % arc.sparkCycle;
        if (t < SPARK_MS) {
          const f = t / SPARK_MS;
          // Fades in as it leaves one dot and out as it reaches the other.
          sparks.push(
            point(pointAt(arc.coords, easeInOut(f)), {
              mine: arc.mine,
              alpha: alpha * Math.sin(Math.PI * f),
            }),
          );
        }
      }
    }

    if (animating || linesDirty) {
      arcSource?.setData({ type: "FeatureCollection", features: lines });
      linesDirty = false;
    }
    if (sparks.length > 0 || sparksShown) {
      sparkSource?.setData({ type: "FeatureCollection", features: sparks });
      sparksShown = sparks.length > 0;
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

      for (const { key, a, b, mine } of inputs.slice(0, MAX_ARCS)) {
        seen.add(key);
        const ends = `${a.lat},${a.lng}|${b.lat},${b.lng}`;
        const arc = arcs.get(key);
        if (arc && arc.leaving === null) {
          if (arc.ends !== ends) {
            arc.coords = arcCoordinates(a, b);
            arc.ends = ends;
            linesDirty = true;
          }
          continue;
        }
        // New, or the same two reconnected while it was fading out.
        const gap = 2000 + Math.random() * 4000;
        arcs.set(key, {
          coords: arcCoordinates(a, b),
          ends,
          mine,
          born: now,
          drawIn: !seed && !reducedMotion,
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
    },

    // Only stops the animation: on unmount the map is removed with its
    // layers, possibly before this runs.
    destroy() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

type Props = { mine: boolean; alpha: number };

function line(
  coordinates: [number, number][],
  properties: Props,
): GeoJSON.Feature {
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates },
  };
}

function point(
  coordinates: [number, number],
  properties: Props,
): GeoJSON.Feature {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
}

// The first `f` (0–1) of the arc, ending on an interpolated point so the
// tip moves smoothly instead of jumping from point to point.
function partial(coords: [number, number][], f: number): [number, number][] {
  const x = f * (coords.length - 1);
  const i = Math.floor(x);
  const head = coords.slice(0, i + 1);
  if (i < coords.length - 1) head.push(pointAt(coords, f));
  return head.length > 1 ? head : [coords[0], coords[0]];
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
