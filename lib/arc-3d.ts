import type { Map as MapboxMap, CustomLayerInterface } from "mapbox-gl";

// Connection arcs drawn in 3D, so they rise off the map when it's tilted.
//
// Mapbox's own raised lines (line-z-offset) can't do this here: they're
// skipped entirely on the globe projection, and in testing they were
// clipped apart at tile edges. So this is a custom WebGL layer: Mapbox
// hands us its camera matrix, and we draw each arc as a ribbon of
// triangles in Mapbox's Web Mercator space, with real height.
//
// That matrix is the flat (Mercator) camera, which matches what's on screen
// once the globe has finished flattening out at zoom 6. Below that the
// flat arc layers in lib/arc-layer.ts take over; the two cross-fade over
// FADE_ZOOMS.

export const FLAT_UNTIL = 6;
export const FADE_ZOOMS = 0.5;

// Arcs stand straight up over the line between the two dots, and rise as
// the map tilts: flat seen from directly above, full height from
// FULL_LIFT_PITCH on. A raised arch seen from directly above would appear
// to lean away from the screen centre (Mapbox's camera has perspective),
// and from above there's no height to show anyway.
const FULL_LIFT_PITCH = 50; // degrees

// One arc, or one part of it (still drawing in, or a spark). Each point is
// [lng, lat, progress], progress being how far along the whole arc it is
// (0–1), which sets its height: h × sin(π × progress).
export type Line3D = {
  points: [number, number, number][];
  height: number; // peak height of the whole arc, meters
  alpha: number;
  mine: boolean;
  // A spark: transparent at its tail, full at its head.
  streak?: boolean;
};

type RGB = [number, number, number];

// How one pass draws: widths and opacities as [your arc, others' arcs].
type Pass = {
  color: RGB;
  width: [number, number]; // CSS pixels
  alpha: [number, number];
  soft: boolean; // a glow that fades out to its edges
};

const LIVE: RGB = [0x4a / 255, 0xde / 255, 0x80 / 255]; // --color-live
const SPARK: RGB = [0xdc / 255, 0xfc / 255, 0xe7 / 255];

// Same look as the flat layers: a wide soft glow under a thin core.
const LINE_PASSES: Pass[] = [
  { color: LIVE, width: [14, 10], alpha: [0.35, 0.2], soft: true },
  { color: LIVE, width: [2.5, 1.75], alpha: [0.95, 0.6], soft: false },
];
const SPARK_PASSES: Pass[] = [
  { color: LIVE, width: [16, 12], alpha: [0.7, 0.55], soft: true },
  { color: SPARK, width: [4, 3], alpha: [1, 1], soft: false },
];

// Per vertex: segment start (3), segment end (3), which end (1), which side
// of the ribbon (1), alpha (1), mine (1).
const FLOATS = 10;

const VERTEX = `#version 300 es
in vec3 a_a;
in vec3 a_b;
in float a_t;
in float a_side;
in float a_alpha;
in float a_mine;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform vec2 u_width;
uniform vec2 u_alpha;
uniform float u_lift; // 0 = flat on the map, 1 = full height
out float v_side;
out float v_alpha;

void main() {
  vec3 lift = vec3(1.0, 1.0, u_lift);
  vec4 ca = u_matrix * vec4(a_a * lift, 1.0);
  vec4 cb = u_matrix * vec4(a_b * lift, 1.0);
  // Behind the camera (only at extreme tilt): drop the segment.
  if (ca.w <= 0.0 || cb.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // The segment's direction on screen, in pixels, so the ribbon keeps a
  // constant on-screen width however the map is tilted or zoomed.
  vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * u_viewport;
  float len = length(d);
  vec2 dir = len > 0.0 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  vec4 p = a_t < 0.5 ? ca : cb;
  float width = mix(u_width.y, u_width.x, a_mine);
  // Half the width to each side; clip space spans 2 units per viewport.
  p.xy += normal * a_side * width / u_viewport * p.w;
  gl_Position = p;

  v_side = a_side;
  v_alpha = a_alpha * mix(u_alpha.y, u_alpha.x, a_mine);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
in float v_side;
in float v_alpha;
uniform vec3 u_color;
uniform float u_soft;
out vec4 fragColor;

void main() {
  float d = abs(v_side);
  // Glow: fades out toward its edges. Core: solid, with an anti-aliased rim.
  float edge = u_soft > 0.5 ? (1.0 - d) * (1.0 - d) : 1.0 - smoothstep(0.6, 1.0, d);
  float a = v_alpha * edge;
  // Mapbox blends custom layers with premultiplied alpha.
  fragColor = vec4(u_color * a, a);
}`;

type Batch = {
  buffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  count: number;
  origin: [number, number, number]; // Mercator; vertices are relative to it
};

export type Arc3DLayer = CustomLayerInterface & {
  setLines: (lines: Line3D[]) => void;
  setSparks: (sparks: Line3D[]) => void;
};

export function createArc3DLayer(id: string): Arc3DLayer {
  let map: MapboxMap | null = null;
  let gl: WebGL2RenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let lines: Batch | null = null;
  let sparks: Batch | null = null;

  function batch(gl: WebGL2RenderingContext, program: WebGLProgram): Batch {
    const buffer = gl.createBuffer()!;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = FLOATS * 4;
    let offset = 0;
    for (const [name, size] of [
      ["a_a", 3],
      ["a_b", 3],
      ["a_t", 1],
      ["a_side", 1],
      ["a_alpha", 1],
      ["a_mine", 1],
    ] as const) {
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      offset += size * 4;
    }
    gl.bindVertexArray(null);
    return { buffer, vao, count: 0, origin: [0, 0, 0] };
  }

  function upload(target: Batch | null, data: Line3D[]) {
    if (!gl || !target) return;
    const { vertices, origin } = build(data);
    gl.bindBuffer(gl.ARRAY_BUFFER, target.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    target.count = vertices.length / FLOATS;
    target.origin = origin;
    map?.triggerRepaint();
  }

  function draw(
    gl: WebGL2RenderingContext,
    matrix: number[],
    target: Batch | null,
    passes: Pass[],
    fade: number,
  ) {
    if (!target || target.count === 0) return;
    // Vertices are stored relative to an origin near the arcs: Mercator
    // coordinates span 0–1 for the whole world, and 32-bit floats would
    // make zoomed-in arcs jitter. The origin goes into the matrix instead,
    // computed here in 64-bit.
    gl.uniformMatrix4fv(
      uniforms.u_matrix,
      false,
      translate(matrix, target.origin),
    );
    gl.bindVertexArray(target.vao);
    const dpr = window.devicePixelRatio || 1;
    for (const pass of passes) {
      gl.uniform3fv(uniforms.u_color, pass.color);
      gl.uniform2f(uniforms.u_width, pass.width[0] * dpr, pass.width[1] * dpr);
      gl.uniform2f(uniforms.u_alpha, pass.alpha[0] * fade, pass.alpha[1] * fade);
      gl.uniform1f(uniforms.u_soft, pass.soft ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, target.count);
    }
    gl.bindVertexArray(null);
  }

  return {
    id,
    type: "custom",
    renderingMode: "3d",

    onAdd(m, context) {
      map = m;
      gl = context;
      program = link(context, VERTEX, FRAGMENT);
      for (const name of [
        "u_matrix",
        "u_viewport",
        "u_lift",
        "u_width",
        "u_alpha",
        "u_color",
        "u_soft",
      ]) {
        uniforms[name] = context.getUniformLocation(program, name);
      }
      lines = batch(context, program);
      sparks = batch(context, program);
    },

    onRemove(_, context) {
      for (const b of [lines, sparks]) {
        if (!b) continue;
        context.deleteBuffer(b.buffer);
        context.deleteVertexArray(b.vao);
      }
      if (program) context.deleteProgram(program);
      lines = sparks = null;
      program = null;
      map = gl = null;
      uniforms = {};
    },

    setLines: (data) => upload(lines, data),
    setSparks: (data) => upload(sparks, data),

    render(context, matrix) {
      if (!map || !program) return;
      // Fade in over FADE_ZOOMS once the globe is flat; nothing below.
      const fade = clamp01((map.getZoom() - FLAT_UNTIL) / FADE_ZOOMS);
      if (fade === 0) return;
      context.useProgram(program);
      context.uniform2f(
        uniforms.u_viewport,
        context.drawingBufferWidth,
        context.drawingBufferHeight,
      );
      // Heights are stored at full size (relative to a ground-level
      // origin), so scaling z here raises and lowers every arc as the map
      // tilts, without rebuilding anything.
      const t = clamp01(map.getPitch() / FULL_LIFT_PITCH);
      context.uniform1f(uniforms.u_lift, t * t * (3 - 2 * t));
      // Arcs are light, not solid: they shouldn't hide each other or be
      // hidden by depth, and Mapbox restores its own GL state afterwards.
      context.disable(context.DEPTH_TEST);
      context.disable(context.CULL_FACE);
      draw(context, matrix, lines, LINE_PASSES, fade);
      draw(context, matrix, sparks, SPARK_PASSES, fade);
    },
  };
}

// Two triangles per segment, each vertex knowing both segment ends so the
// vertex shader can find the segment's direction on screen.
function build(data: Line3D[]) {
  const first = data.find((l) => l.points.length > 0)?.points[0];
  const origin = first ? mercator(first[0], first[1], 0) : ([0, 0, 0] as const);  let segments = 0;
  for (const l of data) segments += Math.max(0, l.points.length - 1);
  const vertices = new Float32Array(segments * 6 * FLOATS);

  let o = 0;
  for (const l of data) {
    const pts = l.points.map(([lng, lat, progress]) => {
      const [x, y, z] = mercator(lng, lat, l.height * Math.sin(Math.PI * progress));
      return [x - origin[0], y - origin[1], z - origin[2]];
    });
    // A spark's alpha ramps from its tail (0) to its head (1).
    const p0 = l.points[0]?.[2] ?? 0;
    const span = (l.points.at(-1)?.[2] ?? 1) - p0 || 1;
    const alphaAt = (i: number) =>
      l.streak ? l.alpha * ((l.points[i][2] - p0) / span) : l.alpha;
    const mine = l.mine ? 1 : 0;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const aa = alphaAt(i);
      const ab = alphaAt(i + 1);
      for (const [t, side] of QUAD) {
        vertices.set([...a, ...b, t, side, t ? ab : aa, mine], o);
        o += FLOATS;
      }
    }
  }
  return { vertices, origin: [...origin] as [number, number, number] };
}

// [which end, side] for the six corners of a segment's two triangles.
const QUAD = [
  [0, -1],
  [0, 1],
  [1, -1],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

// Web Mercator, the way Mapbox defines it: x and y span 0–1 over the world,
// z is height in the same units (meters / circumference at that latitude).
const EARTH_RADIUS = 6371008.8;
function mercator(lng: number, lat: number, meters: number) {
  const latR = (lat * Math.PI) / 180;
  const x = (180 + lng) / 360;
  const y =
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + latR / 2))) / 360;
  const z = meters / (2 * Math.PI * EARTH_RADIUS * Math.cos(latR));
  return [x, y, z] as const;
}

// matrix × translation(origin), so vertices can stay relative to origin.
function translate(m: number[], [x, y, z]: [number, number, number]) {
  const out = Float32Array.from(m);
  for (let i = 0; i < 4; i++) {
    out[12 + i] = m[i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i];
  }
  return out;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Arc shader: ${gl.getShaderInfoLog(shader)}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Arc program: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
