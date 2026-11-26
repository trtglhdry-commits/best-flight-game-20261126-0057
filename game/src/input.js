// input.js — keyboard and mouse, kept in one place. Arrow keys / WASD fly the
// aircraft, Shift / Ctrl work the throttle, Space is the airbrake, and holding
// the mouse button and dragging steers with the pointer.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pitch: 0, roll: 0,
    throttleUp: false, throttleDown: false, airbrake: false,
    mouseDown: false, mouseX: 0, mouseY: 0,
    pressed: new Set(), // keys pressed since last poll, cleared by main
  };

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', KeyI: 'up',
    ArrowDown: 'down', KeyS: 'down', KeyK: 'down',
    ArrowLeft: 'left', KeyA: 'left', KeyJ: 'left',
    ArrowRight: 'right', KeyD: 'right', KeyL: 'right',
    ShiftLeft: 'thrUp', ShiftRight: 'thrUp',
    ControlLeft: 'thrDown', ControlRight: 'thrDown',
    Space: 'brake',
  };

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    const action = KEYMAP[e.code];
    if (action) input.keys.add(action);
    if (!e.repeat) input.pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) input.keys.delete(action);
  });
  window.addEventListener('blur', () => input.keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    input.mouseDown = true;
    input.mouseX = e.clientX; input.mouseY = e.clientY;
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  window.addEventListener('mousemove', (e) => {
    input.mouseX = e.clientX; input.mouseY = e.clientY;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Poll once per frame into the flight-control shape flight.js expects.
  input.poll = function poll() {
    let pitch = 0, roll = 0;
    if (input.keys.has('up')) pitch += 1;
    if (input.keys.has('down')) pitch -= 1;
    if (input.keys.has('left')) roll -= 1;
    if (input.keys.has('right')) roll += 1;
    if (input.mouseDown) {
      const r = canvas.getBoundingClientRect();
      const nx = (input.mouseX - r.left) / r.width - 0.5;
      const ny = (input.mouseY - r.top) / r.height - 0.5;
      roll += Math.max(-1, Math.min(1, nx * 2.4));
      pitch += Math.max(-1, Math.min(1, -ny * 2.4));
    }
    input.pitch = Math.max(-1, Math.min(1, pitch));
    input.roll = Math.max(-1, Math.min(1, roll));
    input.throttleUp = input.keys.has('thrUp');
    input.throttleDown = input.keys.has('thrDown');
    input.airbrake = input.keys.has('brake');
  };

  input.wasPressed = function wasPressed(code) {
    return input.pressed.has(code);
  };
  input.clearPressed = function clearPressed() {
    input.pressed.clear();
  };
  return input;
}
