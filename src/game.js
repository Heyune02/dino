'use strict';
// ---------- 메인 게임 ----------
const DAY_LEN = 210;          // 하루 길이(초)
const FONT = '"Galmuri11","NeoDunggeunmo","DungGeunMo","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",monospace';
const HOTBAR = ['berry', 'cooked', 'meat', 'bandage', 'campfire', 'wall'];

const RECIPES = [
  { id: 'axe', name: '돌도끼', cost: { wood: 3, stone: 3 }, desc: '나무/돌 채집량 2배', once: true },
  { id: 'spear', name: '돌창', cost: { wood: 4, stone: 2 }, desc: '공격력 6, 사거리 증가', once: true },
  { id: 'bonespear', name: '뼈창', cost: { wood: 3, bone: 4 }, desc: '공격력 11 (돌창 필요)', once: true },
  { id: 'campfire', name: '모닥불', cost: { wood: 5, stone: 3 }, desc: '고기 굽기 · 맹수 퇴치 · 회복' },
  { id: 'wall', name: '나무 방벽', cost: { wood: 4 }, desc: '길을 막는 방벽' },
  { id: 'bandage', name: '붕대', cost: { fiber: 3 }, desc: '체력 35 회복' },
  { id: 'armor', name: '가죽 갑옷', cost: { hide: 5, fiber: 2 }, desc: '받는 피해 40% 감소', once: true },
];

class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false, rclicked: false };
    this.wheel = 0;
    const block = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', e => {
      SFX.init();
      if (block.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', e => { this.mouse.x = e.offsetX; this.mouse.y = e.offsetY; });
    canvas.addEventListener('mousedown', e => {
      SFX.init();
      this.mouse.x = e.offsetX; this.mouse.y = e.offsetY;
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) this.mouse.rclicked = true;
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  endFrame() { this.pressed.clear(); this.mouse.clicked = false; this.mouse.rclicked = false; this.wheel = 0; }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.low = document.createElement('canvas');
    this.lctx = this.low.getContext('2d');
    this.light = document.createElement('canvas');
    this.lightCtx = this.light.getContext('2d');
    this.minimap = document.createElement('canvas');
    this.input = new Input(canvas);
    this.state = 'title';
    this.showMap = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.newGame();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.canvas.width = W; this.canvas.height = H;
    this.zoom = W >= 1300 ? 4 : W >= 800 ? 3 : 2;
    this.low.width = Math.ceil(W / this.zoom); this.low.height = Math.ceil(H / this.zoom);
    this.light.width = this.low.width; this.light.height = this.low.height;
    this.ui = W < 800 ? 0.8 : 1;
  }

  newGame() {
    this.seed = Math.floor(Math.random() * 1e9);
    this.world = new World(this.seed);
    const s = this.world.spawn;
    this.player = new Player(s.x * TILE + 8, s.y * TILE + 10);
    this.dinos = []; this.pickups = []; this.particles = []; this.texts = []; this.messages = [];
    this.time = DAY_LEN * 0.03;
    this.kills = 0;
    this.cam = { x: 0, y: 0 };
    this.shakeT = 0; this.shakeA = 0;
    this.spawnT = 0; this.mapT = 0;
    this.wasNight = false; this.rexChecked = -1;
    this.selected = 0;
    this.deathCause = '';
    this.hurtFlash = 0;
    this.world.buildMinimap(this.minimap);
    // 초기 공룡
    for (let k = 0; k < 5; k++) this.trySpawn('para', 8, 20);
    for (let k = 0; k < 2; k++) this.trySpawn('trike', 10, 22);
    this.trySpawn('compy', 14, 22, 3);
    this.notify('공룡섬에 표류했다... 살아남아라!', '#ffffff');
    this.notify('나무와 돌을 모아 [C]로 도구를 만들자', '#b8e986');
  }

  // ---------- 시간 ----------
  phase() { return (this.time % DAY_LEN) / DAY_LEN; }
  dayNum() { return Math.floor(this.time / DAY_LEN) + 1; }
  isNight() { const p = this.phase(); return p >= 0.66 && p < 0.95; }
  darkness() {
    const p = this.phase(), MAX = 0.86;
    if (p < 0.58) return 0;
    if (p < 0.70) return (p - 0.58) / 0.12 * MAX;
    if (p < 0.92) return MAX;
    return (1 - (p - 0.92) / 0.08) * MAX;
  }

  // ---------- 헬퍼 ----------
  notify(text, color = '#fff') { this.messages.push({ text, color, t: 4.5 }); if (this.messages.length > 4) this.messages.shift(); }
  floatText(x, y, text, color = '#fff') { this.texts.push({ x, y, text, color, t: 1 }); }
  burst(x, y, color, n = 8, spd = 60) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), s = rand(spd * 0.3, spd);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.3, 0.7), color });
    }
  }
  shake(t, a) { this.shakeT = Math.max(this.shakeT, t); this.shakeA = Math.max(this.shakeA, a); }
  spawnPickup(item, x, y) { this.pickups.push(new Pickup(item, x, y)); }
  addItem(item, n) {
    const p = this.player;
    p.inv[item] = (p.inv[item] || 0) + n;
    this.floatText(p.x, p.y - 22, `+${n} ${ITEM_NAMES[item]}`, '#fff6c2');
  }

  hurtPlayer(dmg, src) {
    const p = this.player;
    if (p.invT > 0 || p.dead) return;
    const real = Math.round(dmg * (p.armor ? 0.6 : 1));
    p.hp -= real; p.invT = 0.45; p.hurtT = 0.2;
    const d = Math.max(1, dist(src.x, src.y, p.x, p.y));
    p.kx = (p.x - src.x) / d * 180; p.ky = (p.y - src.y) / d * 180;
    this.floatText(p.x, p.y - 20, `-${real}`, '#ff5a6a');
    this.burst(p.x, p.y - 8, '#c0283a', 6);
    this.shake(0.25, src.def.boss ? 5 : 2.5);
    this.hurtFlash = 0.3;
    SFX.play('hurt');
    if (p.hp <= 0) this.onPlayerDeath(src.def.name + '의 공격');
  }

  onPlayerDeath(cause) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true; p.hp = 0;
    this.deathCause = cause;
    this.state = 'dead';
    SFX.play('die');
  }

  // ---------- 스폰 ----------
  trySpawn(type, minT, maxT, packSize = 1) {
    const p = this.player, w = this.world;
    for (let tries = 0; tries < 25; tries++) {
      const a = rand(0, Math.PI * 2), r = rand(minT, maxT) * TILE;
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (w.isSolid(tx, ty) || !w.isLand(tx, ty)) continue;
      if (DINO_DEFS[type].carn && w.nearestFire(x, y, 7 * TILE)) continue;
      if (type === 'rex') {
        // 큰 몸체가 들어갈 공간 확인
        let ok = true;
        for (let yy = -1; yy <= 0 && ok; yy++) for (let xx = -1; xx <= 1; xx++) if (w.isSolid(tx + xx, ty + yy)) ok = false;
        if (!ok) continue;
      }
      for (let k = 0; k < packSize; k++) {
        const ox = k ? rand(-14, 14) : 0, oy = k ? rand(-14, 14) : 0;
        if (!w.isSolid(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE))) this.dinos.push(new Dino(type, x + ox, y + oy));
      }
      return true;
    }
    return false;
  }

  spawnTick() {
    const night = this.isNight(), day = this.dayNum();
    const count = { compy: 0, raptor: 0, para: 0, trike: 0, rex: 0 };
    for (const d of this.dinos) count[d.type]++;
    const want = night
      ? { compy: 6, raptor: Math.min(2 + day, 9), para: 3, trike: 2 }
      : { compy: 3 + Math.min(day, 3), raptor: day >= 2 ? Math.min(day - 1, 3) : 0, para: 6, trike: 3 };
    for (const [type, n] of Object.entries(want)) {
      if (count[type] < n && Math.random() < 0.5) {
        this.trySpawn(type, 15, 24, type === 'compy' ? randi(2, 3) : 1);
      }
    }
  }

  // ---------- 플레이어 행동 ----------
  frontTile(distPx = 14) {
    const p = this.player;
    return { tx: Math.floor((p.x + p.aimX * distPx) / TILE), ty: Math.floor((p.y - 3 + p.aimY * distPx) / TILE) };
  }

  attack() {
    const p = this.player;
    if (p.atkCd > 0) return;
    const wpn = WEAPONS[p.weapon];
    p.atkCd = 0.38; p.atkT = 0.16;
    p.stamina = Math.max(0, p.stamina - 4);
    SFX.play('swing');
    const hx = p.x + p.aimX * wpn.reach * 0.8, hy = p.y - 5 + p.aimY * wpn.reach * 0.8;
    let hitAny = false;
    for (const d of this.dinos) {
      if (d.dead) continue;
      const big = d.def.boss ? 16 : d.hw;
      if (dist(hx, hy, d.x, d.y - d.hh - 2) < wpn.reach * 0.7 + big) {
        let dmg = wpn.dmg;
        const crit = Math.random() < 0.1;
        if (crit) dmg *= 2;
        d.takeDamage(dmg, p.x, p.y, this);
        this.floatText(d.x, d.y - 20, crit ? `${dmg}!` : `${dmg}`, crit ? '#ffe14d' : '#ffffff');
        this.burst(d.x, d.y - 8, '#c0283a', 5);
        hitAny = true;
      }
    }
    if (hitAny) { SFX.play('hit'); this.shake(0.08, 1.5); return; }
    // 오브젝트 채집
    const w = this.world;
    for (const dd of [10, 18]) {
      const { tx, ty } = this.frontTile(dd);
      if (!w.inBounds(tx, ty)) continue;
      const i = w.idx(tx, ty), o = w.obj[i];
      const cx = tx * TILE + 8, cy = ty * TILE + 8;
      if (o === OB.TREE || o === OB.PINE) {
        const n = p.hasAxe ? 2 : 1;
        this.addItem('wood', n);
        w.objHp[i] -= 1;
        this.burst(cx, cy, '#7a5230', 5, 40);
        this.burst(cx, cy - 10, '#3f8f3a', 4, 40);
        SFX.play('chop');
        if (w.objHp[i] <= 0) { w.setObj(tx, ty, OB.STUMP); w.addTimer(tx, ty, rand(80, 140), o); if (Math.random() < 0.5) this.addItem('fiber', 1); }
        return;
      }
      if (o === OB.ROCK) {
        const n = p.hasAxe ? 2 : 1;
        this.addItem('stone', n);
        w.objHp[i] -= 1;
        this.burst(cx, cy, '#9aa0a8', 6, 40);
        SFX.play('chop');
        if (w.objHp[i] <= 0) w.setObj(tx, ty, OB.NONE);
        return;
      }
      if (o === OB.BUSH || o === OB.BUSH_EMPTY) { this.harvestBush(tx, ty); return; }
      if (o === OB.WALL) {
        w.objHp[i] -= wpn.dmg;
        this.burst(cx, cy, '#7a5230', 4, 30);
        SFX.play('chop');
        if (w.objHp[i] <= 0) { w.setObj(tx, ty, OB.NONE); this.addItem('wood', 2); }
        return;
      }
      if (o === OB.CAMPFIRE) {
        w.setObj(tx, ty, OB.NONE); this.addItem('stone', 2);
        SFX.play('chop');
        return;
      }
    }
  }

  harvestBush(tx, ty) {
    const w = this.world, o = w.objAt(tx, ty);
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    this.burst(cx, cy, '#3d8b3d', 5, 30);
    if (o === OB.BUSH) {
      this.addItem('berry', randi(2, 3));
      if (Math.random() < 0.6) this.addItem('fiber', 1);
      w.setObj(tx, ty, OB.BUSH_EMPTY);
      w.addTimer(tx, ty, rand(60, 100), OB.BUSH);
      SFX.play('pick');
    } else {
      this.addItem('fiber', 1);
      w.setObj(tx, ty, OB.NONE);
      w.addTimer(tx, ty, rand(90, 150), OB.BUSH_EMPTY);
      SFX.play('chop');
    }
  }

  findInteraction() {
    const p = this.player, w = this.world;
    const fire = w.fireNear(p.x, p.y - 4, 26);
    if (fire) {
      if (p.inv.meat > 0) return { type: 'cook', label: '[E] 고기 굽기', fire };
      if (p.inv.wood > 0 && fire.f.fuel < FIRE_MAX_FUEL - 25) return { type: 'fuel', label: fire.f.fuel > 0 ? '[E] 장작 넣기' : '[E] 불 붙이기', fire };
    }
    for (const dd of [8, 14, 20]) {
      const { tx, ty } = this.frontTile(dd);
      if (w.objAt(tx, ty) === OB.BUSH) return { type: 'bush', label: '[E] 베리 따기', tx, ty };
      if (w.isWater(tx, ty) && w.inBounds(tx, ty)) return { type: 'drink', label: '[E] 물 마시기' };
    }
    return null;
  }

  interact() {
    const p = this.player, it = this.findInteraction();
    if (!it) return;
    if (it.type === 'cook') {
      p.inv.meat--; this.addItem('cooked', 1);
      if (it.fire.f.fuel <= 0) { p.inv.meat++; p.inv.cooked--; this.notify('불이 꺼져 있다. 장작을 넣자', '#ffb27a'); return; }
      this.burst(it.fire.x, it.fire.y - 8, '#ffb347', 6, 30); SFX.play('fire');
    } else if (it.type === 'fuel') {
      p.inv.wood--; it.fire.f.fuel = Math.min(FIRE_MAX_FUEL, it.fire.f.fuel + 45);
      this.floatText(it.fire.x, it.fire.y - 18, '불길 +45초', '#ffb347');
      this.burst(it.fire.x, it.fire.y - 8, '#ffb347', 8, 40); SFX.play('fire');
    } else if (it.type === 'bush') {
      this.harvestBush(it.tx, it.ty);
    } else if (it.type === 'drink') {
      if (p.thirst >= 99.5) return;
      p.thirst = Math.min(100, p.thirst + 25);
      this.floatText(p.x, p.y - 22, '+25 수분', '#7cc4ff');
      const { tx, ty } = this.frontTile(14);
      this.burst(tx * TILE + 8, ty * TILE + 8, '#9fd0ff', 6, 30);
      SFX.play('drink');
    }
  }

  placeTarget() {
    const p = this.player, w = this.world;
    const tx = Math.floor((p.x + p.faceX * 16) / TILE), ty = Math.floor((p.y - 3 + p.faceY * 16) / TILE);
    let ok = w.inBounds(tx, ty) && w.isLand(tx, ty) && w.objAt(tx, ty) === OB.NONE;
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    if (ok && Math.abs(p.x - cx) < 8 + p.hw && Math.abs(p.y - cy) < 8 + p.hh) ok = false;
    if (ok) for (const d of this.dinos) if (Math.abs(d.x - cx) < 8 + d.hw && Math.abs(d.y - cy) < 8 + d.hh) { ok = false; break; }
    return { tx, ty, ok };
  }

  useSelected() {
    const p = this.player, item = HOTBAR[this.selected];
    if (!p.inv[item]) { SFX.play('deny'); return; }
    switch (item) {
      case 'berry':
        p.inv.berry--; p.hunger = Math.min(100, p.hunger + 9); p.thirst = Math.min(100, p.thirst + 4);
        this.floatText(p.x, p.y - 22, '+9 포만감', '#ffb27a'); SFX.play('eat'); break;
      case 'cooked':
        p.inv.cooked--; p.hunger = Math.min(100, p.hunger + 38); p.hp = Math.min(p.maxHp, p.hp + 8);
        this.floatText(p.x, p.y - 22, '+38 포만감', '#ffb27a'); SFX.play('eat'); break;
      case 'meat':
        p.inv.meat--; p.hunger = Math.min(100, p.hunger + 14);
        SFX.play('eat');
        if (Math.random() < 0.45) { p.hp -= 12; this.floatText(p.x, p.y - 22, '식중독! -12', '#a6e05a'); this.notify('날고기는 위험하다. 모닥불에 굽자', '#a6e05a'); if (p.hp <= 0) this.onPlayerDeath('식중독'); }
        else this.floatText(p.x, p.y - 22, '+14 포만감', '#ffb27a');
        break;
      case 'bandage':
        if (p.hp >= p.maxHp) return;
        p.inv.bandage--; p.hp = Math.min(p.maxHp, p.hp + 35);
        this.floatText(p.x, p.y - 22, '+35 체력', '#7dff9a'); SFX.play('craft'); break;
      case 'campfire':
      case 'wall': {
        const t = this.placeTarget();
        if (!t.ok) { SFX.play('deny'); return; }
        p.inv[item]--;
        if (item === 'campfire') { this.world.placeFire(t.tx, t.ty); SFX.play('fire'); }
        else { this.world.setObj(t.tx, t.ty, OB.WALL); SFX.play('chop'); }
        this.burst(t.tx * TILE + 8, t.ty * TILE + 10, '#c9a46a', 8, 30);
        this.world.buildMinimap(this.minimap);
        break;
      }
    }
  }

  canCraft(r) {
    const p = this.player;
    if (r.once && this.hasCrafted(r.id)) return false;
    if (r.id === 'bonespear' && p.weapon < 1) return false;
    for (const [k, n] of Object.entries(r.cost)) if ((p.inv[k] || 0) < n) return false;
    return true;
  }
  hasCrafted(id) {
    const p = this.player;
    return (id === 'axe' && p.hasAxe) || (id === 'spear' && p.weapon >= 1) || (id === 'bonespear' && p.weapon >= 2) || (id === 'armor' && p.armor);
  }
  craft(r) {
    const p = this.player;
    if (!this.canCraft(r)) { SFX.play('deny'); return; }
    for (const [k, n] of Object.entries(r.cost)) p.inv[k] -= n;
    switch (r.id) {
      case 'axe': p.hasAxe = true; break;
      case 'spear': p.weapon = Math.max(p.weapon, 1); break;
      case 'bonespear': p.weapon = 2; break;
      case 'armor': p.armor = true; break;
      default: p.inv[r.id] = (p.inv[r.id] || 0) + 1;
    }
    this.notify(`${r.name} 제작 완료!`, '#b8e986');
    SFX.play('craft');
  }

  // ---------- 루프 ----------
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.update(dt);
    this.render();
    this.input.endFrame();
    requestAnimationFrame(tt => this.frame(tt));
  }

  update(dt) {
    const inp = this.input;
    if (inp.hit('KeyM')) this.showMap = !this.showMap;
    if (inp.hit('KeyN')) { SFX.on = !SFX.on; this.notify(SFX.on ? '소리 켜짐' : '소리 꺼짐'); }

    if (this.state === 'title') {
      if (inp.hit('Enter') || inp.hit('Space') || inp.mouse.clicked) this.state = 'play';
      this.time += dt * 0.5; // 타이틀 배경용
      this.updateCamera(dt);
      return;
    }
    if (this.state === 'dead') {
      this.updateEffects(dt);
      if (inp.hit('Enter') || inp.hit('KeyR')) { this.newGame(); this.state = 'play'; }
      return;
    }
    if (this.state === 'paused') {
      if (inp.hit('KeyP') || inp.hit('Escape')) this.state = 'play';
      return;
    }
    if (this.state === 'craft') {
      if (inp.hit('KeyC') || inp.hit('Tab') || inp.hit('Escape')) { this.state = 'play'; return; }
      for (let k = 0; k < RECIPES.length; k++) if (inp.hit('Digit' + (k + 1))) this.craft(RECIPES[k]);
      if (inp.mouse.clicked && this.craftRects) {
        for (const [r, rect] of this.craftRects) {
          if (inp.mouse.x >= rect.x && inp.mouse.x <= rect.x + rect.w && inp.mouse.y >= rect.y && inp.mouse.y <= rect.y + rect.h) this.craft(r);
        }
      }
      return;
    }

    // --- play ---
    if (inp.hit('KeyP') || inp.hit('Escape')) { this.state = 'paused'; return; }
    if (inp.hit('KeyC') || inp.hit('Tab')) { this.state = 'craft'; return; }
    for (let k = 0; k < HOTBAR.length; k++) if (inp.hit('Digit' + (k + 1))) this.selected = k;
    if (inp.wheel) this.selected = (this.selected + inp.wheel + HOTBAR.length) % HOTBAR.length;

    const p = this.player;
    this.time += dt;
    p.update(dt, this);
    if (p.dead) return;

    if (inp.mouse.clicked && this.hotbarRects) {
      for (let k = 0; k < this.hotbarRects.length; k++) {
        const r = this.hotbarRects[k];
        if (inp.mouse.x >= r.x && inp.mouse.x <= r.x + r.w && inp.mouse.y >= r.y && inp.mouse.y <= r.y + r.h) { this.selected = k; inp.mouse.clicked = false; inp.mouse.down = false; }
      }
    }
    const mouseAtk = inp.mouse.down || inp.mouse.clicked;
    if (mouseAtk || inp.down('Space') || inp.hit('Space') || inp.down('KeyJ') || inp.hit('KeyJ')) {
      if (mouseAtk) {
        const wx = this.cam.x + inp.mouse.x / this.zoom, wy = this.cam.y + inp.mouse.y / this.zoom;
        const dx = wx - p.x, dy = wy - (p.y - 6), l = Math.hypot(dx, dy) || 1;
        p.aimX = dx / l; p.aimY = dy / l;
        if (p.atkCd <= 0) {
          if (Math.abs(dx) > Math.abs(dy)) p.face = dx > 0 ? 'right' : 'left'; else p.face = dy > 0 ? 'down' : 'up';
          p.faceX = p.aimX; p.faceY = p.aimY;
        }
      }
      this.attack();
    }
    if (inp.hit('KeyE')) this.interact();
    if (inp.hit('KeyF') || inp.hit('KeyQ') || inp.mouse.rclicked) this.useSelected();

    this.world.update(dt, p);
    for (const d of this.dinos) d.update(dt, this);
    // 엔티티 겹침 해소
    const all = [p, ...this.dinos];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const minX = a.hw + b.hw, minY = a.hh + b.hh;
      if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
        const l = Math.hypot(dx, dy) || 1, push = 20 * dt;
        if (a !== p) moveWithCollision(a, this.world, -dx / l * push, -dy / l * push);
        moveWithCollision(b, this.world, dx / l * push, dy / l * push);
      }
    }
    this.dinos = this.dinos.filter(d => !d.dead && dist(d.x, d.y, p.x, p.y) < 36 * TILE);
    for (const pk of this.pickups) pk.update(dt, this);
    this.pickups = this.pickups.filter(pk => !pk.dead);

    // 낮/밤 전환
    const night = this.isNight();
    if (night !== this.wasNight) {
      this.wasNight = night;
      if (night) {
        this.notify('밤이 찾아왔다... 맹수들이 깨어난다', '#ff8a8a');
        const day = this.dayNum();
        if (day >= 3 && this.rexChecked !== day) {
          this.rexChecked = day;
          if (Math.random() < 0.4 + 0.15 * (day - 3) && !this.dinos.some(d => d.type === 'rex')) {
            if (this.trySpawn('rex', 18, 26)) { this.notify('땅이 흔들린다... 티라노사우루스가 나타났다!', '#ffe14d'); SFX.play('roar'); this.shake(1, 3); }
          }
        }
      } else {
        this.notify(`아침이 밝았다 — ${this.dayNum()}일째`, '#ffe9a8');
      }
    }

    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.5; this.spawnTick(); }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 2; this.world.buildMinimap(this.minimap); }

    // 경고
    if (p.hunger < 20 && Math.random() < dt * 0.08) this.notify('배가 고프다...', '#ffb27a');
    if (p.thirst < 20 && Math.random() < dt * 0.08) this.notify('목이 마르다...', '#7cc4ff');

    this.updateEffects(dt);
    this.updateCamera(dt);
  }

  updateEffects(dt) {
    for (const pt of this.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 140 * dt; pt.life -= dt; }
    this.particles = this.particles.filter(pt => pt.life > 0);
    for (const tx of this.texts) { tx.t -= dt; tx.y -= 18 * dt; }
    this.texts = this.texts.filter(tx => tx.t > 0);
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter(m => m.t > 0);
    this.shakeT -= dt; if (this.shakeT <= 0) this.shakeA = 0;
    this.hurtFlash -= dt;
  }

  updateCamera() {
    const p = this.player;
    const LW = this.low.width, LH = this.low.height;
    let cx = p.x - LW / 2, cy = p.y - 8 - LH / 2;
    cx = clamp(cx, 0, this.world.w * TILE - LW); cy = clamp(cy, 0, this.world.h * TILE - LH);
    if (this.shakeT > 0) { cx += rand(-this.shakeA, this.shakeA); cy += rand(-this.shakeA, this.shakeA); }
    this.cam.x = Math.round(cx); this.cam.y = Math.round(cy);
  }

  // ---------- 렌더 ----------
  render() {
    const ctx = this.lctx, cam = this.cam, w = this.world;
    const LW = this.low.width, LH = this.low.height;
    ctx.imageSmoothingEnabled = false;
    const tx0 = Math.floor(cam.x / TILE), ty0 = Math.floor(cam.y / TILE);
    const tx1 = Math.floor((cam.x + LW) / TILE), ty1 = Math.floor((cam.y + LH) / TILE);
    const wf = Math.floor(performance.now() / 450) % 3;

    // 지형
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const g = w.groundAt(tx, ty);
      const v = w.inBounds(tx, ty) ? w.variant[w.idx(tx, ty)] : 0;
      let img;
      if (g === GR.DEEP) img = SPR.tiles.deep[v];
      else if (g === GR.WATER) img = SPR.tiles.water[wf][v];
      else if (g === GR.SAND) img = SPR.tiles.sand[v];
      else if (g === GR.FOREST) img = SPR.tiles.forest[v];
      else img = SPR.tiles.grass[v];
      const sx = tx * TILE - cam.x, sy = ty * TILE - cam.y;
      ctx.drawImage(img, sx, sy);
      if (g === GR.WATER || g === GR.DEEP) {
        // 물가 거품
        ctx.fillStyle = '#cfe8ff';
        if (w.isLand(tx, ty - 1)) ctx.fillRect(sx, sy, TILE, 1);
        if (w.isLand(tx, ty + 1)) ctx.fillRect(sx, sy + TILE - 1, TILE, 1);
        if (w.isLand(tx - 1, ty)) ctx.fillRect(sx, sy, 1, TILE);
        if (w.isLand(tx + 1, ty)) ctx.fillRect(sx + TILE - 1, sy, 1, TILE);
        if (g === GR.WATER && w.isLand(tx, ty - 1)) { ctx.fillStyle = 'rgba(30,60,110,0.35)'; ctx.fillRect(sx, sy + 1, TILE, 2); }
      } else if (g === GR.SAND) {
        // 모래-풀 경계를 부드럽게
        ctx.fillStyle = '#c9ab6c';
        const gN = w.groundAt(tx, ty - 1);
        if (gN === GR.GRASS || gN === GR.FOREST) for (let k = 0; k < TILE; k += 3) ctx.fillRect(sx + k, sy, 2, 1);
      }
    }

    // y정렬 드로우 목록
    const draws = [];
    const fireFrame = Math.floor(performance.now() / 160) % 2;
    for (let ty = ty0 - 1; ty <= ty1 + 2; ty++) for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const o = w.objAt(tx, ty);
      if (!o) continue;
      let img;
      switch (o) {
        case OB.TREE: img = SPR.obj.tree; break;
        case OB.PINE: img = SPR.obj.pine; break;
        case OB.ROCK: img = SPR.obj.rock; break;
        case OB.BUSH: img = SPR.obj.bush; break;
        case OB.BUSH_EMPTY: img = SPR.obj.bushEmpty; break;
        case OB.STUMP: img = SPR.obj.stump; break;
        case OB.WALL: img = SPR.obj.wall; break;
        case OB.CAMPFIRE: {
          const f = w.fires.get(w.idx(tx, ty));
          img = f && f.fuel > 0 ? (fireFrame ? SPR.obj.fire1 : SPR.obj.fire2) : SPR.obj.fireOff;
          break;
        }
      }
      const bx = tx * TILE + 8, by = ty * TILE + TILE;
      const isTree = o === OB.TREE || o === OB.PINE;
      draws.push({
        y: by - (isTree ? 3 : 2), fn: () => {
          if (isTree || o === OB.ROCK) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; pixelEllipse(ctx, bx - cam.x, by - 2 - cam.y, isTree ? 6 : 6, 2); }
          ctx.drawImage(img, Math.round(bx - img.width / 2 - cam.x), Math.round(by - img.height + (isTree ? 1 : 0) - cam.y));
        },
      });
    }
    for (const pk of this.pickups) draws.push({ y: pk.y - 1, fn: () => pk.draw(ctx, cam) });
    for (const d of this.dinos) draws.push({ y: d.y, fn: () => d.draw(ctx, cam) });
    const p = this.player;
    if (this.state !== 'title') draws.push({ y: p.y, fn: () => this.drawPlayer(ctx, cam) });
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.fn();

    // 설치 미리보기
    if (this.state === 'play' && (HOTBAR[this.selected] === 'campfire' || HOTBAR[this.selected] === 'wall') && p.inv[HOTBAR[this.selected]] > 0) {
      const t = this.placeTarget();
      ctx.globalAlpha = 0.5;
      const img = HOTBAR[this.selected] === 'campfire' ? SPR.obj.fireOff : SPR.obj.wall;
      ctx.drawImage(img, Math.round(t.tx * TILE + 8 - img.width / 2 - cam.x), t.ty * TILE + TILE - img.height - cam.y);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = t.ok ? '#b8e986' : '#ff5a6a';
      ctx.strokeRect(t.tx * TILE - cam.x + 0.5, t.ty * TILE - cam.y + 0.5, TILE - 1, TILE - 1);
    }

    // 파티클
    for (const pt of this.particles) { ctx.fillStyle = pt.color; ctx.fillRect(Math.round(pt.x - cam.x), Math.round(pt.y - cam.y), 1, 1); }

    // 조명 (밤)
    const dark = this.darkness();
    const ph = this.phase();
    if (ph > 0.52 && ph < 0.7) { // 노을
      const a = Math.sin((ph - 0.52) / 0.18 * Math.PI) * 0.18;
      ctx.fillStyle = `rgba(255,110,40,${a})`; ctx.fillRect(0, 0, LW, LH);
    }
    if (dark > 0.01) {
      const L = this.lightCtx;
      L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, LW, LH);
      L.fillStyle = `rgba(8,10,34,${dark})`;
      L.fillRect(0, 0, LW, LH);
      L.globalCompositeOperation = 'destination-out';
      const hole = (x, y, r) => {
        const gr = L.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = gr; L.fillRect(x - r, y - r, r * 2, r * 2);
      };
      hole(p.x - cam.x, p.y - 8 - cam.y, 46);
      const glows = [];
      for (const [i, f] of w.fires) {
        if (f.fuel <= 0) continue;
        const fx = (i % w.w) * TILE + 8 - cam.x, fy = Math.floor(i / w.w) * TILE + 8 - cam.y;
        if (fx < -120 || fy < -120 || fx > LW + 120 || fy > LH + 120) continue;
        const r = (f.fuel < 20 ? 50 : 80) + Math.sin(performance.now() / 120 + i) * 3;
        hole(fx, fy, r); glows.push([fx, fy, r]);
      }
      ctx.drawImage(this.light, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const [fx, fy, r] of glows) {
        const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 0.7);
        gr.addColorStop(0, `rgba(255,140,40,${0.25 * dark})`); gr.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = gr; ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      // 어둠 속 맹수의 눈
      for (const d of this.dinos) {
        if (!d.def.carn || dist(d.x, d.y, p.x, p.y) < 40) continue;
        const ex = Math.round(d.x - cam.x + (d.facingRight ? d.hw : -d.hw)), ey = Math.round(d.y - cam.y - (d.def.boss ? 34 : d.hh * 2 + 6));
        ctx.fillStyle = d.def.boss ? '#ffe14d' : '#ff3b3b';
        ctx.globalAlpha = dark; ctx.fillRect(ex, ey, 1, 1); ctx.globalAlpha = 1;
      }
    }

    // 확대 출력
    const C = this.ctx;
    C.imageSmoothingEnabled = false;
    C.drawImage(this.low, 0, 0, LW * this.zoom, LH * this.zoom);
    if (this.hurtFlash > 0) { C.fillStyle = `rgba(200,20,40,${this.hurtFlash})`; C.fillRect(0, 0, this.canvas.width, this.canvas.height); }

    this.renderUI();
  }

  drawPlayer(ctx, cam) {
    const p = this.player;
    if (p.invT > 0 && Math.floor(p.invT * 20) % 2) return;
    const img = p.hurtT > 0 ? SPR.playerHurt : p.sprite();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    pixelEllipse(ctx, p.x - cam.x, p.y - cam.y + 1, 4, 1);
    const bob = p.moving ? Math.floor(p.anim) % 2 : 0;
    const x = Math.round(p.x - img.width / 2 - cam.x), y = Math.round(p.y - img.height + 2 - cam.y - bob);
    // 무기 (뒤쪽일 때 먼저)
    const drawWeapon = () => {
      if (p.weapon === 0 && p.atkT <= 0) return;
      const icon = p.weapon === 2 ? SPR.icon.bonespear : p.weapon === 1 ? SPR.icon.spear : null;
      if (!icon) return;
      ctx.save();
      const hx = p.x - cam.x + (p.face === 'left' ? -4 : p.face === 'right' ? 4 : 3), hy = p.y - cam.y - 7;
      ctx.translate(Math.round(hx), Math.round(hy));
      let ang;
      if (p.atkT > 0) {
        ang = Math.atan2(p.aimY, p.aimX) + Math.PI / 4;
        const thrust = (0.16 - p.atkT) / 0.16;
        ctx.translate(Math.round(p.aimX * thrust * 6), Math.round(p.aimY * thrust * 6));
      } else ang = p.face === 'left' ? -Math.PI / 2 + 0.3 : -0.2;
      ctx.rotate(ang);
      ctx.drawImage(icon, -2, -icon.height + 2);
      ctx.restore();
    };
    if (p.face === 'up') drawWeapon();
    ctx.drawImage(img, x, y);
    if (p.face !== 'up') drawWeapon();
    // 휘두르기 궤적
    if (p.atkT > 0) {
      const reach = WEAPONS[p.weapon].reach;
      const base = Math.atan2(p.aimY, p.aimX);
      const prog = 1 - p.atkT / 0.16;
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 5; k++) {
        const a = base - 0.9 + (prog * 1.8) - k * 0.18;
        if (a < base - 0.9) continue;
        const rr = reach * 0.85;
        ctx.globalAlpha = 1 - k * 0.18;
        ctx.fillRect(Math.round(p.x - cam.x + Math.cos(a) * rr), Math.round(p.y - 6 - cam.y + Math.sin(a) * rr), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- UI ----------
  text(str, x, y, size, color = '#fff', align = 'left', outline = true) {
    const C = this.ctx;
    C.font = `bold ${Math.round(size * this.ui)}px ${FONT}`;
    C.textAlign = align; C.textBaseline = 'top';
    if (outline) { C.lineWidth = 4; C.strokeStyle = '#1a1220'; C.lineJoin = 'round'; C.strokeText(str, x, y); }
    C.fillStyle = color; C.fillText(str, x, y);
  }

  panel(x, y, w, h, alpha = 0.72) {
    const C = this.ctx;
    C.fillStyle = `rgba(20,16,32,${alpha})`; C.fillRect(x, y, w, h);
    C.strokeStyle = '#e8d8b0'; C.lineWidth = 2; C.strokeRect(x + 1, y + 1, w - 2, h - 2);
    C.strokeStyle = '#1a1220'; C.strokeRect(x - 1, y - 1, w + 2, h + 2);
  }

  icon(name, x, y, s) {
    const img = SPR.icon[name];
    const C = this.ctx;
    C.imageSmoothingEnabled = false;
    const scale = Math.max(1, Math.floor(s / Math.max(img.width, img.height)));
    C.drawImage(img, Math.round(x + (s - img.width * scale) / 2), Math.round(y + (s - img.height * scale) / 2), img.width * scale, img.height * scale);
  }

  bar(x, y, w, h, v, max, col, label) {
    const C = this.ctx;
    C.fillStyle = '#1a1220'; C.fillRect(x - 2, y - 2, w + 4, h + 4);
    C.fillStyle = '#3a3048'; C.fillRect(x, y, w, h);
    const fw = Math.round(w * clamp(v / max, 0, 1));
    C.fillStyle = col; C.fillRect(x, y, fw, h);
    C.fillStyle = 'rgba(255,255,255,0.25)'; C.fillRect(x, y, fw, Math.max(2, h / 4));
    if (v / max < 0.2 && Math.floor(performance.now() / 300) % 2) { C.fillStyle = 'rgba(255,255,255,0.3)'; C.fillRect(x, y, fw, h); }
    this.text(label, x + 6, y + Math.round(h / 2) - 7 * this.ui, 13, '#fff');
    this.text(`${Math.ceil(v)}`, x + w - 6, y + Math.round(h / 2) - 7 * this.ui, 13, '#fff', 'right');
  }

  renderUI() {
    const C = this.ctx, W = this.canvas.width, H = this.canvas.height, u = this.ui;
    const p = this.player;

    if (this.state === 'title') { this.renderTitle(); return; }

    // 떠오르는 숫자
    for (const t of this.texts) {
      const sx = (t.x - this.cam.x) * this.zoom, sy = (t.y - this.cam.y) * this.zoom;
      C.globalAlpha = clamp(t.t * 2, 0, 1);
      this.text(t.text, sx, sy, 15, t.color, 'center');
      C.globalAlpha = 1;
    }

    // 상태 바
    const bw = Math.round(200 * u), bh = Math.round(18 * u), bx = 16, by = 16;
    this.panel(bx - 8, by - 8, bw + 16, bh * 4 + 16 + 3 * 8);
    this.bar(bx, by, bw, bh, p.hp, p.maxHp, '#d8344a', '체력');
    this.bar(bx, by + (bh + 8), bw, bh, p.hunger, 100, '#e8923a', '포만감');
    this.bar(bx, by + (bh + 8) * 2, bw, bh, p.thirst, 100, '#3a8ee8', '수분');
    this.bar(bx, by + (bh + 8) * 3, bw, bh, p.stamina, 100, '#e8d03a', '기력');

    // 자원
    const ry = by + (bh + 8) * 4 + 14, rs = Math.round(28 * u);
    const res = ['wood', 'stone', 'fiber', 'hide', 'bone'];
    this.panel(bx - 8, ry - 6, bw + 16, rs + 12);
    res.forEach((k, i) => {
      const x = bx + i * Math.round(42 * u);
      this.icon(k, x, ry, rs);
      this.text(`${p.inv[k]}`, x + rs + 1, ry + rs - 14 * u, 13, '#fff');
    });
    // 장비
    const ey = ry + rs + 18;
    const equip = [];
    if (p.weapon === 1) equip.push('spear'); if (p.weapon === 2) equip.push('bonespear');
    if (p.hasAxe) equip.push('axe'); if (p.armor) equip.push('armor');
    if (equip.length) {
      this.panel(bx - 8, ey - 6, equip.length * Math.round(40 * u) + 16, rs + 12);
      equip.forEach((k, i) => this.icon(k, bx + i * Math.round(40 * u), ey, rs));
    }

    // 시계
    const day = this.dayNum(), night = this.isNight();
    const cw = Math.round(180 * u);
    this.panel(W / 2 - cw / 2, 10, cw, Math.round(44 * u));
    this.text(`${day}일째`, W / 2, 16, 18, night ? '#9fb4ff' : '#ffe9a8', 'center');
    const ph = this.phase();
    const tw = cw - 24, tx = W / 2 - tw / 2, tyy = 16 + 24 * u;
    C.fillStyle = '#3a3048'; C.fillRect(tx, tyy, tw, 6 * u);
    C.fillStyle = '#e8c45a'; C.fillRect(tx, tyy, tw * 0.62, 6 * u);
    C.fillStyle = '#3d4a8a'; C.fillRect(tx + tw * 0.66, tyy, tw * 0.29, 6 * u);
    C.fillStyle = '#ffffff'; C.fillRect(tx + tw * ph - 2, tyy - 3, 4, 6 * u + 6);

    // 미니맵
    if (this.showMap) {
      const ms = Math.round(150 * u), mx = W - ms - 16, my = 16;
      this.panel(mx - 6, my - 6, ms + 12, ms + 12, 0.9);
      C.imageSmoothingEnabled = false;
      C.drawImage(this.minimap, mx, my, ms, ms);
      const sc = ms / this.world.w;
      for (const d of this.dinos) {
        if (!d.def.carn) continue;
        C.fillStyle = d.def.boss ? '#ffe14d' : '#ff4040';
        C.fillRect(mx + d.x / TILE * sc - 1, my + d.y / TILE * sc - 1, d.def.boss ? 4 : 2, d.def.boss ? 4 : 2);
      }
      if (Math.floor(performance.now() / 400) % 2) { C.fillStyle = '#ffffff'; C.fillRect(mx + p.x / TILE * sc - 2, my + p.y / TILE * sc - 2, 4, 4); }
      // 뷰 영역
      C.strokeStyle = 'rgba(255,255,255,0.5)'; C.lineWidth = 1;
      C.strokeRect(mx + this.cam.x / TILE * sc, my + this.cam.y / TILE * sc, this.low.width / TILE * sc, this.low.height / TILE * sc);
    }

    // 보스 체력
    const rex = this.dinos.find(d => d.def.boss && dist(d.x, d.y, p.x, p.y) < 260);
    if (rex) {
      const w = Math.min(500, W * 0.5), x = W / 2 - w / 2, y = 10 + 54 * u;
      this.text('티라노사우루스', W / 2, y, 16, '#ffe14d', 'center');
      this.bar(x, y + 22 * u, w, 12, rex.hp, rex.def.hp, '#b3283a', '');
    }

    // 핫바
    const ss = Math.round(52 * u), gap = 6, hw = HOTBAR.length * (ss + gap) - gap;
    const hx = W / 2 - hw / 2, hy = H - ss - 18;
    this.hotbarRects = [];
    HOTBAR.forEach((k, i) => {
      const x = hx + i * (ss + gap);
      this.hotbarRects.push({ x, y: hy, w: ss, h: ss });
      this.panel(x, hy, ss, ss, i === this.selected ? 0.9 : 0.6);
      if (i === this.selected) { C.strokeStyle = '#ffe14d'; C.lineWidth = 3; C.strokeRect(x - 2, hy - 2, ss + 4, ss + 4); }
      C.globalAlpha = p.inv[k] > 0 ? 1 : 0.3;
      this.icon(k, x + 6, hy + 6, ss - 12);
      C.globalAlpha = 1;
      this.text(`${i + 1}`, x + 5, hy + 3, 12, '#c8b8a0');
      this.text(`${p.inv[k]}`, x + ss - 5, hy + ss - 18 * u, 14, '#fff', 'right');
    });
    this.text(ITEM_NAMES[HOTBAR[this.selected]] + '  [F] 사용', W / 2, hy - 24 * u, 14, '#ffe9a8', 'center');

    // 상호작용 안내
    if (this.state === 'play') {
      const it = this.findInteraction();
      if (it) {
        const sx = (p.x - this.cam.x) * this.zoom, sy = (p.y - 30 - this.cam.y) * this.zoom;
        this.text(it.label, sx, sy - 10, 14, '#ffffff', 'center');
      }
      const fire = this.world.fireNear(p.x, p.y, 40);
      if (fire) {
        const sx = (fire.x - this.cam.x) * this.zoom, sy = (fire.y + 8 - this.cam.y) * this.zoom;
        const fw = 40;
        C.fillStyle = '#1a1220'; C.fillRect(sx - fw / 2 - 1, sy - 1, fw + 2, 6);
        C.fillStyle = '#ff9a2e'; C.fillRect(sx - fw / 2, sy, fw * fire.f.fuel / FIRE_MAX_FUEL, 4);
      }
    }

    // 조작법
    if (W > 900) {
      const lines = ['WASD 이동 · Shift 달리기', '클릭/Space 공격·채집', 'E 상호작용 · F 사용', '1~6 선택 · C 제작 · M 지도'];
      lines.forEach((l, i) => this.text(l, 16, H - 20 - (lines.length - i) * 18 * u, 12, 'rgba(255,255,255,0.75)'));
    }

    // 알림
    if (this.state !== 'craft') this.messages.forEach((m, i) => {
      C.globalAlpha = clamp(m.t, 0, 1);
      this.text(m.text, W / 2, H * 0.22 + i * 26 * u, 17, m.color, 'center');
      C.globalAlpha = 1;
    });

    if (this.state === 'craft') this.renderCraft();
    if (this.state === 'paused') {
      C.fillStyle = 'rgba(0,0,0,0.5)'; C.fillRect(0, 0, W, H);
      this.text('일시정지', W / 2, H / 2 - 30, 32, '#fff', 'center');
      this.text('P / Esc 로 계속', W / 2, H / 2 + 14, 16, '#ccc', 'center');
    }
    if (this.state === 'dead') {
      C.fillStyle = 'rgba(40,0,10,0.6)'; C.fillRect(0, 0, W, H);
      this.text('사망했습니다', W / 2, H / 2 - 80, 40, '#ff5a6a', 'center');
      this.text(`원인: ${this.deathCause}`, W / 2, H / 2 - 24, 18, '#ffd0d0', 'center');
      this.text(`${this.dayNum()}일 생존 · 공룡 ${this.kills}마리 사냥`, W / 2, H / 2 + 8, 20, '#fff', 'center');
      this.text('Enter / R 로 새 게임', W / 2, H / 2 + 56, 16, '#ccc', 'center');
    }
  }

  renderCraft() {
    const C = this.ctx, W = this.canvas.width, H = this.canvas.height, u = this.ui, p = this.player;
    C.fillStyle = 'rgba(0,0,0,0.45)'; C.fillRect(0, 0, W, H);
    const rowH = Math.round(54 * u), pw = Math.min(W - 32, Math.round(560 * u)), ph = rowH * RECIPES.length + 80;
    const px = W / 2 - pw / 2, py = Math.max(16, H / 2 - ph / 2);
    this.panel(px, py, pw, ph, 0.94);
    this.text('제작', px + pw / 2, py + 12, 22, '#ffe9a8', 'center');
    this.craftRects = [];
    RECIPES.forEach((r, i) => {
      const y = py + 50 + i * rowH;
      const can = this.canCraft(r), done = r.once && this.hasCrafted(r.id);
      this.craftRects.push([r, { x: px + 8, y, w: pw - 16, h: rowH - 6 }]);
      C.fillStyle = can ? 'rgba(120,200,90,0.18)' : 'rgba(255,255,255,0.04)';
      C.fillRect(px + 8, y, pw - 16, rowH - 6);
      this.text(`${i + 1}`, px + 20, y + 14 * u, 16, '#c8b8a0');
      this.icon(r.id === 'campfire' || r.id === 'wall' || r.id === 'bandage' ? r.id : r.id, px + 40, y + 4, rowH - 14);
      this.text(r.name, px + 40 + rowH, y + 6 * u, 16, done ? '#8a8a8a' : '#ffffff');
      this.text(done ? '보유 중' : r.desc, px + 40 + rowH, y + 26 * u, 12, done ? '#8a8a8a' : '#c8c0d8');
      // 비용
      let cx = px + pw - 20;
      const costs = Object.entries(r.cost).reverse();
      for (const [k, n] of costs) {
        const have = p.inv[k] || 0;
        this.text(`${n}`, cx, y + 14 * u, 15, done ? '#8a8a8a' : have >= n ? '#b8e986' : '#ff7a7a', 'right');
        cx -= 22 * u;
        this.icon(k, cx - 18 * u, y + 8 * u, 26 * u);
        cx -= 36 * u;
      }
    });
    this.text('숫자키 또는 클릭으로 제작 · C / Esc 닫기', px + pw / 2, py + ph - 26, 13, '#c8b8a0', 'center');
  }

  renderTitle() {
    const C = this.ctx, W = this.canvas.width, H = this.canvas.height;
    C.fillStyle = 'rgba(10,8,24,0.55)'; C.fillRect(0, 0, W, H);
    const s = Math.max(4, Math.floor(Math.min(W, H) / 120));
    C.imageSmoothingEnabled = false;
    const rex = SPR.dino.rex.r;
    const rs = Math.max(2, Math.floor(s / 1.5));
    C.drawImage(rex, W / 2 - rex.width * rs / 2, H * 0.12, rex.width * rs, rex.height * rs);
    this.text('공룡섬 생존기', W / 2, H * 0.12 + rex.height * rs + 16, Math.min(64, W / 12), '#ffe14d', 'center');
    this.text('DINO ISLAND SURVIVAL', W / 2, H * 0.12 + rex.height * rs + 16 + Math.min(70, W / 11), 16, '#e8d8b0', 'center');
    const lines = [
      '나무와 돌을 모아 도구를 만들고, 공룡을 사냥해 살아남으세요.',
      '밤에는 맹수가 몰려옵니다. 모닥불 곁은 안전합니다.',
      '',
      'WASD 이동 · Shift 달리기 · 클릭/Space 공격·채집',
      'E 물 마시기·고기 굽기·장작 넣기 · F 아이템 사용 · C 제작',
    ];
    const base = H * 0.12 + rex.height * rs + 120;
    lines.forEach((l, i) => this.text(l, W / 2, base + i * 24, 15, '#ffffff', 'center'));
    if (Math.floor(performance.now() / 500) % 2) this.text('Enter 또는 클릭으로 시작', W / 2, base + lines.length * 24 + 24, 20, '#b8e986', 'center');
  }
}
