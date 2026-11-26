// hud.js — the instruments and the screens: airspeed and altitude tapes, the
// heading compass, throttle and fuel, the artificial horizon, the mission
// panel, warnings, and the menu / end-of-flight screens. Everything is drawn
// on the same canvas as the world, so a screenshot always shows the full HUD.

import { clamp, lerp } from './math3d.js';
import { feet, headingDegrees, knots } from './flight.js';
import { missionObjectiveText } from './missions.js';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

function panel(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = `rgba(8,18,30,${alpha ?? 0.62})`;
  ctx.strokeStyle = 'rgba(160,200,230,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill(); ctx.stroke();
}

function bigNum(ctx, text, x, y, size, colour, align) {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colour || '#eaf4fb';
  ctx.fillText(text, x, y);
}

function label(ctx, text, x, y, size, colour, align) {
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = align || 'left';
  ctx.fillStyle = colour || '#9fc3dd';
  ctx.fillText(text, x, y);
}

function bar(ctx, x, y, w, h, frac, colour, bg) {
  ctx.fillStyle = bg || 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

function compassName(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}

export function drawHud(ctx, W, H, flight, ms, mode, time) {
  const s = H / 720;
  ctx.save();

  // --- Top centre: heading compass tape ---
  const hdg = headingDegrees(flight);
  const cw = 340 * s, ch = 44 * s, cx = W / 2 - cw / 2, cy = 14 * s;
  panel(ctx, cx, cy, cw, ch, 0.85);
  ctx.save();
  ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
  for (let d = -60; d <= 60; d += 5) {
    const deg = Math.round((hdg + d) / 5) * 5;
    const norm = ((deg % 360) + 360) % 360;
    const x = W / 2 + d * 2.6 * s;
    const major = norm % 30 === 0;
    ctx.strokeStyle = major ? '#eaf4fb' : 'rgba(234,244,251,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, cy + ch - 8 * s); ctx.lineTo(x, cy + ch - (major ? 20 : 13) * s); ctx.stroke();
    if (major) {
      const txt = norm % 90 === 0 ? compassName(norm) : String(norm).padStart(3, '0');
      label(ctx, txt, x, cy + 16 * s, 12 * s, '#eaf4fb', 'center');
    }
  }
  ctx.restore();
  // Centre caret + readout.
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 7 * s, cy + ch - 2 * s); ctx.lineTo(W / 2 + 7 * s, cy + ch - 2 * s);
  ctx.lineTo(W / 2, cy + ch - 12 * s); ctx.closePath(); ctx.fill();
  // Heading readout with a dark edge so it stays legible over bright cloud.
  ctx.font = `bold ${17 * s}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(8,18,30,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeText(String(Math.round(hdg)).padStart(3, '0') + '°', W / 2, cy + ch + 24 * s);
  bigNum(ctx, String(Math.round(hdg)).padStart(3, '0') + '°', W / 2, cy + ch + 24 * s, 17 * s, '#ffffff', 'center');

  // --- Top left: airspeed ---
  panel(ctx, 14 * s, 14 * s, 168 * s, 86 * s, 0.62);
  label(ctx, 'AIRSPEED', 26 * s, 34 * s, 12 * s);
  bigNum(ctx, String(Math.round(knots(flight))), 26 * s, 74 * s, 34 * s);
  label(ctx, 'KT', 150 * s, 72 * s, 13 * s, '#9fc3dd', 'right');
  bar(ctx, 26 * s, 82 * s, 144 * s, 5 * s, knots(flight) / 240, '#35c4b5');

  // --- Top right: altitude + vertical speed ---
  panel(ctx, W - 182 * s, 14 * s, 168 * s, 86 * s, 0.62);
  label(ctx, 'ALTITUDE', W - 170 * s, 34 * s, 12 * s);
  bigNum(ctx, String(Math.round(feet(flight))).replace(/\B(?=(\d{3})+(?!\d))/g, ','), W - 170 * s, 74 * s, 30 * s);
  label(ctx, 'FT', W - 26 * s, 72 * s, 13 * s, '#9fc3dd', 'right');
  const vs = flight.verticalSpeed * 196.85; // ft/min
  label(ctx, (vs >= 0 ? '▲ +' : '▼ ') + Math.abs(Math.round(vs)) + ' FT/MIN', W - 170 * s, 92 * s, 11 * s,
    Math.abs(vs) > 1200 ? '#ffb347' : '#9fc3dd');

  // --- Bottom left: throttle + fuel ---
  panel(ctx, 14 * s, H - 118 * s, 200 * s, 104 * s, 0.62);
  label(ctx, 'THROTTLE', 26 * s, H - 96 * s, 12 * s);
  bar(ctx, 26 * s, H - 88 * s, 176 * s, 12 * s, flight.throttle,
    flight.throttle > 0.85 ? '#ff7a1a' : '#35c4b5');
  bigNum(ctx, Math.round(flight.throttle * 100) + '%', 26 * s, H - 44 * s, 20 * s, '#eaf4fb');
  label(ctx, 'FUEL', 26 * s, H - 28 * s, 12 * s);
  const lowFuel = flight.fuel < 20;
  bar(ctx, 78 * s, H - 38 * s, 124 * s, 10 * s, flight.fuel / 100,
    lowFuel ? (Math.sin(time * 8) > 0 ? '#ff3b30' : '#ff7a1a') : '#7fd07f');
  bigNum(ctx, Math.round(flight.fuel) + '', 202 * s, H - 28 * s, 13 * s, lowFuel ? '#ff6b5e' : '#eaf4fb', 'right');

  // --- Bottom right: mission panel ---
  const mw = 250 * s;
  panel(ctx, W - mw - 14 * s, H - 118 * s, mw, 104 * s, 0.62);
  label(ctx, ms.mission.name, W - mw + 12 * s, H - 96 * s, 13 * s, '#ffd23e');
  label(ctx, missionObjectiveText(ms), W - mw + 12 * s, H - 74 * s, 13 * s, '#eaf4fb');
  const mm = Math.floor(ms.timeLeft / 60), ss = Math.floor(ms.timeLeft % 60);
  bigNum(ctx, `${mm}:${String(ss).padStart(2, '0')}`, W - mw + 12 * s, H - 40 * s, 26 * s,
    ms.timeLeft < 30 ? '#ff6b5e' : '#eaf4fb');
  label(ctx, 'SCORE', W - 84 * s, H - 40 * s, 11 * s, '#9fc3dd', 'right');
  bigNum(ctx, String(ms.score), W - 26 * s, H - 40 * s, 22 * s, '#ffd23e', 'right');
  label(ctx, `CAM ${mode === 'cockpit' ? 'COCKPIT' : 'CHASE'} [C]`, W - mw + 12 * s, H - 22 * s, 10 * s, '#7ea8c4');

  // --- Bottom centre: artificial horizon (mini). The cockpit view already
  // carries a live gauge on its panel, so it is hidden there.
  if (mode !== 'cockpit') {
    const hx = W / 2, hy = H - 62 * s, hr = 34 * s;
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(flight.roll);
    ctx.translate(0, flight.pitch * hr * 1.1);
    ctx.fillStyle = '#3f8fd2'; ctx.fillRect(-hr, -hr * 2, hr * 2, hr * 2);
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(-hr, 0, hr * 2, hr * 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(-hr, -1.5, hr * 2, 3);
    ctx.restore();
    ctx.strokeStyle = 'rgba(216,222,230,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.moveTo(hx - 6, hy); ctx.lineTo(hx + 6, hy); ctx.lineTo(hx, hy + 5); ctx.closePath(); ctx.fill();
  }

  // --- Centre: flight-path crosshair ---
  ctx.strokeStyle = 'rgba(234,244,251,0.85)';
  ctx.lineWidth = 1.6;
  const chX = W / 2, chY = H * 0.44;
  ctx.beginPath();
  ctx.moveTo(chX - 12 * s, chY); ctx.lineTo(chX + 12 * s, chY);
  ctx.moveTo(chX, chY - 12 * s); ctx.lineTo(chX, chY + 12 * s);
  ctx.stroke();

  // --- Warnings ---
  let warn = null, warnColour = '#ff3b30';
  if (flight.stalled) warn = 'STALL — NOSE DOWN, ADD POWER';
  else if (flight.fuel > 0 && flight.fuel < 15) { warn = 'LOW FUEL'; warnColour = '#ffb347'; }
  else if (flight.airborne && flight.y - 8 < 60 && flight.verticalSpeed < -3) warn = 'PULL UP — TERRAIN';
  if (warn && Math.sin(time * 10) > -0.2) {
    ctx.font = `bold ${22 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = warnColour;
    ctx.fillText(warn, W / 2, H * 0.24);
  }

  // --- Mission flash message ---
  if (ms.messageTimer > 0 && ms.message) {
    const a = clamp(ms.messageTimer, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = `bold ${26 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0b1622';
    const tw = ctx.measureText(ms.message).width;
    ctx.fillRect(W / 2 - tw / 2 - 16, H * 0.30 - 26 * s, tw + 32, 40 * s);
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(ms.message, W / 2, H * 0.30 + 4 * s);
    ctx.globalAlpha = 1;
  }

  // --- Off-screen target arrow ---
  ctx.restore();
}

export function drawMenu(ctx, W, H, missions, best, time) {
  const s = H / 720;
  ctx.save();
  // Backdrop: deep sky with drifting light.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#12365e'); g.addColorStop(0.55, '#3f7fb5'); g.addColorStop(1, '#8fb8d4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 5; i++) {
    const cx = ((time * 12 * (i + 1)) % (W + 400)) - 200;
    ctx.beginPath(); ctx.ellipse(cx, 90 * s + i * 90 * s, 130, 22, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Title.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23e';
  ctx.font = `bold ${64 * s}px ${FONT}`;
  ctx.fillText('SKYLINE COURIER', W / 2, 128 * s);
  ctx.fillStyle = '#eaf4fb';
  ctx.font = `600 ${22 * s}px ${FONT}`;
  ctx.fillText('ALPINE AIR MAIL  •  an original flight game', W / 2, 162 * s);
  ctx.fillStyle = '#bcd8ea';
  ctx.font = `400 ${15 * s}px ${FONT}`;
  ctx.fillText('Fly the valley, thread the rings, deliver the parcels, and bring her home to runway 36.',
    W / 2, 192 * s);

  // Mission cards.
  const cardW = 300 * s, cardH = 196 * s, gap = 24 * s;
  const totalW = cardW * 3 + gap * 2;
  const x0 = (W - totalW) / 2, y0 = 236 * s;
  const cards = [];
  missions.forEach((m, i) => {
    const x = x0 + i * (cardW + gap);
    const hover = false;
    ctx.fillStyle = 'rgba(8,18,30,0.72)';
    ctx.strokeStyle = hover ? '#ffd23e' : 'rgba(160,200,230,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y0, cardW, cardH, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.font = `bold ${15 * s}px ${FONT}`;
    ctx.fillText(`MISSION ${m.num}  —  PRESS ${m.num}`, x + cardW / 2, y0 + 34 * s);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${27 * s}px ${FONT}`;
    ctx.fillText(m.name, x + cardW / 2, y0 + 74 * s);
    ctx.fillStyle = '#9fc3dd';
    ctx.font = `600 ${15 * s}px ${FONT}`;
    ctx.fillText(m.tag, x + cardW / 2, y0 + 100 * s);
    ctx.fillStyle = '#d7e6f0';
    ctx.font = `400 ${13.5 * s}px ${FONT}`;
    wrapText(ctx, m.blurb, x + cardW / 2, y0 + 124 * s, cardW - 36 * s, 18 * s);
    ctx.fillStyle = '#ffd23e';
    ctx.font = `600 ${13 * s}px ${FONT}`;
    ctx.fillText(`TIME ${Math.floor(m.timeLimit / 60)}:${String(m.timeLimit % 60).padStart(2, '0')}   •   CLICK TO FLY`,
      x + cardW / 2, y0 + cardH - 18 * s);
    cards.push({ x, y: y0, w: cardW, h: cardH, mission: m });
  });

  // Controls strip.
  ctx.fillStyle = 'rgba(8,18,30,0.55)';
  ctx.beginPath(); ctx.roundRect(W / 2 - 470 * s, 470 * s, 940 * s, 96 * s, 10); ctx.fill();
  ctx.fillStyle = '#eaf4fb';
  ctx.font = `600 ${15 * s}px ${FONT}`;
  ctx.fillText('FLY IT', W / 2, 496 * s);
  ctx.fillStyle = '#bcd8ea';
  ctx.font = `400 ${14 * s}px ${FONT}`;
  ctx.fillText('↑ ↓ pitch   •   ← → bank & turn   •   SHIFT throttle up   •   CTRL throttle down   •   SPACE airbrake', W / 2, 522 * s);
  ctx.fillText('Mouse: hold & drag to steer   •   C camera   •   P pause   •   R restart   •   M sound   •   ESC menu', W / 2, 544 * s);
  if (best > 0) {
    ctx.fillStyle = '#ffd23e';
    ctx.font = `bold ${15 * s}px ${FONT}`;
    ctx.fillText(`BEST SCORE SO FAR: ${best}`, W / 2, 596 * s);
  }
  ctx.fillStyle = 'rgba(188,216,234,0.8)';
  ctx.font = `400 ${12 * s}px ${FONT}`;
  ctx.fillText('100% original — code, art, sounds and the valley itself, built for this bounty. No network, no downloads.',
    W / 2, H - 24 * s);
  ctx.restore();
  return cards;
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy); yy += lineH; line = w;
    } else line = test;
  }
  if (line) ctx.fillText(line, cx, yy);
}

export function drawEndScreen(ctx, W, H, ms, flight, best) {
  const s = H / 720;
  ctx.save();
  ctx.fillStyle = 'rgba(6,14,24,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  const win = ms.done;
  ctx.fillStyle = win ? '#7fd07f' : '#ff6b5e';
  ctx.font = `bold ${46 * s}px ${FONT}`;
  ctx.fillText(win ? 'SORTIE COMPLETE' : 'SORTIE OVER', W / 2, 190 * s);
  ctx.fillStyle = '#eaf4fb';
  ctx.font = `400 ${19 * s}px ${FONT}`;
  ctx.fillText(ms.endReason, W / 2, 232 * s);
  ctx.fillStyle = '#ffd23e';
  ctx.font = `bold ${58 * s}px ${FONT}`;
  ctx.fillText(String(ms.score), W / 2, 320 * s);
  ctx.fillStyle = '#9fc3dd';
  ctx.font = `600 ${16 * s}px ${FONT}`;
  ctx.fillText('SCORE', W / 2, 346 * s);
  ctx.fillStyle = '#d7e6f0';
  ctx.font = `400 ${16 * s}px ${FONT}`;
  const dist = (flight.distanceFlown / 1000).toFixed(1);
  ctx.fillText(`Distance flown ${dist} km   •   Fuel left ${Math.round(flight.fuel)}%   •   Best ${Math.max(best, ms.score)}`,
    W / 2, 396 * s);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${18 * s}px ${FONT}`;
  ctx.fillText('Press R to fly again, or ESC for the mission board', W / 2, 460 * s);
  ctx.restore();
}

export function drawPaused(ctx, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,14,24,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf4fb';
  ctx.font = `bold ${40}px ${FONT}`;
  ctx.fillText('PAUSED', W / 2, H / 2 - 10);
  ctx.font = `400 ${17}px ${FONT}`;
  ctx.fillStyle = '#bcd8ea';
  ctx.fillText('P to resume  •  R to restart  •  ESC for the mission board', W / 2, H / 2 + 28);
  ctx.restore();
}
