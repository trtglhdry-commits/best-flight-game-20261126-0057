// audio.js — every sound is synthesised live with WebAudio: engine hum, wind,
// ring chimes, touchdown thumps and the crash. No audio files, no network.

export function createAudio() {
  const a = {
    ctx: null, master: null, engineOsc: null, engineOsc2: null,
    engineGain: null, engineFilter: null, windGain: null, windFilter: null,
    muted: false, started: false,
  };

  a.ensure = function ensure() {
    if (a.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      a.ctx = new AC();
      a.master = a.ctx.createGain();
      a.master.gain.value = a.muted ? 0 : 0.5;
      a.master.connect(a.ctx.destination);
      // Engine: two detuned saws through a lowpass.
      a.engineFilter = a.ctx.createBiquadFilter();
      a.engineFilter.type = 'lowpass';
      a.engineFilter.frequency.value = 420;
      a.engineGain = a.ctx.createGain();
      a.engineGain.gain.value = 0;
      a.engineOsc = a.ctx.createOscillator();
      a.engineOsc.type = 'sawtooth';
      a.engineOsc.frequency.value = 52;
      a.engineOsc2 = a.ctx.createOscillator();
      a.engineOsc2.type = 'sawtooth';
      a.engineOsc2.frequency.value = 78;
      a.engineOsc.connect(a.engineFilter);
      a.engineOsc2.connect(a.engineFilter);
      a.engineFilter.connect(a.engineGain);
      a.engineGain.connect(a.master);
      a.engineOsc.start();
      a.engineOsc2.start();
      // Wind: looped noise through a bandpass.
      const len = a.ctx.sampleRate * 2;
      const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = a.ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      a.windFilter = a.ctx.createBiquadFilter();
      a.windFilter.type = 'bandpass';
      a.windFilter.frequency.value = 700;
      a.windFilter.Q.value = 0.6;
      a.windGain = a.ctx.createGain();
      a.windGain.gain.value = 0;
      noise.connect(a.windFilter);
      a.windFilter.connect(a.windGain);
      a.windGain.connect(a.master);
      noise.start();
      a.started = true;
    } catch (e) {
      a.started = false;
    }
  };

  a.setFlight = function setFlight(throttle, speed, airborne) {
    if (!a.started || !a.ctx) return;
    const t = a.ctx.currentTime;
    const eng = airborne || speed > 3 ? 0.05 + throttle * 0.16 : 0;
    a.engineGain.gain.setTargetAtTime(eng, t, 0.1);
    a.engineOsc.frequency.setTargetAtTime(48 + throttle * 70, t, 0.15);
    a.engineOsc2.frequency.setTargetAtTime(72 + throttle * 105, t, 0.15);
    a.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.2);
    const wind = Math.min(0.22, Math.max(0, (speed - 20) / 125) * 0.22);
    a.windGain.gain.setTargetAtTime(wind, t, 0.2);
    a.windFilter.frequency.setTargetAtTime(400 + speed * 9, t, 0.2);
  };

  function tone(freq, dur, type, gain, when) {
    if (!a.started || !a.ctx) return;
    const t0 = a.ctx.currentTime + (when || 0);
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.2, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(a.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  a.ring = function ring() {
    tone(660, 0.5, 'sine', 0.22);
    tone(990, 0.6, 'sine', 0.2, 0.09);
    tone(1320, 0.7, 'sine', 0.14, 0.18);
  };
  a.beacon = function beacon() {
    tone(523, 0.4, 'triangle', 0.22);
    tone(784, 0.5, 'triangle', 0.2, 0.08);
  };
  a.click = function click() { tone(880, 0.08, 'square', 0.08); };
  a.land = function land() {
    tone(90, 0.35, 'sine', 0.4);
    tone(140, 0.25, 'triangle', 0.2, 0.05);
  };
  a.crash = function crash() {
    if (!a.started || !a.ctx) return;
    const t0 = a.ctx.currentTime;
    const len = a.ctx.sampleRate * 0.7;
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    const g = a.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(a.master);
    src.start(t0);
    tone(55, 0.8, 'sine', 0.4);
  };
  a.win = function win() {
    [523, 659, 784, 1047].forEach((fr, i) => tone(fr, 0.6, 'triangle', 0.18, i * 0.12));
  };
  a.toggleMute = function toggleMute() {
    a.muted = !a.muted;
    if (a.master && a.ctx) a.master.gain.setTargetAtTime(a.muted ? 0 : 0.5, a.ctx.currentTime, 0.05);
    return a.muted;
  };
  return a;
}
