// =====================================================
// crowd.js — 客席の観客の人影（PC版 Audience / StageCrowd の移植）
// =====================================================
import { W, H, TAU, Rect, Rng, Surface, draw, transform } from "./pg.js";
import * as C from "./cfg.js";

const colliderect = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class Audience {
  static BW = 48; static BH = 70; static N_KIND = 7; static N_SIZE = 8;
  get BW() { return Audience.BW; } get BH() { return Audience.BH; } get N_KIND() { return Audience.N_KIND; } get N_SIZE() { return Audience.N_SIZE; }

  constructor(zone = "play", want = null, extraBlocked = []) {
    this.W = W; this.H = H; this.zone = zone;
    this.want = Math.trunc(want ?? C.CLUB_AUDIENCE_MAX);
    this.extra_blocked = extraBlocked.map((r) => new Rect(r));
    this.ok = true; this._rot = new Map();
    this.slots = []; this.order = []; this.rank = [];
    try { this._build_slots(); this._build_sprites(); }
    catch (e) { console.warn("[店内演出] 観客を用意できませんでした（観客なしで動かします）", e); this.ok = false; this.slots = []; }
    this.capacity = this.slots.length;
    const steps = Math.max(1, Math.trunc(C.CLUB_AUDIENCE_MAX / Math.max(1, C.CLUB_AUDIENCE_STEP_COUNT)));
    this.per_step = this.capacity >= C.CLUB_AUDIENCE_MAX ? C.CLUB_AUDIENCE_STEP_COUNT : Math.ceil(this.capacity / steps);
    this.reset();
  }
  reset() {
    this.shown = 0; this.pops = []; this.queue = 0; this.queue_t = 0; this.gap = 0.04; this.sway = 0; this.t = 0;
    this._baked = null; this._baked_bg = null; this._baked_shown = -1;
  }
  fill(n) { this.pops = []; this.queue = 0; this.shown = Math.max(0, Math.min(this.capacity, Math.trunc(n))); }

  _person(s, kind, col, ox, oy) {
    const cx = 48 + ox, wide = [0, 6, -4, 2, 8, -2, 4][kind % 7];
    draw.polygon(s, col, [[cx - 38 - wide, 140 + oy], [cx - 36 - wide, 86 + oy], [cx - 26 - Math.floor(wide / 2), 70 + oy], [cx - 8, 62 + oy],
      [cx + 8, 62 + oy], [cx + 26 + Math.floor(wide / 2), 70 + oy], [cx + 36 + wide, 86 + oy], [cx + 38 + wide, 140 + oy]]);
    draw.rect(s, col, [cx - 7, 48 + oy, 14, 16]);
    draw.circle(s, col, [cx, 34 + oy], 20);
    const k = kind % 7;
    if (k === 1) draw.ellipse(s, col, [cx - 25, 12 + oy, 50, 52]);
    else if (k === 2) { draw.ellipse(s, col, [cx - 24, 11 + oy, 48, 40]); draw.rect(s, col, [cx - 24, 30 + oy, 48, 46], 0, 8); }
    else if (k === 3) draw.circle(s, col, [cx, 9 + oy], 10);
    else if (k === 4) { draw.ellipse(s, col, [cx - 31, 17 + oy, 62, 12]); draw.rect(s, col, [cx - 18, 3 + oy, 36, 20], 0, 6); }
    else if (k === 5) draw.ellipse(s, col, [cx + 12, 20 + oy, 20, 34]);
    else if (k === 6) draw.circle(s, col, [cx, 30 + oy], 26);
  }
  _build_sprites() {
    const [lo, hi] = this.scale_range;
    this.size_scales = []; for (let i = 0; i < this.N_SIZE; i++) this.size_scales.push(lo + (hi - lo) * i / (this.N_SIZE - 1));
    this.sprites = new Map();
    for (let kind = 0; kind < this.N_KIND; kind++) {
      const big = new Surface(this.BW * 2, this.BH * 2, { alpha: true });
      this._person(big, kind, C.CLUB_AUDIENCE_RIM_COL, -3, -3);
      this._person(big, kind, C.CLUB_AUDIENCE_COL, 0, 0);
      this.size_scales.forEach((sc, si) => this.sprites.set(kind * 100 + si, transform.smoothscale(big, [Math.max(4, Math.trunc(this.BW * sc)), Math.max(6, Math.trunc(this.BH * sc))])));
    }
    for (const sl of this.slots) {
      const si = Math.round((sl.sc - lo) / Math.max(1e-6, hi - lo) * (this.N_SIZE - 1));
      sl.si = Math.max(0, Math.min(this.N_SIZE - 1, si));
    }
  }
  _allowed(r) {
    if (r.top < C.TITLE_STAGE_FLOOR_Y + 8) return false;
    if (r.left < -8 || r.right > this.W + 8) return false;
    for (const b of this.blocked) if (colliderect(r, b)) return false;
    if (this.zone === "play") {
      const half = C.laneHalf(Math.min(r.bottom, this.H)) + C.CLUB_AUDIENCE_LANE_MARGIN;
      if (r.right > this.W / 2 - half && r.left < this.W / 2 + half) return false;
    }
    return true;
  }
  _candidates(lo, hi, spacing, rng) {
    const y0 = C.TITLE_FLOOR_Y + C.CLUB_AUDIENCE_FLOOR_PAD, y1 = this.H + 24, out = [];
    let y = y0;
    while (y <= y1) {
      const sc = lo + (hi - lo) * (y - y0) / (y1 - y0), w = this.BW * sc, h = this.BH * sc;
      let x = -4 + rng.uniform(0, w * spacing);
      while (x <= this.W + 4) {
        const px = x + rng.uniform(-1.5, 1.5), py = y + rng.uniform(-2, 2);
        if (this._allowed(new Rect(Math.trunc(px - w / 2), Math.trunc(py - h), Math.trunc(w), Math.trunc(h)))) out.push([px, py, sc]);
        x += w * spacing;
      }
      y += Math.max(5, h * spacing * 0.42);
    }
    return out;
  }
  _build_slots() {
    this.blocked = this.zone === "play" ? [new Rect(0, 356, 120, 124), new Rect(720, 400, 80, 80)] : [new Rect(0, 356, 120, 124)];
    this.blocked.push(...this.extra_blocked);
    const [lo0, hi0] = C.CLUB_AUDIENCE_SCALE;
    let best = [], bestCfg = [lo0, hi0];
    outer: for (const mul of [1.0, 0.88, 0.78, 0.68, 0.6]) {
      for (const spacing of [0.62, 0.52, 0.44, 0.38]) {
        const cand = this._candidates(lo0 * mul, hi0 * mul, spacing, new Rng(C.CLUB_AUDIENCE_SEED));
        if (cand.length > best.length) { best = cand; bestCfg = [lo0 * mul, hi0 * mul]; }
        if (best.length >= this.want) break outer;
      }
    }
    this.scale_range = bestCfg;
    const rng = new Rng(C.CLUB_AUDIENCE_SEED + 1);
    rng.shuffle(best);
    best = best.slice(0, this.want).sort((a, b) => a[1] - b[1]);
    this.slots = best.map(([x, y, sc]) => ({ x, y, sc, si: 0, kind: rng.randrange(this.N_KIND), phase: rng.uniform(0, TAU) }));
    const order = this.slots.map((_, i) => i); rng.shuffle(order);
    this.rank = new Array(this.slots.length).fill(0); order.forEach((i, r) => (this.rank[i] = r));
    this.order = order;
  }
  update_score(dt, score, isMax) {
    const target = Math.trunc(score / Math.max(1, C.CLUB_AUDIENCE_STEP_SCORE)) * this.per_step;
    this.update(dt, target, isMax ? 1 : 0, C.CLUB_AUDIENCE_POP_SPAN / Math.max(1, this.per_step));
  }
  update(dt, target, swayTo, gap) {
    if (!this.ok) return;
    dt = Math.max(0, Math.min(dt, 0.1)); this.t += dt;
    target = Math.min(this.capacity, Math.trunc(target));
    const waiting = target - (this.shown + this.pops.length + this.queue);
    if (waiting > 0) this.queue += waiting;
    if (this.queue > 0) {
      this.queue_t -= dt;
      while (this.queue > 0 && this.queue_t <= 0) { this.pops.push([this.order[this.shown + this.pops.length], 0]); this.queue -= 1; this.queue_t += Math.max(0.005, gap); }
    } else this.queue_t = 0;
    if (this.pops.length) {
      for (const pp of this.pops) pp[1] += dt;
      const nDone = this.pops.filter((pp) => pp[1] >= C.CLUB_AUDIENCE_POP_SEC).length;
      if (nDone) { this.shown += nDone; this.pops = this.pops.filter((pp) => pp[1] < C.CLUB_AUDIENCE_POP_SEC); }
    }
    if (this.sway < swayTo) this.sway = Math.min(swayTo, this.sway + dt / Math.max(0.01, C.CLUB_AUDIENCE_SWAY_IN));
    else this.sway = Math.max(swayTo, this.sway - dt / Math.max(0.01, C.CLUB_AUDIENCE_SWAY_OUT));
  }
  // 足元（下端の中央）を軸に回した絵。同じ角度は作り直さない
  _rotSprite(sp, key, ai) {
    let hit = this._rot.get(key);
    if (!hit) {
      const [w, h] = sp.get_size();
      const pad = new Surface(w * 2, h * 2, { alpha: true }); pad.blit(sp, [Math.floor(w / 2), 0]);
      const rot = transform.rotozoom(pad, ai * C.CLUB_AUDIENCE_SWAY_STEP, 1);
      hit = [rot, [-rot.get_width() / 2, -rot.get_height() / 2]];
      this._rot.set(key, hit);
    }
    return hit;
  }
  _rotated(kind, si, ai) { return this._rotSprite(this.sprites.get(kind * 100 + si), `${kind},${si},${ai}`, ai); }
  draw_people(surf, withPops = true) {
    if (!this.ok) return;
    const popping = new Map(withPops ? this.pops.map((pp) => [pp[0], pp[1]]) : []);
    const sway = this.sway, nStep = Math.max(1, Math.trunc(C.CLUB_AUDIENCE_SWAY_DEG / Math.max(1, C.CLUB_AUDIENCE_SWAY_STEP)));
    const wT = this.t * TAU / Math.max(0.1, C.CLUB_AUDIENCE_SWAY_PERIOD);
    this.slots.forEach((sl, i) => {
      const popT = popping.get(i);
      if (this.rank[i] >= this.shown && popT === undefined) return;
      let x = sl.x, y = sl.y;
      if (popT !== undefined) y += (1 - C.easeOutBack(popT / Math.max(0.01, C.CLUB_AUDIENCE_POP_SEC), 2.4)) * C.CLUB_AUDIENCE_POP_JUMP * sl.sc;
      const ai = sway > 0.02 ? Math.round(sway * nStep * Math.sin(wT + sl.phase)) : 0;
      if (ai === 0) { const sp = this.sprites.get(sl.kind * 100 + sl.si); surf.blit(sp, [Math.trunc(x - sp.get_width() / 2), Math.trunc(y - sp.get_height())]); }
      else { const [img, off] = this._rotated(sl.kind, sl.si, ai); surf.blit(img, [Math.trunc(x + off[0]), Math.trunc(y + off[1])]); }
    });
  }
  draw(surf, bg, between = null) {
    try {
      if (!this.ok || !this.slots.length) { surf.blit(bg, [0, 0]); if (between) between(surf); }
      else if (this.pops.length || this.sway > 0.02) { surf.blit(bg, [0, 0]); if (between) between(surf); this.draw_people(surf, true); }
      else {
        if (!this._baked || this._baked_bg !== bg || this._baked_shown !== this.shown) {
          this._baked = bg.copy(); this.draw_people(this._baked, false); this._baked_bg = bg; this._baked_shown = this.shown;
        }
        surf.blit(this._baked, [0, 0]); if (between) between(surf);
      }
    } catch (e) { console.warn("[店内演出] 観客の描画でエラー。観客を消します", e); this.ok = false; surf.blit(bg, [0, 0]); }
  }
}

// ステージの縁の高さ（x の位置で、これより下がステージの床）
export function edgeY(x) {
  const pts = C.CLUB_STAGE_EDGE;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / Math.max(1, x1 - x0);
  }
  return pts[pts.length - 1][1];
}

export class StageCrowd extends Audience {
  constructor(blocked) {
    // super() の中で _build_slots が呼ばれるので、先に置き場所を決めておく（クラス変数を経由する）
    StageCrowd._pending = blocked.map((r) => new Rect(r));
    super("stage");
  }
  reset() { super.reset(); this.hand = new Map(); this.wave_t = null; this.ovation_on = false; this.ovation = 0; }
  _stage_candidates(mul, spacing, rng) {
    const [lo, hi] = C.CLUB_CROWD_SCALE, [y0, y1] = C.CLUB_CROWD_ROW_Y, out = [];
    let y = y0;
    while (y <= y1) {
      const sc = (lo + (hi - lo) * (y - y0) / Math.max(1, y1 - y0)) * mul, w = this.BW * sc, h = this.BH * sc;
      let x = rng.uniform(0, w * spacing);
      while (x <= this.W) {
        const px = x + rng.uniform(-2, 2), py = y + rng.uniform(-2, 2);
        const r = new Rect(Math.trunc(px - w / 2), Math.trunc(py - h), Math.trunc(w), Math.trunc(h));
        if (py <= edgeY(px) - 4 && !this._stage_blocked.some((b) => colliderect(r, b))) out.push([px, py, sc]);
        x += w * spacing;
      }
      y += Math.max(5, h * spacing * 0.5);
    }
    return out;
  }
  _build_slots() {
    this._stage_blocked = StageCrowd._pending || [];
    const [lo0, hi0] = C.CLUB_CROWD_SCALE;
    let best = [], bestMul = 1;
    outer: for (const mul of [1.0, 0.9, 0.8, 0.7]) {
      for (const spacing of [0.74, 0.62, 0.52, 0.44]) {
        const cand = this._stage_candidates(mul, spacing, new Rng(C.CLUB_AUDIENCE_SEED));
        if (cand.length > best.length) { best = cand; bestMul = mul; }
        if (best.length >= this.want) break outer;
      }
    }
    this.scale_range = [lo0 * bestMul, hi0 * bestMul];
    const rng = new Rng(C.CLUB_AUDIENCE_SEED + 1);
    rng.shuffle(best);
    const pick = best.slice(0, this.want), nStand = Math.trunc(pick.length * C.CLUB_CROWD_STAND_RATIO);
    const slots = pick.map(([x, y, sc], j) => ({ x, y, sc, si: 0, kind: rng.randrange(this.N_KIND), phase: rng.uniform(0, TAU),
      stand: j >= pick.length - nStand, behind: Math.abs(x - this.W / 2) < C.laneHalf(y), key: y + rng.uniform(-26, 26) }));
    slots.sort((a, b) => a.y - b.y);
    this.slots = slots;
    const rest = []; slots.forEach((s, i) => { if (!s.stand) rest.push(i); }); rng.shuffle(rest);
    const seated = [];
    while (rest.length) {
      let pickI = null, bestI = rest[0], bestD = -1;
      for (const i of rest.slice(0, Math.max(1, C.CLUB_CROWD_SPARSE_LOOK))) {
        let d = 1e9;
        for (const j of seated) d = Math.min(d, Math.hypot(slots[i].x - slots[j].x, (slots[i].y - slots[j].y) * 1.6));
        if (d >= C.CLUB_CROWD_SPARSE_DIST) { pickI = i; break; }
        if (d > bestD) { bestI = i; bestD = d; }
      }
      if (pickI === null) pickI = bestI;
      rest.splice(rest.indexOf(pickI), 1); seated.push(pickI);
    }
    const standing = []; slots.forEach((s, i) => { if (s.stand) standing.push(i); });
    const nFirst = Math.trunc(seated.length * C.CLUB_CROWD_STAND_AFTER);
    const tail = seated.slice(nFirst).concat(standing); rng.shuffle(tail);
    this.order = seated.slice(0, nFirst).concat(tail);
    this.rank = new Array(slots.length).fill(0); this.order.forEach((i, r) => (this.rank[i] = r));
  }
  _person_up(s, kind, col, ox, oy) {
    this._person(s, kind, col, ox, oy);
    const cx = 48 + ox;
    for (const d of [-1, 1]) {
      draw.polygon(s, col, [[cx + d * 24, 84 + oy], [cx + d * 40, 30 + oy], [cx + d * 30, 26 + oy], [cx + d * 12, 76 + oy]]);
      draw.circle(s, col, [cx + d * 36, 24 + oy], 7);
    }
  }
  _build_sprites() {
    super._build_sprites();
    this.sprites_up = new Map();
    for (let kind = 0; kind < this.N_KIND; kind++) {
      const big = new Surface(this.BW * 2, this.BH * 2, { alpha: true });
      this._person_up(big, kind, C.CLUB_AUDIENCE_RIM_COL, -3, -3);
      this._person_up(big, kind, C.CLUB_AUDIENCE_COL, 0, 0);
      this.size_scales.forEach((sc, si) => this.sprites_up.set(kind * 100 + si, transform.smoothscale(big, [Math.max(4, Math.trunc(this.BW * sc)), Math.max(6, Math.trunc(this.BH * sc))])));
    }
  }
  cheer_near(x, n) {
    const near = [];
    this.slots.forEach((sl, i) => { if (this.rank[i] < this.shown && Math.abs(sl.x - x) < 170 && !this.hand.has(i)) near.push(i); });
    for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [near[i], near[j]] = [near[j], near[i]]; }
    for (const i of near.slice(0, Math.max(0, n))) this.hand.set(i, C.CLUB_CHEER_SEC);
  }
  wave() { if (this.shown > 0) this.wave_t = 0; }
  update_fx(dt) {
    dt = Math.max(0, Math.min(dt, 0.1));
    for (const [i, v] of [...this.hand]) { if (v - dt <= 0) this.hand.delete(i); else this.hand.set(i, v - dt); }
    if (this.wave_t !== null) { this.wave_t += dt; if (this.wave_t >= C.CLUB_WAVE_SEC) this.wave_t = null; }
    if (this.ovation_on) this.ovation = Math.min(1, this.ovation + dt / 0.35);
  }
  is_moving() { return this.pops.length > 0 || this.sway > 0.02 || this.hand.size > 0 || this.wave_t !== null || this.ovation > 0; }
  _rotated_pose(kind, si, ai, up) { return this._rotSprite((up ? this.sprites_up : this.sprites).get(kind * 100 + si), `${kind},${si},${ai},${up}`, ai); }
  draw_people(surf, withPops = true) {
    if (!this.ok) return;
    const popping = new Map(withPops ? this.pops.map((pp) => [pp[0], pp[1]]) : []);
    const nStep = Math.max(1, Math.trunc(C.CLUB_AUDIENCE_SWAY_DEG / Math.max(1, C.CLUB_AUDIENCE_SWAY_STEP)));
    const wT = this.t * TAU / Math.max(0.1, C.CLUB_AUDIENCE_SWAY_PERIOD), ov = this.ovation, sway = this.sway;
    const wavePos = this.wave_t === null ? null : (this.wave_t / Math.max(0.05, C.CLUB_WAVE_SEC)) * 1.3 - 0.15;
    this.slots.forEach((sl, i) => {
      const popT = popping.get(i);
      if (this.rank[i] >= this.shown && popT === undefined) return;
      const damp = sl.behind ? C.CLUB_CROWD_BEHIND_DAMP : 1;
      let x = sl.x, y = sl.y, up, ai; const sc = sl.sc;
      if (sl.stand) y -= this.BH * sc * 0.28;
      if (popT !== undefined) y += (1 - C.easeOutBack(popT / Math.max(0.01, C.CLUB_AUDIENCE_POP_SEC), 2.4)) * C.CLUB_AUDIENCE_POP_JUMP * sc;
      if (ov > 0) { up = true; y -= 7 * sc * ov; ai = Math.round(Math.sin(this.t * 13 + sl.phase)); }
      else {
        up = this.hand.has(i) || (wavePos !== null && Math.abs(x / this.W - wavePos) < 0.09);
        if (up) y -= 4 * sc * damp;
        ai = sway > 0.02 ? Math.round(sway * nStep * damp * Math.sin(wT + sl.phase)) : 0;
      }
      if (ai === 0) { const sp = (up ? this.sprites_up : this.sprites).get(sl.kind * 100 + sl.si); surf.blit(sp, [Math.trunc(x - sp.get_width() / 2), Math.trunc(y - sp.get_height())]); }
      else { const [img, off] = this._rotated_pose(sl.kind, sl.si, ai, up); surf.blit(img, [Math.trunc(x + off[0]), Math.trunc(y + off[1])]); }
    });
  }
  draw_scene(surf, bg, shade, shadePos) {
    try {
      if (this.is_moving()) { surf.blit(bg, [0, 0]); this.draw_people(surf, true); surf.blit(shade, shadePos); }
      else {
        if (!this._baked || this._baked_bg !== bg || this._baked_shown !== this.shown) {
          this._baked = bg.copy(); this.draw_people(this._baked, false); this._baked.blit(shade, shadePos); this._baked_bg = bg; this._baked_shown = this.shown;
        }
        surf.blit(this._baked, [0, 0]);
      }
    } catch (e) { console.warn("[プレイ演出] 観客の描画でエラー。観客を消します", e); this.ok = false; surf.blit(bg, [0, 0]); surf.blit(shade, shadePos); }
  }
}
