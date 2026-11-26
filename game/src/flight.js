// flight.js — the aircraft's flight model: throttle, pitch, bank, turns, lift,
// stall, fuel burn and the ground. All speeds in m/s, angles in radians.

import { clamp, wrapAngle } from './math3d.js';
import { groundHeight, isWater, RUNWAY, WATER_LEVEL } from './terrain.js';

export const MAX_SPEED = 125;      // m/s at full throttle, level flight
export const STALL_SPEED = 42;     // below this the wing quits
export const TAKEOFF_SPEED = 55;   // rotate speed
export const MAX_FUEL = 100;

export function newFlight() {
  return {
    x: 0, y: 10, z: -300,          // parked on runway 36, facing north
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0,
    verticalSpeed: 0,
    fuel: MAX_FUEL, damage: 0,
    onGround: true, airborne: false,
    stalled: false, crashed: false, landed: false,
    landingQuality: null,          // filled in by missions.js on touchdown
    distanceFlown: 0,
  };
}

export function resetFlight(f, spot) {
  const fresh = newFlight();
  Object.assign(f, fresh, spot || {});
  f.y = spot && spot.y !== undefined ? spot.y : groundHeight(f.x, f.z) + 2;
}

// One physics step. input: { pitch: -1..1, roll: -1..1, throttleUp, throttleDown,
// airbrake } — pitch +1 pulls the nose up, roll +1 banks right.
export function stepFlight(f, input, dt) {
  if (f.crashed || f.landed) return;

  // Throttle: Shift spools up, Ctrl spools down; the engine answers smoothly.
  if (input.throttleUp) f.throttle = clamp(f.throttle + dt * 0.55, 0, 1);
  if (input.throttleDown) f.throttle = clamp(f.throttle - dt * 0.7, 0, 1);
  let throttle = f.throttle;
  if (f.fuel <= 0) throttle = 0; // flameout: glide on what speed you have

  // Bank: roll input rolls the aircraft; it holds its bank, with a gentle
  // tendency to level when the stick is centred.
  const rollRate = 1.9;
  f.roll += input.roll * rollRate * dt;
  if (input.roll === 0) f.roll -= f.roll * 0.55 * dt;
  f.roll = clamp(f.roll, -1.15, 1.15);

  // Turn: a banked wing turns the nose. Harder bank and more speed, more turn.
  const turnAuthority = clamp(f.speed / 70, 0.15, 1);
  f.heading -= Math.sin(f.roll) * 0.55 * turnAuthority * dt;
  f.heading = wrapAngle(f.heading);

  // Pitch: the elevator answers at every speed, but a slow wing is mushy.
  const pitchAuthority = clamp(f.speed / 45, 0.25, 1);
  f.pitch += input.pitch * 1.15 * pitchAuthority * dt;
  f.pitch = clamp(f.pitch, -0.55, 0.6);
  if (input.pitch === 0 && f.airborne) f.pitch -= f.pitch * 0.25 * dt;

  // Stall: below stall speed the nose drops and the aircraft sinks.
  f.stalled = f.airborne && f.speed < STALL_SPEED;
  let pitch = f.pitch;
  if (f.stalled) pitch = -0.22;

  // Speed: thrust pulls toward the throttle's top speed, drag and the climb
  // fight back; the airbrake (Space) scrubs speed fast.
  let target = throttle * MAX_SPEED;
  let accel = (target - f.speed) * 0.32;
  accel -= Math.sin(pitch) * 11;               // climbing costs speed
  if (input.airbrake) accel -= 26;
  f.speed = Math.max(0, f.speed + accel * dt);

  const fx = Math.sin(f.heading), fz = Math.cos(f.heading);
  f.x += fx * f.speed * Math.cos(pitch) * dt;
  f.z += fz * f.speed * Math.cos(pitch) * dt;
  const prevY = f.y;
  f.y += f.speed * Math.sin(pitch) * dt;
  if (f.stalled) f.y -= 14 * dt;                // sinking wing
  f.verticalSpeed = (f.y - prevY) / Math.max(dt, 1e-4);
  f.distanceFlown += f.speed * dt;

  // Fuel: full throttle drinks it; a gentle cruise sips it.
  if (f.airborne || f.speed > 5) {
    f.fuel = Math.max(0, f.fuel - (0.25 + throttle * 1.15) * dt);
  }

  // Ground: the runway is flat and forgiving, the hills are not.
  const ground = groundHeight(f.x, f.z);
  const overRunway = Math.abs(f.x - RUNWAY.x) < RUNWAY.halfWidth - 2 &&
    f.z > RUNWAY.z0 && f.z < RUNWAY.z1;
  if (f.y <= ground + 2) {
    f.y = ground + 2;
    if (f.airborne) {
      // Coming down from the air: a landing or a crash.
      if (overRunway && Math.abs(f.verticalSpeed) < 5.5 &&
        f.speed < 98 && Math.abs(f.roll) < 0.3 && !isWater(f.x, f.z)) {
        // A landing the runway accepts: gentle, slow, wings level.
        f.landed = true;
        f.onGround = true;
        f.airborne = false;
        f.landingQuality = {
          verticalSpeed: f.verticalSpeed, speed: f.speed, roll: f.roll,
          centreOffset: Math.abs(f.x - RUNWAY.x),
        };
      } else if (f.speed > 12 || Math.abs(f.verticalSpeed) > 5.5) {
        f.crashed = true; // hit the ground (or the water) too hard
      } else {
        // A soft field touchdown: the flight ends on the grass, intact.
        f.onGround = true;
        f.airborne = false;
      }
    } else {
      // Still rolling on the ground: taking off is not landing.
      f.onGround = true;
    }
  } else {
    f.onGround = false;
    if (f.speed > TAKEOFF_SPEED && f.y > ground + 6) f.airborne = true;
  }
  if (f.y < WATER_LEVEL + 1 && isWater(f.x, f.z) && f.airborne) f.crashed = true;
}

export function knots(f) { return f.speed * 1.94384; }
export function feet(f) { return f.y * 3.28084; }
export function headingDegrees(f) {
  const d = ((f.heading * 180 / Math.PI) % 360 + 360) % 360;
  return d;
}
