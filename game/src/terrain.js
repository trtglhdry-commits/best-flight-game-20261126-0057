// terrain.js — the valley the game flies over: a deterministic heightfield,
// a lake, a flattened airfield, and the coloured ground mesh the renderer draws.

import { clamp, hash2, lerp, smoothstep } from './math3d.js';

export const WATER_LEVEL = 6;
export const RUNWAY = {
  x: 0, z0: -420, z1: 420, halfWidth: 22,
  heading: 0, // runway 36, pointing north (+z)
};
export const AIRFIELD = { x: 0, z: -40 };

const SEED = 20261126;

// Smooth value noise over the xz plane.
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, SEED);
  const b = hash2(ix + 1, iz, SEED);
  const c = hash2(ix, iz + 1, SEED);
  const d = hash2(ix + 1, iz + 1, SEED);
  const ux = smoothstep(fx), uz = smoothstep(fz);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

function fbm(x, z) {
  let v = 0, amp = 1, freq = 1;
  for (let o = 0; o < 3; o++) {
    v += amp * noise2(x * freq, z * freq);
    amp *= 0.5; freq *= 2.13;
  }
  return v; // ~0..1.75
}

// How far the point is from the runway strip, for flattening the airfield.
function runwayDistance(x, z) {
  const dz = clamp(z, RUNWAY.z0, RUNWAY.z1) - z;
  const dx = Math.abs(x - RUNWAY.x) - RUNWAY.halfWidth;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(Math.abs(dz), 0));
  return Math.max(dx, Math.abs(dz), outside);
}

export function groundHeight(x, z) {
  // Rolling hills, rising into a ring of peaks away from the airfield.
  const dist = Math.hypot(x - AIRFIELD.x, z - AIRFIELD.z);
  const mountain = smoothstep(clamp((dist - 1400) / 2200, 0, 1));
  const hills = fbm(x * 0.0016, z * 0.0016);
  const ridge = fbm(x * 0.00045 + 31, z * 0.00045 + 17);
  let h = hills * 55 + ridge * ridge * 260 * mountain + mountain * 40;
  // A lake basin south-west of the field, and a smaller pond to the east.
  const lake = Math.hypot(x + 900, z + 950);
  if (lake < 520) h = lerp(2, h, smoothstep(clamp((lake - 260) / 260, 0, 1)));
  const pond = Math.hypot(x - 1150, z - 700);
  if (pond < 260) h = lerp(3, h, smoothstep(clamp((pond - 130) / 130, 0, 1)));
  // Flatten the airfield so the runway sits on level ground (14 m: meadow,
  // not shore — the flattened field must read as grass, not sand).
  const rd = runwayDistance(x, z);
  const flat = 1 - smoothstep(clamp((rd - 40) / 260, 0, 1));
  return lerp(h, 14, flat);
}

export function isWater(x, z) {
  return groundHeight(x, z) < WATER_LEVEL;
}

// Colour of a ground quad at height h with slope s (0 flat .. 1 steep),
// darkened by distance haze t (0 near .. 1 far). Returns [r, g, b].
export function groundColour(h, slope, haze) {
  let r, g, b;
  if (h < WATER_LEVEL) { r = 52; g = 122; b = 168; }           // lake / pond
  else if (h < 10) { r = 196; g = 178; b = 120; }             // sandy shore
  else if (h < 55) { r = 104; g = 150; b = 74; }              // meadow
  else if (h < 110) { r = 62; g = 108; b = 58; }              // forest
  else if (h < 175) { r = 122; g = 104; b = 84; }             // rock
  else { r = 232; g = 236; b = 240; }                         // snow
  const shade = 1 - slope * 0.35;
  r *= shade; g *= shade; b *= shade;
  // Haze pulls far ground toward the sky colour.
  r = lerp(r, 168, haze * 0.75); g = lerp(g, 196, haze * 0.75); b = lerp(b, 224, haze * 0.75);
  return [r, g, b];
}

// Build the ground mesh ahead of the camera: rows of quads with increasing
// spacing so near ground is detailed and far ground still reaches the horizon.
// The grid is snapped to 100 m in world space so terrain never swims.
export function buildGroundMesh(cam) {
  const CELL = 100;
  const COLS = 15; // across, -7..+7
  const rows = [0, 100, 200, 320, 460, 620, 800, 1000, 1250, 1550, 1900, 2300, 2750, 3300];
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const rx = cy, rz = -sy; // camera right
  const snapX = Math.round(cam.x / CELL) * CELL;
  const snapZ = Math.round(cam.z / CELL) * CELL;
  const quads = [];
  for (let ri = 0; ri < rows.length - 1; ri++) {
    const d0 = rows[ri], d1 = rows[ri + 1];
    for (let ci = -COLS; ci < COLS; ci++) {
      const o0 = ci * CELL, o1 = (ci + 1) * CELL;
      const p = (off, d) => {
        const wx = snapX + rx * off + sy * d;
        const wz = snapZ + rz * off + cy * d;
        return { x: wx, y: groundHeight(wx, wz), z: wz };
      };
      const a = p(o0, d0), b = p(o1, d0), c = p(o1, d1), d = p(o0, d1);
      const midH = (a.y + b.y + c.y + d.y) / 4;
      const slope = clamp(Math.abs(c.y - a.y) / (d1 - d0 + 1) * 2.2, 0, 1);
      const haze = clamp((d0 + d1) / 2 / 3200, 0, 1);
      const [cr, cg, cb] = groundColour(midH, slope, haze);
      // A small per-cell tint breaks the mesh's regularity into patchwork fields.
      const vary = 0.93 + hash2(Math.round(a.x / 100), Math.round(a.z / 100), 99) * 0.14;
      const colour = `rgb(${(cr * vary) | 0},${(cg * vary) | 0},${(cb * vary) | 0})`;
      quads.push({ a, b, c, d, colour, depth: (d0 + d1) / 2 });
    }
  }
  // Painter's order: farthest first.
  quads.sort((q1, q2) => q2.depth - q1.depth);
  return quads;
}

// Deterministic scatter of pine trees on the lower slopes, for recognisable terrain.
export function treePositions(cam) {
  const trees = [];
  const range = 900;
  const gx0 = Math.floor((cam.x - range) / 180), gx1 = Math.floor((cam.x + range) / 180);
  const gz0 = Math.floor((cam.z - range) / 180), gz1 = Math.floor((cam.z + range) / 180);
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const jx = hash2(gx, gz, 7), jz = hash2(gx, gz, 13);
      const x = gx * 180 + jx * 150;
      const z = gz * 180 + jz * 150;
      const h = groundHeight(x, z);
      if (h < 12 || h > 110) continue; // trees grow on meadow and forest, not shore or rock
      if (runwayDistance(x, z) < 120) continue;
      trees.push({ x, y: h, z, s: 9 + hash2(gx, gz, 21) * 10 });
    }
  }
  return trees;
}
