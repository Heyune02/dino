'use strict';
// ---------- 엔티티: 플레이어, 공룡, 드롭 아이템 ----------

function moveWithCollision(e, world, dx, dy) {
  const hit = (x, y) => {
    const x0 = Math.floor((x - e.hw) / TILE), x1 = Math.floor((x + e.hw) / TILE);
    const y0 = Math.floor((y - e.hh) / TILE), y1 = Math.floor((y + e.hh) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (world.isSolid(tx, ty)) return true;
    return false;
  };
  let moved = false;
  if (dx && !hit(e.x + dx, e.y)) { e.x += dx; moved = true; }
  if (dy && !hit(e.x, e.y + dy)) { e.y += dy; moved = true; }
  return moved;
}

const WEAPONS = [
  { name: '맨손', dmg: 2, reach: 12 },
  { name: '돌창', dmg: 6, reach: 17 },
  { name: '뼈창', dmg: 11, reach: 19 },
];

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hw = 4; this.hh = 3;
    this.maxHp = 100; this.hp = 100;
    this.hunger = 100; this.thirst = 100; this.stamina = 100;
    this.face = 'down'; this.faceX = 0; this.faceY = 1;
    this.aimX = 0; this.aimY = 1;
    this.atkCd = 0; this.atkT = 0;
    this.anim = 0; this.moving = false;
    this.invT = 0; this.hurtT = 0;
    this.kx = 0; this.ky = 0;
    this.weapon = 0; this.hasAxe = false; this.armor = false;
    this.inv = { wood: 0, stone: 0, fiber: 0, hide: 0, bone: 0, berry: 2, meat: 0, cooked: 0, bandage: 0, campfire: 0, wall: 0 };
    this.dead = false;
    this.sprinting = false;
  }

  update(dt, game) {
    const inp = game.input;
    let mx = 0, my = 0;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) mx -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) mx += 1;
    if (inp.down('KeyW') || inp.down('ArrowUp')) my -= 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) my += 1;
    this.moving = mx !== 0 || my !== 0;
    if (this.moving) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      this.faceX = mx; this.faceY = my; this.aimX = mx; this.aimY = my;
      if (Math.abs(mx) > Math.abs(my)) this.face = mx > 0 ? 'right' : 'left';
      else this.face = my > 0 ? 'down' : 'up';
    }
    const wantSprint = inp.down('ShiftLeft') || inp.down('ShiftRight');
    this.sprinting = wantSprint && this.moving && this.stamina > 1;
    const speed = this.sprinting ? 112 : 72;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - 22 * dt);
    else this.stamina = Math.min(100, this.stamina + (this.moving ? 10 : 18) * dt);

    this.kx *= Math.pow(0.0005, dt); this.ky *= Math.pow(0.0005, dt);
    moveWithCollision(this, game.world, (mx * speed + this.kx) * dt, (my * speed + this.ky) * dt);
    if (this.moving) this.anim += dt * (this.sprinting ? 12 : 8);

    this.atkCd -= dt; this.atkT -= dt; this.invT -= dt; this.hurtT -= dt;

    // 생존 수치
    const sprintMul = this.sprinting ? 1.8 : 1;
    this.hunger = Math.max(0, this.hunger - 0.32 * dt * sprintMul);
    this.thirst = Math.max(0, this.thirst - 0.45 * dt * sprintMul);
    let regen = 0;
    if (this.hunger <= 0) regen -= 1.5;
    if (this.thirst <= 0) regen -= 2;
    if (this.hunger > 50 && this.thirst > 50) regen += 0.6;
    const fire = game.world.nearestFire(this.x, this.y, 40);
    if (fire) regen += 1.6;
    if (regen) this.hp = clamp(this.hp + regen * dt, 0, this.maxHp);
    if (this.hp <= 0 && !this.dead) game.onPlayerDeath(this.hunger <= 0 ? '굶주림' : this.thirst <= 0 ? '탈수' : '부상');
  }

  sprite() {
    const set = this.armor ? SPR.playerArmor : SPR.player;
    const frame = this.moving ? 1 + (Math.floor(this.anim) % 2) : 0;
    return set[this.face][frame];
  }
}

const DINO_DEFS = {
  compy: { name: '콤프소그나투스', hp: 8, speed: 34, chase: 80, dmg: 4, range: 11, cd: 0.8, aggro: 80, carn: true, behavior: 'hunt', hw: 4, hh: 3, knock: 1,
    drops: { meat: [1, 1], bone: [0, 1] } },
  raptor: { name: '랩터', hp: 22, speed: 40, chase: 106, dmg: 9, range: 15, cd: 1.0, aggro: 115, carn: true, behavior: 'hunt', hw: 6, hh: 4, knock: 0.8,
    drops: { meat: [2, 2], hide: [1, 2], bone: [1, 2] } },
  para: { name: '파라사우롤로푸스', hp: 24, speed: 22, flee: 98, carn: false, behavior: 'flee', hw: 8, hh: 5, knock: 0.6,
    drops: { meat: [3, 4], hide: [1, 2], bone: [1, 2] } },
  trike: { name: '트리케라톱스', hp: 55, speed: 18, chase: 92, dmg: 16, range: 18, cd: 1.4, carn: false, behavior: 'defend', hw: 9, hh: 5, knock: 0.35,
    drops: { meat: [5, 6], hide: [3, 4], bone: [2, 3] } },
  rex: { name: '티라노사우루스', hp: 200, speed: 34, chase: 84, dmg: 28, range: 30, cd: 1.6, aggro: 170, carn: true, behavior: 'hunt', hw: 14, hh: 7, knock: 0.15, boss: true,
    drops: { meat: [12, 12], hide: [6, 6], bone: [6, 8] } },
};

class Dino {
  constructor(type, x, y) {
    this.type = type; this.def = DINO_DEFS[type];
    this.x = x; this.y = y;
    this.hw = this.def.hw; this.hh = this.def.hh;
    this.hp = this.def.hp;
    this.state = 'wander'; this.stateT = rand(0, 2);
    this.dirX = 0; this.dirY = 0; this.facingRight = Math.random() < 0.5;
    this.cd = 0; this.hurtT = 0; this.anim = Math.random() * 10;
    this.kx = 0; this.ky = 0;
    this.stuckT = 0; this.detourT = 0; this.detourX = 0; this.detourY = 0;
    this.lungeT = 0;
    this.dead = false;
    this.roared = false;
  }

  takeDamage(n, fromX, fromY, game) {
    this.hp -= n;
    this.hurtT = 0.15;
    const d = Math.max(1, dist(fromX, fromY, this.x, this.y));
    const k = 160 * this.def.knock;
    this.kx = (this.x - fromX) / d * k; this.ky = (this.y - fromY) / d * k;
    if (this.def.behavior === 'flee') { this.state = 'flee'; this.stateT = 6; }
    else if (this.def.behavior === 'defend') { this.state = 'chase'; this.stateT = 9; }
    else { this.state = 'chase'; }
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    this.dead = true;
    for (const [item, [a, b]] of Object.entries(this.def.drops)) {
      const n = randi(a, b);
      for (let k = 0; k < n; k++) game.spawnPickup(item, this.x + rand(-8, 8), this.y + rand(-6, 4));
    }
    game.kills++;
    game.burst(this.x, this.y - 6, '#b3283a', 14);
    SFX.play('die');
    if (this.def.boss) game.notify('티라노사우루스를 쓰러뜨렸다!', '#ffe14d');
  }

  update(dt, game) {
    const def = this.def, p = game.player;
    this.cd -= dt; this.stateT -= dt; this.hurtT -= dt; this.lungeT -= dt; this.detourT -= dt;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const night = game.isNight();
    let vx = 0, vy = 0, spd = 0;

    if (def.behavior === 'hunt' && !p.dead) {
      const aggro = def.aggro * (night ? 1.35 : 1);
      if (this.state !== 'chase' && d < aggro) {
        this.state = 'chase';
        if (def.boss && !this.roared) { this.roared = true; SFX.play('roar'); game.shake(0.6, 4); }
      }
      if (this.state === 'chase' && d > aggro * 1.8) this.state = 'wander';
    }
    if (p.dead && this.state === 'chase') this.state = 'wander';
    if (def.behavior === 'defend' && this.state === 'chase' && this.stateT <= 0) this.state = 'wander';
    if (def.behavior === 'flee' && this.state === 'flee' && this.stateT <= 0) this.state = 'wander';

    if (this.state === 'chase') {
      if (d > def.range) { vx = dx / d; vy = dy / d; spd = def.chase; }
      if (d < def.range + 4 && this.cd <= 0) {
        this.cd = def.cd; this.lungeT = 0.15;
        game.hurtPlayer(def.dmg, this);
      }
    } else if (this.state === 'flee') {
      vx = -dx / (d || 1); vy = -dy / (d || 1); spd = def.flee;
    } else {
      if (this.stateT <= 0) {
        this.stateT = rand(1.5, 4);
        if (Math.random() < 0.4) { this.dirX = 0; this.dirY = 0; }
        else { const a = rand(0, Math.PI * 2); this.dirX = Math.cos(a); this.dirY = Math.sin(a); }
      }
      vx = this.dirX; vy = this.dirY; spd = def.speed;
    }

    // 모닥불 공포: 육식/공격 상태인 공룡은 불 근처에서 밀려난다
    if (def.carn || this.state === 'chase') {
      const f = game.world.nearestFire(this.x, this.y, FIRE_FEAR_R + 16);
      if (f) {
        const push = (FIRE_FEAR_R + 16 - f.d) / 16;
        const nx = (this.x - f.x) / (f.d || 1), ny = (this.y - f.y) / (f.d || 1);
        vx += nx * push * 1.5; vy += ny * push * 1.5;
        if (spd === 0) spd = def.chase || def.speed;
        if (f.d < FIRE_FEAR_R && this.state === 'chase' && def.behavior === 'hunt') { this.cd = Math.max(this.cd, 0.3); }
      }
    }

    // 막혔을 때 우회
    if (this.detourT > 0) { vx = this.detourX; vy = this.detourY; }
    const l = Math.hypot(vx, vy);
    if (l > 0) { vx /= l; vy /= l; }
    if (Math.abs(vx) > 0.15) this.facingRight = vx > 0;
    if (this.state === 'chase' && d > 1 && Math.abs(dx) > 4) this.facingRight = dx > 0;

    this.kx *= Math.pow(0.002, dt); this.ky *= Math.pow(0.002, dt);
    const ox = this.x, oy = this.y;
    const mdx = (vx * spd + this.kx) * dt, mdy = (vy * spd + this.ky) * dt;
    moveWithCollision(this, game.world, mdx, mdy);
    const movedDist = Math.hypot(this.x - ox, this.y - oy);
    const intended = Math.hypot(mdx, mdy);
    if (intended > 0.2 && movedDist < intended * 0.3) {
      this.stuckT += dt;
      if (this.stuckT > 0.35) {
        this.stuckT = 0; this.detourT = rand(0.4, 0.9);
        const s = Math.random() < 0.5 ? 1 : -1;
        this.detourX = -vy * s; this.detourY = vx * s;
        if (this.state === 'wander') this.stateT = 0;
      }
    } else this.stuckT = 0;
    if (movedDist > 0.05) this.anim += dt * (spd > 60 ? 12 : 6);
  }

  draw(ctx, cam) {
    const set = SPR.dino[this.type];
    const flash = this.hurtT > 0;
    const img = this.facingRight ? (flash ? set.wr : set.r) : (flash ? set.wl : set.l);
    const bob = Math.floor(this.anim) % 2;
    const lunge = this.lungeT > 0 ? (this.facingRight ? 3 : -3) : 0;
    const x = Math.round(this.x - img.width / 2 - cam.x + lunge);
    const y = Math.round(this.y - img.height + 2 - cam.y - bob);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    pixelEllipse(ctx, this.x - cam.x, this.y - cam.y + 1, Math.ceil(img.width * 0.32), Math.max(2, Math.ceil(img.width * 0.09)));
    ctx.drawImage(img, x, y);
    // 체력바 (피해를 입은 경우)
    if (this.hp < this.def.hp && !this.def.boss) {
      const w = 14, hx = Math.round(this.x - cam.x - w / 2), hy = y - 4;
      ctx.fillStyle = '#1a1220'; ctx.fillRect(hx - 1, hy - 1, w + 2, 4);
      ctx.fillStyle = '#d8344a'; ctx.fillRect(hx, hy, Math.max(1, Math.round(w * this.hp / this.def.hp)), 2);
    }
  }
}

const ITEM_NAMES = {
  wood: '나무', stone: '돌', fiber: '섬유', hide: '가죽', bone: '뼈', berry: '베리', meat: '날고기',
  cooked: '구운 고기', bandage: '붕대', campfire: '모닥불', wall: '나무 방벽',
};

class Pickup {
  constructor(item, x, y) {
    this.item = item; this.x = x; this.y = y;
    this.hw = 1; this.hh = 1;
    this.t = 0; this.z = 6; this.vz = rand(40, 70);
    this.vx = rand(-20, 20); this.vy = rand(-10, 10);
    this.dead = false;
  }
  update(dt, game) {
    this.t += dt;
    this.vz -= 220 * dt; this.z += this.vz * dt;
    if (this.z <= 0) { this.z = 0; this.vz = Math.abs(this.vz) > 25 ? -this.vz * 0.4 : 0; this.vx *= 0.6; this.vy *= 0.6; }
    const p = game.player;
    const d = dist(p.x, p.y - 4, this.x, this.y);
    if (this.t > 0.4 && d < 30 && !p.dead) {
      const s = 160 * dt;
      this.x += (p.x - this.x) / d * s; this.y += (p.y - 4 - this.y) / d * s;
      if (d < 7) {
        this.dead = true;
        game.addItem(this.item, 1);
        SFX.play('pick');
      }
    } else {
      moveWithCollision(this, game.world, this.vx * dt, this.vy * dt);
    }
    if (this.t > 90) this.dead = true;
  }
  draw(ctx, cam) {
    const img = SPR.icon[this.item];
    if (this.t > 80 && Math.floor(this.t * 8) % 2) return;
    const bob = this.z === 0 ? Math.round(Math.sin(this.t * 4)) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    pixelEllipse(ctx, this.x - cam.x, this.y - cam.y, 3, 1);
    ctx.drawImage(img, Math.round(this.x - img.width / 2 - cam.x), Math.round(this.y - img.height - this.z - cam.y + bob));
  }
}
