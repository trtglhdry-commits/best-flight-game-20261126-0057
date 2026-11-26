// math3d.js — small camera-space projection helpers for the software 3D renderer.
// World: x east, z north, y up, metres. Heading 0 faces +z (north).
// A camera has a position and yaw / pitch / roll; project() maps a world point to
// screen pixels, returning null when the point is behind the near plane.

export function makeCamera() {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, focal: 600 };
}

export function cameraBasis(cam) {
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  // Forward, right and up unit vectors of the camera.
  return {
    fx: sy * cp, fy: sp, fz: cy * cp,
    rx: cy, ry: 0, rz: -sy,
    ux: -sy * sp, uy: cp, uz: -cy * sp,
  };
}

// Project a world point into camera space. Returns {x, y, z} in camera space
// (z = distance straight ahead), even for points behind the camera: callers
// that need clipping (the ground mesh) use the raw coordinates.
export function toCameraSpace(cam, basis, px, py, pz) {
  const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
  const f = dx * basis.fx + dy * basis.fy + dz * basis.fz;
  const r = dx * basis.rx + dy * basis.ry + dz * basis.rz;
  const u = dx * basis.ux + dy * basis.uy + dz * basis.uz;
  return { x: r, y: u, z: f };
}

// Camera-space point to screen pixels (roll applied around the centre).
export function cameraSpaceToScreen(cam, c, centre) {
  const s = cam.focal / c.z;
  let sx = c.x * s;
  let sy = -c.y * s;
  if (cam.roll !== 0) {
    const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
    const rx = sx * cr - sy * sr;
    const ry = sx * sr + sy * cr;
    sx = rx; sy = ry;
  }
  return { x: centre.x + sx, y: centre.y + sy, depth: c.z, scale: s };
}

// Project a world point to screen pixels. centre is the screen centre {x, y}.
// Roll is applied as a rotation of the screen point around the centre, so a
// banking camera tilts the whole world like a real chase camera does.
export function projectPoint(cam, basis, px, py, pz, centre) {
  const c = toCameraSpace(cam, basis, px, py, pz);
  if (!c || c.z < 2.5) return null;
  return cameraSpaceToScreen(cam, c, centre);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Deterministic 1D hash -> [0, 1) for a pair of integer lattice coords.
export function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634239) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
