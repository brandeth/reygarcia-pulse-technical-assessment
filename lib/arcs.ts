// Connection arcs: the path a line between two dots follows over the globe.
// Mapbox draws a two-point line straight in Mercator, which on the globe
// bends off the shortest route (Tokyo → San Francisco would cross Asia and
// Europe). So we sample the great circle ourselves and hand Mapbox the points.

type LatLng = { lat: number; lng: number };

const RAD = Math.PI / 180;

// Points along the great circle from a to b, as GeoJSON [lng, lat] pairs.
// Always steps + 1 points, even for dots a few km apart: the draw-in
// animation grows the line point by point, so every arc needs the same
// number of points to take the same time.
export function arcCoordinates(
  a: LatLng,
  b: LatLng,
  steps = 64,
): [number, number][] {
  const p = toVector(a);
  const q = toVector(b);
  // Angle between the two points, seen from the Earth's center.
  const omega = Math.acos(clamp(dot(p, q), -1, 1));
  const sinOmega = Math.sin(omega);

  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Same point, or exactly opposite sides of the Earth (no single
    // shortest route): fall back to a straight line between them.
    if (sinOmega < 1e-9) {
      coords.push([a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t]);
      continue;
    }
    // Spherical interpolation: weights that move a point along the circle
    // at constant speed, from p (t = 0) to q (t = 1).
    const wp = Math.sin((1 - t) * omega) / sinOmega;
    const wq = Math.sin(t * omega) / sinOmega;
    const point = toLatLng([
      p[0] * wp + q[0] * wq,
      p[1] * wp + q[1] * wq,
      p[2] * wp + q[2] * wq,
    ]);
    coords.push([point.lng, point.lat]);
  }
  return unwrap(coords);
}

// A point on the globe as a unit vector from the Earth's center.
type Vec = [number, number, number];

function toVector({ lat, lng }: LatLng): Vec {
  const latR = lat * RAD;
  const lngR = lng * RAD;
  return [
    Math.cos(latR) * Math.cos(lngR),
    Math.cos(latR) * Math.sin(lngR),
    Math.sin(latR),
  ];
}

function toLatLng([x, y, z]: Vec): LatLng {
  return {
    lat: Math.atan2(z, Math.hypot(x, y)) / RAD,
    lng: Math.atan2(y, x) / RAD,
  };
}

function dot(p: Vec, q: Vec): number {
  return p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// An arc across the antimeridian would jump from 179° to -179°, and Mapbox
// would draw that jump as a line all the way around the world. Shift each
// longitude by ±360° so consecutive points never differ by more than 180°;
// Mapbox accepts longitudes past ±180 and draws the line continuously.
function unwrap(coords: [number, number][]): [number, number][] {
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1][0];
    let lng = coords[i][0];
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    coords[i][0] = lng;
  }
  return coords;
}
