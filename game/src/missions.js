// missions.js — the three sorties, their goals, timers, scoring and the
// verdicts on landings and crashes. A mission is a small state machine the
// main loop ticks every frame.

import { RING_COURSE, COURIER_BEACONS } from './world.js';
import { RUNWAY } from './terrain.js';

export const MISSIONS = [
  {
    id: 'rings', num: 1, name: 'RING RUN', tag: 'Thread the valley',
    blurb: 'Fly through all 8 rings before the clock runs out. Tight turns beat raw speed.',
    timeLimit: 165, fuelStart: 100,
    start: { x: 0, y: 10, z: -300, heading: 0, speed: 0, throttle: 0 },
  },
  {
    id: 'courier', num: 2, name: 'COURIER RUN', tag: 'Five parcels, one tank',
    blurb: 'Deliver to all 5 beacons across the valley. Full throttle drinks fuel — cruise smart.',
    timeLimit: 300, fuelStart: 100,
    start: { x: 0, y: 10, z: -300, heading: 0, speed: 0, throttle: 0 },
  },
  {
    id: 'landing', num: 3, name: 'RUNWAY LANDING', tag: 'Bring her home',
    blurb: 'Short final at 500 ft. Land on runway 36: gentle, slow, on the centreline.',
    timeLimit: 240, fuelStart: 80,
    start: { x: 0, y: 150, z: -1100, heading: 0, speed: 68, throttle: 0.4 },
  },
];

export function newMissionState(mission) {
  return {
    mission,
    timeLeft: mission.timeLimit,
    score: 0,
    ringsHit: 0,
    beaconsHit: 0,
    targets: mission.id === 'rings'
      ? RING_COURSE.map((r) => ({ ...r, hit: false }))
      : mission.id === 'courier'
        ? COURIER_BEACONS.map((b) => ({ ...b, hit: false }))
        : [],
    done: false,
    failed: false,
    endReason: '',
    message: '',
    messageTimer: 0,
    bonusShown: false,
  };
}

export function missionObjectiveText(ms) {
  if (ms.mission.id === 'rings') return `RINGS ${ms.ringsHit}/8`;
  if (ms.mission.id === 'courier') return `PARCELS ${ms.beaconsHit}/5`;
  return 'LAND ON RUNWAY 36';
}

export function currentTarget(ms) {
  return ms.targets.find((t) => !t.hit) || null;
}

function flash(ms, text, seconds) {
  ms.message = text;
  ms.messageTimer = seconds;
}

// Called every frame while flying. Returns an event string for sound effects:
// 'ring', 'beacon', 'landed', 'crash', 'outoftime', 'outoffuel', 'done', or ''.
export function tickMission(ms, f, dt) {
  if (ms.done || ms.failed) return '';
  ms.timeLeft -= dt;
  if (ms.messageTimer > 0) ms.messageTimer -= dt;

  if (ms.timeLeft <= 0) {
    ms.timeLeft = 0;
    ms.failed = true;
    ms.endReason = 'OUT OF TIME — the sortie window closed.';
    return 'outoftime';
  }
  if (f.fuel <= 0 && f.speed < 8 && f.onGround && !f.airborne) {
    ms.failed = true;
    ms.endReason = 'OUT OF FUEL — the tank ran dry on the ground.';
    return 'outoffuel';
  }
  if (f.crashed) {
    ms.failed = true;
    ms.endReason = f.y < 12 && Math.abs(f.x) > 400
      ? 'CRASHED — the valley is not forgiving.'
      : 'CRASHED — too hard on the ground.';
    return 'crash';
  }

  // Flying through a ring or beacon: 3D distance inside the ring radius.
  const target = currentTarget(ms);
  if (target) {
    const dx = f.x - target.x, dy = f.y - target.y, dz = f.z - target.z;
    if (Math.hypot(dx, dy, dz) < target.r * 0.92) {
      target.hit = true;
      if (ms.mission.id === 'rings') {
        ms.ringsHit++;
        ms.score += 100;
        flash(ms, ms.ringsHit >= 8 ? 'ALL RINGS! HEAD HOME' : `RING ${ms.ringsHit}/8  +100`, 2.2);
        if (ms.ringsHit >= 8) {
          ms.score += Math.round(ms.timeLeft) * 5;
          ms.done = true;
          ms.endReason = `RING RUN COMPLETE — time bonus banked.`;
          return 'done';
        }
        return 'ring';
      }
      ms.beaconsHit++;
      ms.score += 250;
      flash(ms, `PARCEL DELIVERED — ${target.name}  +250`, 2.4);
      if (ms.beaconsHit >= 5) {
        ms.score += Math.round(ms.timeLeft) * 5 + Math.round(f.fuel) * 10;
        ms.done = true;
        ms.endReason = 'ALL PARCELS DELIVERED — the valley thanks you.';
        return 'done';
      }
      return 'beacon';
    }
  }

  // Landing mission (and a safe runway touchdown in any mission) scores the landing.
  if (f.landed) {
    const q = f.landingQuality;
    const vsScore = Math.max(0, 500 - Math.abs(q.verticalSpeed) * 90);
    const centreScore = Math.max(0, 200 - q.centreOffset * 6);
    const speedScore = q.speed < 70 ? 100 : Math.max(0, 100 - (q.speed - 70) * 6);
    const total = Math.round(vsScore + centreScore + speedScore);
    ms.score += total;
    const verdict = Math.abs(q.verticalSpeed) < 2 ? 'GREASED IT — textbook touchdown'
      : Math.abs(q.verticalSpeed) < 3.5 ? 'SOLID LANDING — wheels down, safe'
      : 'FIRM LANDING — the runway forgives you this once';
    flash(ms, `${verdict}  +${total}`, 3);
    ms.done = true;
    ms.endReason = `${verdict}. Score ${ms.score}.`;
    return 'landed';
  }
  return '';
}

// Landing outside a landing mission still ends the flight (handled by main):
// this helper tells the menu what the flight achieved.
export function flightSummary(ms, f) {
  return {
    score: ms.score,
    distanceKm: (f.distanceFlown / 1000).toFixed(1),
    rings: ms.ringsHit,
    beacons: ms.beaconsHit,
    fuelLeft: Math.round(f.fuel),
  };
}
