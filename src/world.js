'use strict';
// ---------- 월드 (섬 생성, 타일, 오브젝트) ----------
const WORLD_W = 128, WORLD_H = 128;
const GR = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4 };
const OB = { NONE: 0, TREE: 1, PINE: 2, ROCK: 3, BUSH: 4, BUSH_EMPTY: 5, STUMP: 6, CAMPFIRE: 7, WALL: 8 };
const SOLID_OBJ = new Set([OB.TREE, OB.PINE, OB.ROCK, OB.CAMPFIRE, OB.WALL]);
const FIRE_MAX_FUEL = 180;
const FIRE_FEAR_R = 56; // 맹수가 모닥불을 피하는 반경(px)

class World {
  constructor(seed) {
    this.seed = seed;
    this.w = WORLD_W; this.h = WORLD_H;
    const n = this.w * this.h;
    this.ground = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.obj = new Uint8Array(n);
    this.objHp = new Float32Array(n);
    this.timers = new Map(); // idx -> {t, to}
    this.fires = new Map();  // idx -> {fuel}
    this.rockTarget = 0;
    this.rockTimer = 0;
    this.generate();
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  groundAt(x, y) { return this.inBounds(x, y) ? this.ground[this.idx(x, y)] : GR.DEEP; }
  objAt(x, y) { return this.inBounds(x, y) ? this.obj[this.idx(x, y)] : OB.NONE; }
  isWater(x, y) { const g = this.groundAt(x, y); return g === GR.DEEP || g === GR.WATER; }
  isLand(x, y) { return !this.isWater(x, y); }
  isSolid(x, y) {
    if (!this.inBounds(x, y)) return true;
    const i = this.idx(x, y);
    const g = this.ground[i];
    return g === GR.DEEP || g === GR.WATER || SOLID_OBJ.has(this.obj[i]);
  }

  generate() {
    const ne = makeNoise(this.seed), nm = makeNoise(this.seed + 77), nd = makeNoise(this.seed + 191);
    const rng = mulberry32(this.seed * 13 + 5);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const nx = x / this.w - 0.5, ny = y / this.h - 0.5;
      const d = Math.sqrt(nx * nx + ny * ny) * 2;
      let e = fbm(ne, x / 20, y / 20, 4) + 0.38 - d * d * 1.0;
      const m = fbm(nm, x / 14, y / 14, 3);
      const i = this.idx(x, y);
      let g;
      if (x < 2 || y < 2 || x >= this.w - 2 || y >= this.h - 2) g = GR.DEEP;
      else if (e < 0.24) g = GR.DEEP;
      else if (e < 0.33) g = GR.WATER;
      else if (e < 0.38) g = GR.SAND;
      else g = m > 0.56 ? GR.FOREST : GR.GRASS;
      this.ground[i] = g;
      this.variant[i] = Math.floor(hash2(x, y, this.seed + 3) * 4);

      // 오브젝트 배치
      const r = rng();
      let o = OB.NONE;
      if (g === GR.FOREST) {
        if (r < 0.30) o = fbm(nd, x / 8, y / 8, 2) > 0.5 ? OB.PINE : OB.TREE;
        else if (r < 0.36) o = OB.BUSH;
        else if (r < 0.375) o = OB.ROCK;
      } else if (g === GR.GRASS) {
        if (r < 0.035) o = OB.TREE;
        else if (r < 0.065) o = OB.BUSH;
        else if (r < 0.09) o = OB.ROCK;
      } else if (g === GR.SAND) {
        if (r < 0.03) o = OB.ROCK;
      }
      this.setObj(x, y, o);
    }

    // 스폰 지점: 중앙에서 가장 가까운 풀밭
    let best = null, bd = Infinity;
    for (let y = 4; y < this.h - 4; y++) for (let x = 4; x < this.w - 4; x++) {
      if (this.ground[this.idx(x, y)] !== GR.GRASS) continue;
      const dd = (x - this.w / 2) ** 2 + (y - this.h / 2) ** 2;
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
    if (!best) best = { x: this.w >> 1, y: this.h >> 1 };
    this.spawn = best;
    for (let y = best.y - 2; y <= best.y + 2; y++) for (let x = best.x - 2; x <= best.x + 2; x++) {
      if (this.inBounds(x, y)) this.setObj(x, y, OB.NONE);
    }
    // 시작 지점 근처에 자원 하나씩 보장
    const guarantee = [[3, 0, OB.TREE], [-3, 1, OB.ROCK], [0, 3, OB.BUSH], [-2, -3, OB.TREE]];
    for (const [dx, dy, o] of guarantee) {
      const x = best.x + dx, y = best.y + dy;
      if (this.isLand(x, y)) this.setObj(x, y, o);
    }
    this.rockTarget = this.countObj(OB.ROCK);
  }

  countObj(type) { let c = 0; for (let i = 0; i < this.obj.length; i++) if (this.obj[i] === type) c++; return c; }

  setObj(x, y, o) {
    const i = this.idx(x, y);
    this.obj[i] = o;
    this.objHp[i] = { 1: 4, 2: 4, 3: 5, 8: 40, 7: 1 }[o] || 1;
    if (o !== OB.CAMPFIRE) this.fires.delete(i);
    this.timers.delete(i);
  }

  addTimer(x, y, t, to) { this.timers.set(this.idx(x, y), { t, to }); }

  placeFire(x, y) {
    this.setObj(x, y, OB.CAMPFIRE);
    this.fires.set(this.idx(x, y), { fuel: 90 });
  }

  // 가장 가까운 '켜진' 모닥불
  nearestFire(px, py, maxD = Infinity) {
    let best = null;
    for (const [i, f] of this.fires) {
      if (f.fuel <= 0) continue;
      const fx = (i % this.w) * TILE + 8, fy = Math.floor(i / this.w) * TILE + 10;
      const d = dist(px, py, fx, fy);
      if (d < maxD && (!best || d < best.d)) best = { x: fx, y: fy, d, f, i };
    }
    return best;
  }

  // 켜짐 여부와 무관하게 가까운 모닥불
  fireNear(px, py, maxD) {
    let best = null;
    for (const [i, f] of this.fires) {
      const fx = (i % this.w) * TILE + 8, fy = Math.floor(i / this.w) * TILE + 10;
      const d = dist(px, py, fx, fy);
      if (d < maxD && (!best || d < best.d)) best = { x: fx, y: fy, d, f, i };
    }
    return best;
  }

  update(dt, player) {
    for (const [i, tm] of this.timers) {
      tm.t -= dt;
      if (tm.t <= 0) {
        const x = i % this.w, y = Math.floor(i / this.w);
        // 플레이어 위로는 나무가 자라지 않게
        if (SOLID_OBJ.has(tm.to) && player && Math.abs(player.x - (x * TILE + 8)) < 14 && Math.abs(player.y - (y * TILE + 8)) < 14) { tm.t = 3; continue; }
        this.setObj(x, y, tm.to);
      }
    }
    for (const f of this.fires.values()) if (f.fuel > 0) f.fuel = Math.max(0, f.fuel - dt);

    // 돌 재생성
    this.rockTimer -= dt;
    if (this.rockTimer <= 0) {
      this.rockTimer = 15;
      if (this.countObj(OB.ROCK) < this.rockTarget) {
        for (let k = 0; k < 30; k++) {
          const x = randi(2, this.w - 3), y = randi(2, this.h - 3);
          const g = this.groundAt(x, y);
          if ((g === GR.GRASS || g === GR.SAND || g === GR.FOREST) && this.objAt(x, y) === OB.NONE &&
            (!player || dist(x * TILE, y * TILE, player.x, player.y) > 12 * TILE)) { this.setObj(x, y, OB.ROCK); break; }
        }
      }
    }
  }

  // 미니맵 (1타일 = 1픽셀)
  buildMinimap(canvas) {
    canvas.width = this.w; canvas.height = this.h;
    const g = canvas.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    const col = {
      [GR.DEEP]: [43, 94, 168], [GR.WATER]: [61, 124, 204], [GR.SAND]: [224, 196, 134],
      [GR.GRASS]: [93, 158, 63], [GR.FOREST]: [70, 125, 54],
    };
    for (let i = 0; i < this.ground.length; i++) {
      let c = col[this.ground[i]];
      const o = this.obj[i];
      if (o === OB.TREE || o === OB.PINE) c = [44, 96, 44];
      else if (o === OB.ROCK) c = [150, 150, 160];
      else if (o === OB.WALL) c = [122, 82, 48];
      else if (o === OB.CAMPFIRE) c = [255, 150, 40];
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
}
