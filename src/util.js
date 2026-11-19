'use strict';
// ---------- 공통 유틸 ----------
const TILE = 16;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function makeNoise(seed) {
  const smooth = t => t * t * (3 - 2 * t);
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth(x - xi), v = smooth(y - yi);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

function fbm(noise, x, y, oct) {
  let s = 0, amp = 1, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); tot += amp; amp *= 0.5; f *= 2; }
  return s / tot;
}

// 정수 픽셀로 채운 타원 (그림자용)
function pixelEllipse(ctx, cx, cy, rx, ry) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
    ctx.fillRect(cx - w, cy + dy, w * 2, 1);
  }
}

// ---------- 간단한 효과음 (WebAudio) ----------
const SFX = {
  ctx: null, on: true,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  play(name) {
    switch (name) {
      case 'swing': this.tone(300, 0.06, 'triangle', 0.04, -150); break;
      case 'hit': this.tone(160, 0.1, 'square', 0.07, -80); break;
      case 'chop': this.tone(220, 0.07, 'square', 0.05, -60); break;
      case 'pick': this.tone(660, 0.08, 'square', 0.04, 300); break;
      case 'hurt': this.tone(110, 0.2, 'sawtooth', 0.08, -60); break;
      case 'eat': this.tone(400, 0.06, 'triangle', 0.06, -200); setTimeout(() => this.tone(350, 0.06, 'triangle', 0.06, -150), 80); break;
      case 'drink': this.tone(500, 0.1, 'sine', 0.07, 300); break;
      case 'craft': this.tone(520, 0.08, 'square', 0.05); setTimeout(() => this.tone(780, 0.12, 'square', 0.05), 90); break;
      case 'die': this.tone(200, 0.3, 'sawtooth', 0.06, -170); break;
      case 'roar': this.tone(90, 0.9, 'sawtooth', 0.1, -50); this.tone(60, 0.9, 'square', 0.06, -20); break;
      case 'fire': this.tone(140, 0.15, 'triangle', 0.05, 100); break;
      case 'deny': this.tone(120, 0.1, 'square', 0.05); break;
    }
  },
};
