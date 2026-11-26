// world.js — the things in the valley that are not terrain: the runway and its
// markings, the airfield buildings, the ring course, the delivery beacons and
// the clouds. All positions are fixed world coordinates, so the valley is the
// same valley every time you fly it.

import { groundHeight, RUNWAY } from './terrain.js';
import { hash2 } from './math3d.js';

// The ring course for the Ring Run mission: a valley tour that climbs, turns
// and comes back to the field. Rings face along the course direction.
export const RING_COURSE = [
  { x: 0,    y: 90,  z: 500,  r: 26 },
  { x: 260,  y: 120, z: 950,  r: 26 },
  { x: 620,  y: 160, z: 1250, r: 24 },
  { x: 780,  y: 210, z: 800,  r: 24 },
  { x: 640,  y: 240, z: 350,  r: 24 },
  { x: 240,  y: 190, z: 60,   r: 26 },
  { x: -260, y: 150, z: -260, r: 26 },
  { x: -120, y: 110, z: -700, r: 28 },
];

// Delivery beacons for the Courier mission: spread across the whole valley,
// each one a ring to fly through with the parcel.
export const COURIER_BEACONS = [
  { x: -820, y: 150, z: 820,  r: 26, name: 'LAKESIDE' },
  { x: 1050, y: 220, z: 1450, r: 26, name: 'NORTH RIDGE' },
  { x: 1180, y: 180, z: -950, r: 26, name: 'EAST FARM' },
  { x: -980, y: 200, z: -1150, r: 26, name: 'WEST PEAK' },
  { x: 0,    y: 120, z: 1650, r: 28, name: 'FAR VALLEY' },
];

// Airfield buildings: hangars, a control tower and a fuel shed. Kept clear of
// the runway so they frame the field without looming over the threshold.
export const BUILDINGS = [
  { x: -120, z: -180, w: 46, d: 34, h: 16, colour: '#a85438', roof: '#7e3a24', kind: 'hangar' },
  { x: -120, z: -120, w: 40, d: 30, h: 14, colour: '#4a6b8a', roof: '#33506a', kind: 'hangar' },
  { x: 115,  z: -280, w: 18, d: 18, h: 32, colour: '#d8d2c4', roof: '#5b7a94', kind: 'tower' },
  { x: 115,  z: -200, w: 30, d: 22, h: 10, colour: '#8a7f6a', roof: '#5e5546', kind: 'shed' },
  { x: -170, z: 80,  w: 34, d: 26, h: 12, colour: '#4a7a52', roof: '#33573a', kind: 'hangar' },
];

// The little town of Pinehollow, east of the field: a grid of rooftops.
export function townHouses() {
  const houses = [];
  for (let gx = 0; gx < 6; gx++) {
    for (let gz = 0; gz < 4; gz++) {
      const x = 420 + gx * 55 + (hash2(gx, gz, 3) - 0.5) * 18;
      const z = 260 + gz * 55 + (hash2(gx, gz, 5) - 0.5) * 18;
      const h = groundHeight(x, z);
      houses.push({
        x, z, y: h, w: 16 + hash2(gx, gz, 9) * 10, d: 14 + hash2(gx, gz, 11) * 8,
        hgt: 8 + hash2(gx, gz, 15) * 7,
        colour: ['#c9b18a', '#b98d6e', '#a89a7c', '#c2a284'][((gx * 7 + gz * 3) % 4)],
      });
    }
  }
  return houses;
}

// Clouds: fixed puffs drifting slowly east, drawn as billboarded ellipses.
export const CLOUDS = [];
for (let i = 0; i < 16; i++) {
  const a = hash2(i, 1, 41) * Math.PI * 2;
  const r = 900 + hash2(i, 2, 43) * 2400;
  CLOUDS.push({
    x: Math.cos(a) * r, z: Math.sin(a) * r - 300,
    y: 420 + hash2(i, 3, 47) * 260,
    s: 70 + hash2(i, 4, 53) * 110,
    drift: 2 + hash2(i, 5, 59) * 3,
  });
}

export function runwayCorners() {
  const g = (x, z) => groundHeight(x, z);
  return {
    a: { x: -RUNWAY.halfWidth, y: g(-RUNWAY.halfWidth, RUNWAY.z0) + 0.4, z: RUNWAY.z0 },
    b: { x: RUNWAY.halfWidth, y: g(RUNWAY.halfWidth, RUNWAY.z0) + 0.4, z: RUNWAY.z0 },
    c: { x: RUNWAY.halfWidth, y: g(RUNWAY.halfWidth, RUNWAY.z1) + 0.4, z: RUNWAY.z1 },
    d: { x: -RUNWAY.halfWidth, y: g(-RUNWAY.halfWidth, RUNWAY.z1) + 0.4, z: RUNWAY.z1 },
  };
}
