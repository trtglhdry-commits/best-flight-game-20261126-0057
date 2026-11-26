// main.js — Skyline Courier: boot, the menu / flying / paused / over state
// machine, the frame loop, and the screenshot presets (?shot=cover|rings|
// landing|cockpit) that place the jet in a photogenic spot for the dossier.

import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { newFlight, resetFlight, stepFlight } from './flight.js';
import { MISSIONS, newMissionState, tickMission } from './missions.js';
import { renderWorld } from './render.js';
import { drawHud, drawMenu, drawEndScreen, drawPaused } from './hud.js';
import { groundHeight } from './terrain.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const input = createInput(canvas);
const audio = createAudio();

const game = {
  state: 'menu', // menu | flying | paused | over
  flight: newFlight(),
  missionState: newMissionState(MISSIONS[0]),
  cameraMode: 'chase',
  menuCards: [],
  overTimer: 0,
  time: 0,
  best: 0,
};
try {
  game.best = Number(window.localStorage.getItem('skyline-courier-best') || 0) || 0;
} catch (e) { game.best = 0; }

function saveBest(score) {
  if (score > game.best) {
    game.best = score;
    try { window.localStorage.setItem('skyline-courier-best', String(score)); } catch (e) { /* private mode */ }
  }
}

function startMission(mission) {
  game.flight = newFlight();
  resetFlight(game.flight, mission.start);
  game.flight.fuel = mission.fuelStart;
  if (mission.id === 'landing') {
    game.flight.airborne = true;
    game.flight.onGround = false;
  }
  game.missionState = newMissionState(mission);
  game.state = 'flying';
  game.overTimer = 0;
  audio.ensure();
  audio.click();
}

function toMenu() {
  game.state = 'menu';
  game.flight = newFlight();
  game.missionState = newMissionState(MISSIONS[0]);
}

function endFlight(reason) {
  game.state = 'over';
  game.overTimer = 0;
  saveBest(game.missionState.score);
  if (reason === 'crash') audio.crash();
  else if (reason === 'landed') audio.land();
  else if (reason === 'done') audio.win();
}

// Screenshot presets: real gameplay states, placed for the camera. The flight
// object is replaced by startMission, so each preset reads game.flight after it.
function applyShotPreset(shot) {
  if (shot === 'cover') {
    startMission(MISSIONS[0]);
    // At screenshot time the jet has flown ~180 m on: ring 1 sits ~300 m ahead,
    // just above the nose, with the runway strip below it.
    Object.assign(game.flight, { x: -10, y: 75, z: 20, heading: 0.04, pitch: 0.02, roll: 0.03, speed: 84, throttle: 0.75, airborne: true, onGround: false });
  } else if (shot === 'rings') {
    startMission(MISSIONS[0]);
    // Ends ~250 m out from ring 1, off to its side, ring big and labelled.
    // (The browser takes ~1 s to boot before the 2.5 s wait, so the jet has
    // flown ~250-300 m by the time the shutter falls.)
    Object.assign(game.flight, { x: 72, y: 110, z: -26, heading: 0.1, pitch: 0.0, roll: -0.08, speed: 74, throttle: 0.66, airborne: true, onGround: false });
  } else if (shot === 'landing') {
    startMission(MISSIONS[2]);
    // On final ~100 m short of the threshold: the runway fills the lower frame.
    Object.assign(game.flight, { x: 4, y: 38, z: -700, heading: 0, pitch: -0.04, roll: 0, speed: 64, throttle: 0.32, airborne: true, onGround: false });
    game.missionState.timeLeft = 178;
  } else if (shot === 'cockpit') {
    startMission(MISSIONS[1]);
    Object.assign(game.flight, { x: -300, y: 220, z: 300, heading: -0.7, pitch: 0.02, roll: -0.1, speed: 88, throttle: 0.78, airborne: true, onGround: false });
    game.cameraMode = 'cockpit';
  }
}

function handleKeys() {
  const p = input.pressed;
  if (p.has('KeyM')) audio.toggleMute();
  if (game.state === 'menu') {
    if (p.has('Digit1')) startMission(MISSIONS[0]);
    if (p.has('Digit2')) startMission(MISSIONS[1]);
    if (p.has('Digit3')) startMission(MISSIONS[2]);
    return;
  }
  if (p.has('Escape')) { toMenu(); return; }
  if (p.has('KeyC')) game.cameraMode = game.cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (p.has('KeyP') && game.state === 'flying') game.state = 'paused';
  else if (p.has('KeyP') && game.state === 'paused') game.state = 'flying';
  if (p.has('KeyR')) startMission(game.missionState.mission);
  if (game.state === 'over' && p.has('KeyR')) startMission(game.missionState.mission);
}

canvas.addEventListener('mousedown', (e) => {
  audio.ensure();
  if (game.state !== 'menu') return;
  const r = canvas.getBoundingClientRect();
  const cx = (e.clientX - r.left) * (W / r.width);
  const cy = (e.clientY - r.top) * (H / r.height);
  for (const card of game.menuCards) {
    if (cx >= card.x && cx <= card.x + card.w && cy >= card.y && cy <= card.y + card.h) {
      startMission(card.mission);
      return;
    }
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  game.time += dt;
  input.poll();
  handleKeys();

  if (game.state === 'flying') {
    stepFlight(game.flight, input, dt);
    const ev = tickMission(game.missionState, game.flight, dt);
    audio.setFlight(game.flight.throttle, game.flight.speed, game.flight.airborne);
    if (ev === 'ring') audio.ring();
    else if (ev === 'beacon') audio.beacon();
    else if (ev === 'landed') { audio.land(); game.missionState.messageTimer = 0; game.state = 'over'; saveBest(game.missionState.score); }
    else if (ev === 'done') { audio.win(); game.missionState.messageTimer = 0; game.state = 'over'; saveBest(game.missionState.score); }
    else if (ev === 'crash') { audio.crash(); game.missionState.messageTimer = 0; game.state = 'over'; saveBest(game.missionState.score); }
    else if (ev === 'outoftime' || ev === 'outoffuel') { game.missionState.messageTimer = 0; game.state = 'over'; saveBest(game.missionState.score); }
  }

  ctx.clearRect(0, 0, W, H);
  if (game.state === 'menu') {
    game.menuCards = drawMenu(ctx, W, H, MISSIONS, game.best, game.time);
  } else {
    const { targetScreen } = renderWorld(ctx, W, H, game.flight, game.missionState,
      game.cameraMode, game.time, dt, input);
    void targetScreen;
    drawHud(ctx, W, H, game.flight, game.missionState, game.cameraMode, game.time);
    if (game.state === 'paused') drawPaused(ctx, W, H);
    if (game.state === 'over') drawEndScreen(ctx, W, H, game.missionState, game.flight, game.best);
  }
  input.clearPressed();
  requestAnimationFrame(frame);
}

// Boot: a ?shot= preset jumps straight into a photogenic flight for screenshots.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot && ['cover', 'rings', 'landing', 'cockpit'].includes(shot)) {
  applyShotPreset(shot);
}
requestAnimationFrame(frame);
