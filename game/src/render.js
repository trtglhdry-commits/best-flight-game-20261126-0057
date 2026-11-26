// render.js — everything the eye sees: sky and sun, the ground mesh, the runway,
// rings, buildings, town, trees, clouds, and the aircraft itself in chase or
// cockpit view. All drawing is plain canvas 2D over a software 3D projection.

import { cameraBasis, cameraSpaceToScreen, clamp, lerp, projectPoint, toCameraSpace } from './math3d.js';
import { buildGroundMesh, groundHeight, isWater, treePositions, RUNWAY, WATER_LEVEL } from './terrain.js';
import { BUILDINGS, CLOUDS, townHouses } from './world.js';

const TOWN = townHouses();

export function computeCamera(flight, mode, time) {
  const cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, focal: 620 };
  const fx = Math.sin(flight.heading), fz = Math.cos(flight.heading);
  if (mode === 'cockpit') {
    cam.x = flight.x + fx * 2.5;
    cam.y = flight.y + 1.6;
    cam.z = flight.z + fz * 2.5;
    cam.yaw = flight.heading;
    cam.pitch = flight.pitch;
    cam.roll = flight.roll * 0.85;
  } else {
    // Chase camera: behind and above the tail, banking gently with the jet.
    const back = 15, up = 5.2;
    cam.x = flight.x - fx * back;
    cam.y = flight.y + up + Math.sin(time * 0.8) * 0.08;
    cam.z = flight.z - fz * back;
    cam.yaw = flight.heading;
    cam.pitch = flight.pitch * 0.7 - 0.045;
    cam.roll = flight.roll * 0.5;
  }
  return cam;
}

function drawSky(ctx, W, H, cam) {
  const cx = W / 2, cy = H / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(cam.roll);
  const horizonY = Math.tan(cam.pitch) * cam.focal;
  const g = ctx.createLinearGradient(0, -H, 0, H * 1.4);
  g.addColorStop(0, '#2a6cb0');
  g.addColorStop(0.38, '#6fa8d8');
  g.addColorStop(0.5, '#cfe6f2');
  g.addColorStop(0.52, '#b9ccd8');
  g.addColorStop(1, '#a9c2d4');
  ctx.fillStyle = g;
  ctx.fillRect(-W, -H * 2, W * 2, H * 4);
  // Sun glow, low in the west.
  const sunDir = { x: -0.55, y: 0.30, z: -0.78 };
  const sp = projectPoint(cam, cameraBasis(cam),
    cam.x + sunDir.x * 4000, cam.y + sunDir.y * 4000, cam.z + sunDir.z * 4000, { x: cx, y: cy });
  if (sp) {
    const sg = ctx.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 150);
    sg.addColorStop(0, 'rgba(255,244,200,0.95)');
    sg.addColorStop(0.25, 'rgba(255,226,150,0.55)');
    sg.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 150, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 26, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return horizonY;
}

const NEAR = 2.5;

// Clip a polygon (camera-space points) against the near plane z = NEAR, so a
// quad the camera is flying over keeps its visible part instead of vanishing
// whole. Returns the clipped points in camera space, or [] when fully behind.
function clipNearPlane(pts) {
  const res = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
    const curIn = cur.z >= NEAR, prevIn = prev.z >= NEAR;
    if (curIn) {
      if (!prevIn) res.push(nearIntersect(prev, cur));
      res.push(cur);
    } else if (prevIn) {
      res.push(nearIntersect(prev, cur));
    }
  }
  return res;
}

function nearIntersect(a, b) {
  const t = (NEAR - a.z) / (b.z - a.z);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR };
}

// Begin a canvas path for a world-space polygon, clipped at the near plane.
// Returns false when nothing of it is visible.
function clippedPath(ctx, cam, basis, centre, pts) {
  const cs = pts.map((p) => toCameraSpace(cam, basis, p.x, p.y, p.z));
  const clipped = clipNearPlane(cs);
  if (clipped.length < 3) return false;
  const s = clipped.map((c) => cameraSpaceToScreen(cam, c, centre));
  ctx.beginPath();
  ctx.moveTo(s[0].x, s[0].y);
  for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
  ctx.closePath();
  return true;
}

function drawGround(ctx, cam, basis, centre) {
  const quads = buildGroundMesh(cam);
  for (const q of quads) {
    ctx.fillStyle = q.colour;
    if (clippedPath(ctx, cam, basis, centre, [q.a, q.b, q.c, q.d])) ctx.fill();
  }
}

function quadPath(ctx, cam, basis, centre, pts) {
  const p = pts.map((q) => projectPoint(cam, basis, q.x, q.y, q.z, centre));
  if (p.some((v) => !v)) return null;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
  return p;
}

function drawRunway(ctx, cam, basis, centre) {
  // The asphalt in 60 m segments, clipped at the near plane: a single quad
  // would vanish whole whenever one of its corners fell behind the camera
  // (the jet sits on the runway, so that is most of the time).
  const g = (x, zz) => ({ x, y: groundHeight(x, zz) + 0.4, z: zz });
  for (let z = RUNWAY.z0; z < RUNWAY.z1; z += 60) {
    const z2 = Math.min(z + 60, RUNWAY.z1);
    if (clippedPath(ctx, cam, basis, centre,
      [g(-RUNWAY.halfWidth, z), g(RUNWAY.halfWidth, z),
       g(RUNWAY.halfWidth, z2), g(-RUNWAY.halfWidth, z2)])) {
      ctx.fillStyle = '#3b4046';
      ctx.fill();
    }
  }
  // Centreline dashes and edge lines.
  ctx.fillStyle = '#f2f2ea';
  for (let z = RUNWAY.z0 + 40; z < RUNWAY.z1 - 20; z += 70) {
    if (clippedPath(ctx, cam, basis, centre,
      [g(-1.2, z), g(1.2, z), g(1.2, z + 26), g(-1.2, z + 26)])) ctx.fill();
  }
  // Threshold bars at both ends.
  for (const zEnd of [RUNWAY.z0 + 8, RUNWAY.z1 - 26]) {
    for (let i = -3; i <= 3; i++) {
      const x0 = i * 5 - 1.4;
      if (clippedPath(ctx, cam, basis, centre,
        [g(x0, zEnd), g(x0 + 2.8, zEnd), g(x0 + 2.8, zEnd + 16), g(x0, zEnd + 16)])) ctx.fill();
    }
  }
  // Edge lights: amber dots along both edges.
  for (let z = RUNWAY.z0; z <= RUNWAY.z1; z += 80) {
    for (const x of [-RUNWAY.halfWidth + 1, RUNWAY.halfWidth - 1]) {
      const s = projectPoint(cam, basis, x, groundHeight(x, z) + 1, z, centre);
      if (!s || s.x < -20 || s.x > centre.x * 2 + 20 || s.y < -20 || s.y > centre.y * 2 + 20) continue;
      const r = clamp(3.2 * s.scale / 10, 1, 5);
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// A target ring: a glowing circle in a vertical plane that faces the camera,
// so it always reads as a ring from the pilot's seat.
function drawRing(ctx, cam, basis, centre, ring, isNext, time, label) {
  const c = projectPoint(cam, basis, ring.x, ring.y, ring.z, centre);
  if (!c) return null;
  const rPx = ring.r * c.scale;
  if (rPx < 2) return c;
  const pulse = isNext ? 1 + Math.sin(time * 5) * 0.05 : 1;
  const rr = rPx * pulse;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = isNext ? '#ff7a1a' : 'rgba(255,122,26,0.45)';
  ctx.lineWidth = clamp(rr * 0.14, 2, 14);
  ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = isNext ? '#ffffff' : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = clamp(rr * 0.045, 1, 4);
  ctx.beginPath(); ctx.arc(c.x, c.y, rr * 0.82, 0, Math.PI * 2); ctx.stroke();
  // Beacon lights around the ring.
  ctx.fillStyle = isNext ? '#ffd23e' : 'rgba(255,210,62,0.5)';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + time * 0.6;
    ctx.beginPath();
    ctx.arc(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, clamp(rr * 0.07, 2, 7), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (label) {
    ctx.save();
    ctx.font = `bold ${clamp(rr * 0.22, 11, 22)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,25,40,0.75)';
    const tw = ctx.measureText(label).width;
    ctx.fillRect(c.x - tw / 2 - 8, c.y - rr - 30, tw + 16, 24);
    ctx.fillStyle = '#ffe9c4';
    ctx.fillText(label, c.x, c.y - rr - 12);
    ctx.restore();
  }
  return c;
}

function drawBox(ctx, cam, basis, centre, b) {
  const y0 = groundHeight(b.x, b.z);
  const hw = b.w / 2, hd = b.d / 2;
  const corners = [
    { x: b.x - hw, y: y0, z: b.z - hd }, { x: b.x + hw, y: y0, z: b.z - hd },
    { x: b.x + hw, y: y0, z: b.z + hd }, { x: b.x - hw, y: y0, z: b.z + hd },
    { x: b.x - hw, y: y0 + b.h, z: b.z - hd }, { x: b.x + hw, y: y0 + b.h, z: b.z - hd },
    { x: b.x + hw, y: y0 + b.h, z: b.z + hd }, { x: b.x - hw, y: y0 + b.h, z: b.z + hd },
  ];
  const toCam = { x: cam.x - b.x, z: cam.z - b.z };
  // Draw the faces turned toward the camera, then the roof.
  const faces = [];
  if (toCam.z < 0) faces.push({ idx: [0, 1, 5, 4], shade: 0.82 }); // -z face
  else faces.push({ idx: [3, 2, 6, 7], shade: 0.82 });            // +z face
  if (toCam.x < 0) faces.push({ idx: [0, 3, 7, 4], shade: 0.66 }); // -x face
  else faces.push({ idx: [1, 2, 6, 5], shade: 0.66 });            // +x face
  faces.push({ idx: [4, 5, 6, 7], shade: 1 });                     // roof
  for (const face of faces) {
    const pts = face.idx.map((i) => corners[i]);
    const p = quadPath(ctx, cam, basis, centre, pts);
    if (!p) continue;
    const base = face.idx[0] >= 4 ? (b.roof || '#888888') : b.colour;
    ctx.fillStyle = shadeColour(base, face.shade);
    ctx.fill();
  }
}

export function shadeColour(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function drawTrees(ctx, cam, basis, centre) {
  const trees = treePositions(cam);
  let drawn = 0;
  for (const t of trees) {
    if (drawn > 90) break;
    const s = projectPoint(cam, basis, t.x, t.y, t.z, centre);
    if (!s) continue;
    const hPx = t.s * s.scale;
    if (hPx < 3 || hPx > 260) continue;
    if (s.x < -30 || s.x > centre.x * 2 + 30 || s.y < -40 || s.y > centre.y * 2 + 40) continue;
    const wPx = hPx * 0.45;
    ctx.fillStyle = '#2d5a2e';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - hPx);
    ctx.lineTo(s.x - wPx, s.y);
    ctx.lineTo(s.x + wPx, s.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a6e35';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - hPx * 1.15);
    ctx.lineTo(s.x - wPx * 0.7, s.y - hPx * 0.45);
    ctx.lineTo(s.x + wPx * 0.7, s.y - hPx * 0.45);
    ctx.closePath(); ctx.fill();
    drawn++;
  }
}

function drawClouds(ctx, cam, basis, centre, dt) {
  for (const cl of CLOUDS) {
    cl.x += cl.drift * dt;
    if (cl.x > 3600) cl.x = -3600;
    const s = projectPoint(cam, basis, cl.x, cl.y, cl.z, centre);
    if (!s) continue;
    const r = cl.s * s.scale;
    if (r < 4 || r > 500) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(s.x - r * 0.55, s.y + r * 0.08, r * 0.6, r * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(s.x + r * 0.55, s.y + r * 0.06, r * 0.62, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The jet, drawn from behind and above in chase view: a built aircraft, not a
// triangle — fuselage, swept wings, tailplane, fin, twin nacelles and canopy.
export function drawAircraft(ctx, W, H, flight, input, time) {
  const s = H / 720;
  const px = W / 2;
  const py = H * 0.60 - flight.pitch * 30 * s;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(flight.roll);
  ctx.scale(s, s);
  const bob = Math.sin(time * 2.1) * 1.2 * (flight.airborne ? 1 : 0);
  ctx.translate(0, bob);
  const thr = flight.throttle;
  // Exhaust glow, kept subtle so it reads as heat, not cargo.
  ctx.fillStyle = `rgba(255,140,40,${0.15 + thr * 0.35})`;
  for (const ex of [-38, 38]) {
    ctx.beginPath();
    ctx.ellipse(ex, 32 + thr * 6, 6, 8 + thr * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tailplane.
  ctx.fillStyle = '#1d7a72';
  ctx.beginPath();
  ctx.moveTo(-8, 42); ctx.lineTo(-62, 66); ctx.lineTo(-58, 76); ctx.lineTo(-6, 62);
  ctx.moveTo(8, 42); ctx.lineTo(62, 66); ctx.lineTo(58, 76); ctx.lineTo(6, 62);
  ctx.fill();
  // Main wings, swept back, with orange tips and nav lights.
  const aileron = (input.roll || 0) * 4;
  ctx.fillStyle = '#1e8a80';
  ctx.beginPath();
  ctx.moveTo(-14, -28); ctx.lineTo(-128, 6 + aileron); ctx.lineTo(-122, 24 + aileron); ctx.lineTo(-12, 8);
  ctx.moveTo(14, -28); ctx.lineTo(128, 6 - aileron); ctx.lineTo(122, 24 - aileron); ctx.lineTo(12, 8);
  ctx.fill();
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(-128, 6 + aileron); ctx.lineTo(-112, 3 + aileron); ctx.lineTo(-108, 19 + aileron); ctx.lineTo(-122, 24 + aileron);
  ctx.moveTo(128, 6 - aileron); ctx.lineTo(112, 3 - aileron); ctx.lineTo(108, 19 - aileron); ctx.lineTo(122, 24 - aileron);
  ctx.fill();
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath(); ctx.arc(-126, 15 + aileron, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#35e05a';
  ctx.beginPath(); ctx.arc(126, 15 - aileron, 3.4, 0, Math.PI * 2); ctx.fill();
  // Engine nacelles under the wings.
  for (const ex of [-38, 38]) {
    const g = ctx.createLinearGradient(ex - 8, 0, ex + 8, 0);
    g.addColorStop(0, '#274b5a'); g.addColorStop(0.5, '#3f7d92'); g.addColorStop(1, '#1c3642');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(ex, 12, 9, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101c22';
    ctx.beginPath(); ctx.ellipse(ex, 28, 6.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,170,60,${0.5 + thr * 0.5})`;
    ctx.beginPath(); ctx.ellipse(ex, 28, 3.5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Fuselage: tapered body with a teal top, darker keel and orange cheatline.
  const fg = ctx.createLinearGradient(-14, 0, 14, 0);
  fg.addColorStop(0, '#1b6f68'); fg.addColorStop(0.5, '#2fa89b'); fg.addColorStop(1, '#1b6f68');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(0, -108);
  ctx.bezierCurveTo(10, -92, 14, -60, 15, -20);
  ctx.bezierCurveTo(15, 20, 12, 48, 8, 66);
  ctx.lineTo(-8, 66);
  ctx.bezierCurveTo(-12, 48, -15, 20, -15, -20);
  ctx.bezierCurveTo(-14, -60, -10, -92, 0, -108);
  ctx.fill();
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-13, -30); ctx.quadraticCurveTo(-14, 10, -9, 58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(13, -30); ctx.quadraticCurveTo(14, 10, 9, 58); ctx.stroke();
  // Canopy: glossy hump just behind the nose.
  const cg = ctx.createLinearGradient(0, -78, 0, -44);
  cg.addColorStop(0, '#dff2fb'); cg.addColorStop(0.5, '#7fb8d8'); cg.addColorStop(1, '#2c5a78');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(0, -60, 8.5, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.ellipse(-2.5, -66, 2.4, 6, -0.2, 0, Math.PI * 2); ctx.fill();
  // Vertical fin, rising from the tail.
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(-5, 46); ctx.lineTo(-4, 84); ctx.lineTo(0, 92); ctx.lineTo(4, 84); ctx.lineTo(5, 46);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d7a72';
  ctx.beginPath();
  ctx.moveTo(-5, 46); ctx.lineTo(-4, 84); ctx.lineTo(0, 84); ctx.lineTo(0, 46);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Cockpit view: glareshield, nose, window pillars and the panel with a live
// attitude gauge, so the instruments look flown rather than drawn.
export function drawCockpit(ctx, W, H, flight, time) {
  const s = H / 720;
  ctx.save();
  // Nose cone over the horizon.
  ctx.fillStyle = '#2fa89b';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90 * s, H * 0.66);
  ctx.quadraticCurveTo(W / 2, H * 0.60 - flight.pitch * 20, W / 2 + 90 * s, H * 0.66);
  ctx.lineTo(W / 2 + 46 * s, H * 0.72);
  ctx.lineTo(W / 2 - 46 * s, H * 0.72);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(W / 2 - 46 * s, H * 0.72); ctx.lineTo(W / 2 + 46 * s, H * 0.72); ctx.stroke();
  // Window pillars, slim so they frame the view instead of eating it.
  ctx.fillStyle = '#141c26';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W * 0.045, 0); ctx.lineTo(W * 0.085, H * 0.62); ctx.lineTo(0, H * 0.66);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0); ctx.lineTo(W * 0.955, 0); ctx.lineTo(W * 0.915, H * 0.62); ctx.lineTo(W, H * 0.66);
  ctx.closePath(); ctx.fill();
  // Instrument panel.
  const pg = ctx.createLinearGradient(0, H * 0.68, 0, H);
  pg.addColorStop(0, '#232f3f'); pg.addColorStop(1, '#10161f');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.70);
  ctx.quadraticCurveTo(W / 2, H * 0.64, W, H * 0.70);
  ctx.lineTo(W, H); ctx.lineTo(0, H);
  ctx.closePath(); ctx.fill();
  // Attitude gauge on the panel: a real horizon ball that banks and pitches.
  const gx = W / 2, gy = H * 0.85, gr = 52 * s;
  ctx.save();
  ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.clip();
  ctx.translate(gx, gy);
  ctx.rotate(flight.roll);
  ctx.translate(0, flight.pitch * gr * 1.4);
  ctx.fillStyle = '#3f8fd2'; ctx.fillRect(-gr, -gr * 2, gr * 2, gr * 2);
  ctx.fillStyle = '#8a5a32'; ctx.fillRect(-gr, 0, gr * 2, gr * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-gr, -1.5, gr * 2, 3);
  ctx.restore();
  ctx.strokeStyle = '#d8dee6'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath(); ctx.moveTo(gx - 8, gy - 2); ctx.lineTo(gx + 8, gy - 2); ctx.lineTo(gx, gy + 6); ctx.closePath(); ctx.fill();
  // Panel labels.
  ctx.fillStyle = '#9fb4c6';
  ctx.font = `bold ${12 * s}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', gx, gy + gr + 18 * s);
  ctx.restore();
}

// Full frame: returns the camera and the projected screen position of the
// current target (or null), for the HUD's off-screen arrow.
export function renderWorld(ctx, W, H, flight, missionState, mode, time, dt, input) {
  const centre = { x: W / 2, y: H / 2 };
  const cam = computeCamera(flight, mode, time);
  const basis = cameraBasis(cam);
  drawSky(ctx, W, H, cam);
  drawClouds(ctx, cam, basis, centre, dt);
  drawGround(ctx, cam, basis, centre);
  drawRunway(ctx, cam, basis, centre);
  for (const b of BUILDINGS) drawBox(ctx, cam, basis, centre, b);
  for (const h of TOWN) drawBox(ctx, cam, basis, centre, { ...h, h: h.hgt, roof: '#7a4a38' });
  drawTrees(ctx, cam, basis, centre);
  let targetScreen = null;
  if (missionState && !missionState.done && !missionState.failed) {
    missionState.targets.forEach((t, i) => {
      if (t.hit) return;
      const isNext = missionState.targets.findIndex((u) => !u.hit) === i;
      const label = isNext
        ? (missionState.mission.id === 'courier' ? `${t.name} — ${Math.round(Math.hypot(t.x - flight.x, t.y - flight.y, t.z - flight.z))} m` : `RING ${i + 1}/8`)
        : null;
      const scr = drawRing(ctx, cam, basis, centre, t, isNext, time, label);
      if (isNext) targetScreen = scr;
    });
  }
  if (mode === 'cockpit') drawCockpit(ctx, W, H, flight, time);
  else drawAircraft(ctx, W, H, flight, input || { roll: 0 }, time);
  return { cam, targetScreen };
}
