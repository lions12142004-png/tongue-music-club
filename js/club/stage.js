// =====================================================
// stage.js — プレイ中の演出（PC版 StageShow / PlayStage の移植）
//   見た目と効果音だけ。判定・スコア・ノルマは一切変えない（app.js の結果を見て、絵を出すだけ）
// =====================================================
import { W, H, TAU, Rect, Rng, Surface, Font, draw, transform, mix, scaleCol, clamp01, radialGlow, softBlur, toneSurface, GOTHIC } from "./pg.js";
import * as C from "./cfg.js";
import { StageCrowd, edgeY } from "./crowd.js";
import { vgrad, addGlow, paintVignette, toneLit } from "./title.js";

const VANISHING_Y = C.VANISHING_Y, JUDGE_Y = C.JUDGE_Y;
export function p3d(lane, progress) {
  const p = Math.max(0, Math.min(3, progress)), z = p * p;
  const y = VANISHING_Y + (JUDGE_Y - VANISHING_Y) * z, lw = C.LANE_WIDTH_TOP + (C.LANE_WIDTH_BOTTOM - C.LANE_WIDTH_TOP) * z;
  return [Math.trunc(W / 2 + lane * lw), Math.trunc(y)];
}
function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}

// =====================================================
// スコアに応じた「ステージの盛り上がり」
// =====================================================
export class StageShow {
  constructor(ts, art) {
    this.ts = ts; this.art = art; this.ok = true; this.ready = false;
    this._sheets = new Map(); this._msgs = new Map(); this.sign_tube = null; this.sign_glows = []; this.sign_pos = [0, 0];
    this.reset(false);
  }
  static level_of(score) { let lv = 1; C.STAGE_LEVEL_SCORES.forEach((s, i) => { if (score >= s) lv = i + 1; }); return Math.max(1, Math.min(C.STAGE_LEVEL_SCORES.length, lv)); }
  reset(tutorial) {
    this.tutorial = !!tutorial; this.t = 0; this.level = 1; this.forced = null; this.since = { 1: 0 };
    this.msg_t = 99; this.msg_level = 0; this.focus_t = 99; this.pulse_t = 99; this.last_pulse = -99; this.prev_el = null;
    this.foot_amp = 0; this.foot_phase = 0; this.rain_t = 0; this.gold_t = null; this.gold_wait = 0; this.ovation_k = 0;
    this.spots = C.STAGE_SPOTS.slice(0, 3).map((cfg, i) => ({ tx: i === 0 ? (cfg.solo_cx ?? cfg.cx) : cfg.cx, ty: cfg.ty, len: i === 0 ? 1 : 0, col: i === 0 ? "white" : this._order(i), from: null, mix_t: 0, mix_sec: 1 }));
  }
  _order(i) { return C.STAGE_SPOT_ORDER.length ? C.STAGE_SPOT_ORDER[i % C.STAGE_SPOT_ORDER.length] : "white"; }
  static _is_rain(name) { return name[0] === "r" && /^\d+$/.test(name.slice(1)); }
  _rain_n() { return Math.max(3, C.STAGE_RAINBOW_COLORS); }
  _name_col(name) {
    let base;
    if (StageShow._is_rain(name)) { const [r, g, b] = hsv((+name.slice(1) % this._rain_n()) / this._rain_n(), Math.max(0, Math.min(1, C.STAGE_RAINBOW_SAT)), 1); base = [r * 255, g * 255, b * 255]; }
    else base = C.STAGE_SPOT_COLS[name] || [255, 255, 255];
    const k = Math.max(0, Math.min(255, C.STAGE_SPOT_LEVEL)) / 255;
    return [base[0] * k, base[1] * k, base[2] * k];
  }
  _mix_key(a, b, k) { const S = Math.max(2, C.STAGE_SPOT_MIX_STEPS); return a <= b ? `mix|${a}|${b}|${k}` : `mix|${b}|${a}|${S - k}`; }
  _key_col(key) {
    let c;
    if (key.startsWith("mix|")) { const [, a, b, k] = key.split("|"), ca = this._name_col(a), cb = this._name_col(b), f = +k / Math.max(2, C.STAGE_SPOT_MIX_STEPS); c = [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f]; }
    else { const [n, boost] = key.split("|"); c = this._name_col(n); if (boost === "1") c = c.map((v) => v * (1 + C.STAGE_PULSE_GAIN)); }
    return c.map((v) => Math.max(0, Math.min(255, Math.round(v))));
  }
  // 光の筋の絵（色ごとに1回だけ）。まっすぐ下向きの円すいをぼかしたもの。描くときは斜めにずらして貼る
  _sheet(key) {
    let hit = this._sheets.get(key);
    if (!hit) {
      if (this._sheets.size > 60) this._sheets.clear();
      const col = this._key_col(key), HH = 408, M = 10, SW = 10 + Math.trunc(0.24 * HH) + M * 2 + 2, cx = Math.floor(SW / 2);
      let s = new Surface(SW, HH, { res: 1 });
      draw.polygon(s, col, [[cx - 5, 0], [cx + 5, 0], [cx + 5 + Math.trunc(0.12 * HH), HH], [cx - 5 - Math.trunc(0.12 * HH), HH]]);
      s = softBlur(s, 3);
      const pw = 88, ph = 16, p = new Surface(pw + 16, ph + 12, { res: 1 });
      draw.ellipse(p, col, [8, -ph, pw, ph * 2]);
      hit = { sheet: s, cx, pool: softBlur(p, 3) };
      this._sheets.set(key, hit);
    }
    return hit;
  }
  paint_sign(s) {
    try {
      let font = null, size = 24;
      while (size >= 9) { font = this.ts._neon_font(size); if (font.size(C.STAGE_SIGN_TEXT)[0] <= C.STAGE_SIGN_MAX_W) break; size -= 1; }
      const tube = this.ts._stroke(font.render(C.STAGE_SIGN_TEXT, true, C.TITLE_NEON_TUBE_COL), 1), core = font.render(C.STAGE_SIGN_TEXT, true, C.TITLE_NEON_CORE_COL);
      tube.blit(core, [Math.floor((tube.w - core.w) / 2), Math.floor((tube.h - core.h) / 2)]);
      const [w, h] = tube.get_size(), pad = 12;
      this.sign_pos = [Math.trunc(C.STAGE_SIGN_CENTER[0] - w / 2), Math.trunc(C.STAGE_SIGN_CENTER[1] - h / 2)];
      this.sign_glows = [];
      for (let q = 1; q < 5; q++) {
        const g = new Surface(w + pad * 2, h + pad * 2), wide = this.ts._stroke(font.render(C.STAGE_SIGN_TEXT, true, scaleCol(C.TITLE_NEON_GLOW_COL, 0.5 * q / 4)), 3);
        g.blit(wide, [Math.floor((g.w - wide.w) / 2), Math.floor((g.h - wide.h) / 2)]);
        this.sign_glows.push(softBlur(g, 4));
      }
      this.sign_pad = pad;
      s.blit(tube, this.sign_pos, null, null, 150 / 255);
      this.sign_tube = tube;
    } catch (e) { console.warn("[ステージ演出] ネオン看板を作れませんでした", e); this.sign_tube = null; }
  }
  ensure() {
    if (this.ready) return;
    this.ready = true;
    const ts = this.ts, rng = new Rng(1116);
    this.candles = []; this._candle_img = new Map();
    for (const [ty, sc, xs] of C.CLUB_VIEW_TABLES) for (const tx of xs) {
      const cy = ty - Math.trunc(8 * sc), onLane = cy > VANISHING_Y && Math.abs(tx - W / 2) < C.laneHalf(cy) + 6, rate = onLane ? C.STAGE_CANDLE_LANE_RATE : 1;
      if (rate <= 0) continue;
      const key = `${sc}|${rate}`;
      if (!this._candle_img.has(key)) {
        const r = Math.trunc(20 * sc) + 7, g = radialGlow(r, scaleCol(C.STAGE_CANDLE_GLOW, rate), 2);
        const fw = Math.max(2, Math.round(4 * sc)), fh = Math.max(3, Math.round(8 * sc));
        draw.ellipse(g, scaleCol([255, 206, 120], 0.5 + 0.5 * rate), [r - Math.floor(fw / 2), r - fh, fw, fh]);
        this._candle_img.set(key, g);
      }
      this.candles.push([tx, cy, key]);
    }
    rng.shuffle(this.candles);
    this.foot_pts = []; for (let fx = 30; fx < W; fx += 62) this.foot_pts.push([fx, Math.trunc(edgeY(fx))]);
    this.foot_img = [null]; for (let q = 1; q < 8; q++) this.foot_img.push(radialGlow(C.STAGE_FOOT_RADIUS, scaleCol(C.STAGE_FOOT_COL, q / 7), 1.5));
    this.foot_rate = this.foot_pts.map(([fx, fy]) => (Math.abs(fx - W / 2) < C.laneHalf(fy) + 8 ? C.STAGE_FOOT_LANE_RATE : 1));
    const R = Math.max(6, C.STAGE_BALL_R);
    this.ball_frames = [];
    for (let f = 0; f < 8; f++) {
      const b = new Surface(R * 2 + 2, R * 2 + 6, { alpha: true });
      draw.rect(b, [60, 56, 70], [R - 2, 0, 6, 6]); draw.circle(b, [74, 74, 94], [R + 1, R + 5], R);
      const T = Math.max(3, Math.floor(R / 4));
      for (let gy = -R; gy < R; gy += T) for (let gx = -R; gx < R; gx += T) {
        const mx = gx + T / 2, my = gy + T / 2; if (mx * mx + my * my > (R - 1.5) ** 2) continue;
        const v = ((Math.floor(gx / T) * 3 + Math.floor(gy / T) * 5 + f) % 8 + 8) % 8, shade = 1 - 0.45 * (Math.hypot(mx, my) / R);
        const col = v === 0 ? [236, 236, 255] : v === 4 ? [172, 174, 204] : [112, 112, 140];
        b.fill(scaleCol(col, shade), [R + 1 + gx, R + 5 + gy, T - 1, T - 1]);
      }
      draw.circle(b, [30, 28, 40], [R + 1, R + 5], R, 1);
      this.ball_frames.push(b);
    }
    this.ball_halo = radialGlow(R * 2 + 8, [30, 28, 36], 2);
    const lr = Math.max(0, Math.min(1, C.STAGE_LANE_PARTICLE_RATE));
    this.dot_img = [radialGlow(5, C.STAGE_DOT_COL, 1.6), radialGlow(8, C.STAGE_DOT_COL, 1.8)];
    this.dot_img_lane = lr > 0 ? [radialGlow(5, scaleCol(C.STAGE_DOT_COL, lr), 1.6), radialGlow(8, scaleCol(C.STAGE_DOT_COL, lr), 1.8)] : null;
    this.dots = []; for (let i = 0; i < C.STAGE_BALL_DOTS; i++) this.dots.push([rng.uniform(0, W + 24), rng.uniform(14, 392), rng.uniform(...C.STAGE_DOT_SPEED), rng.randrange(2)]);
    const span = 410; this.conf_span = span;
    this.confetti = []; for (let i = 0; i < C.STAGE_CONFETTI; i++) this.confetti.push([rng.uniform(6, W - 6), rng.uniform(0, span / C.STAGE_CONFETTI_SPEED[0]), rng.uniform(...C.STAGE_CONFETTI_SPEED), rng.uniform(0, 6.28), rng.randrange(C.STAGE_CONFETTI_COLS.length)]);
    this.conf_lane_cols = lr > 0 ? C.STAGE_CONFETTI_COLS.map((c) => scaleCol(c, lr)) : null;
    this.hud_rects = [new Rect(8, 10, 236, 116), new Rect(W - 210, 10, 200, 130)];
  }
  _rain_name(i, clock) { const n = this._rain_n(); return `r${(Math.trunc(clock / (C.STAGE_RAINBOW_SEC / n)) + Math.floor(i * n / 3)) % n}`; }
  _want_col(i) { if (this.level <= 1) return i === 0 ? "white" : this._order(i); if (this.level < 5) return this._order(i); if (this.gold_t !== null) return "gold"; return this._rain_name(i, this.rain_t); }
  update(dt, score, combo, crowd, ovationK) {
    this.t += dt; this.ovation_k = ovationK;
    const want = this.tutorial ? 1 : (this.forced ?? StageShow.level_of(score));
    if (want > this.level) {
      for (let k = this.level + 1; k <= want; k++) this.since[k] = this.t;
      if (want >= 5 && this.level < 5) this.rain_t = 0;
      if (want >= 6 && this.level < 6) { this.gold_t = null; this.gold_wait = 0; }
      this.level = want; this.focus_t = 0; this.msg_t = 0; this.msg_level = want;
      if (crowd) crowd.wave();
    } else if (want < this.level) {
      for (const k of Object.keys(this.since)) if (+k > want) delete this.since[k];
      this.level = want; if (want < 6) this.gold_t = null;
    }
    this.focus_t += dt; this.msg_t += dt; this.pulse_t += dt;
    if (this.level >= 6) {
      if (this.gold_t === null) { this.gold_wait += dt; if (this.gold_wait >= C.STAGE_GOLD_EVERY) this.gold_t = 0; }
      else { this.gold_t += dt; if (this.gold_t >= C.STAGE_GOLD_SEC) { this.gold_t = null; this.gold_wait = 0; } }
    }
    if (this.level >= 5 && this.gold_t === null) this.rain_t += dt;
    const nOn = this.level < 3 ? 1 : this.spots.length;
    const front = (this.focus_t < C.STAGE_FOCUS_SEC + 0.3 && this.level > 1) || this.gold_t !== null;
    const a = Math.min(1, dt * C.STAGE_SPOT_FOLLOW);
    this.spots.forEach((sp, i) => {
      const cfg = C.STAGE_SPOTS[i];
      sp.len = i < nOn ? Math.min(1, sp.len + dt / Math.max(0.05, C.STAGE_SPOT_GROW_SEC)) : Math.max(0, sp.len - dt / Math.max(0.05, C.STAGE_SPOT_GROW_SEC));
      const solo = nOn === 1, [cx, amp] = solo ? [cfg.solo_cx ?? cfg.cx, cfg.solo_amp ?? cfg.amp] : [cfg.cx, cfg.amp];
      let gx = cx + amp * Math.sin(this.t * TAU / Math.max(0.5, cfg.period) + cfg.phase), gy = cfg.ty;
      const fx = W / 2 + (solo ? 0 : (i - 1) * C.STAGE_FOCUS_SPREAD), fy = C.STAGE_FOCUS_Y;
      if (front) { gx = fx; gy = fy; }
      if (ovationK > 0) { gx += (fx - gx) * ovationK; gy += (fy - gy) * ovationK; }
      sp.tx += (gx - sp.tx) * a; sp.ty += (gy - sp.ty) * a;
      const wc = this._want_col(i);
      if (wc !== sp.col) {
        if (sp.from === null && StageShow._is_rain(wc) && StageShow._is_rain(sp.col)) sp.col = wc;
        else { sp.from = sp.col; sp.col = wc; sp.mix_t = 0; sp.mix_sec = sp.from === "white" ? C.STAGE_SPOT_WARM_SEC : C.STAGE_SPOT_MIX_SEC; }
      }
      if (sp.from !== null) { sp.mix_t += dt; if (sp.mix_t >= sp.mix_sec) sp.from = null; }
    });
    const run = this.level >= 3 && combo >= C.STAGE_FOOT_COMBO, d = dt / Math.max(0.05, C.STAGE_FOOT_FADE_SEC);
    this.foot_amp = run ? Math.min(1, this.foot_amp + d) : Math.max(0, this.foot_amp - d);
    this.foot_phase = this.foot_amp > 0 ? (this.foot_phase + dt / Math.max(0.2, C.STAGE_FOOT_RUN_SEC)) % 1 : 0;
  }
  beat(elapsed, notes, offsetMs) {
    const prev = this.prev_el; this.prev_el = elapsed;
    if (this.tutorial || prev === null || elapsed <= prev || elapsed - prev > 500) return;
    if (this.t - this.last_pulse < C.STAGE_PULSE_MIN_GAP) return;
    for (const n of notes) if (prev < n.time + offsetMs && n.time + offsetMs <= elapsed) { this.pulse_t = 0; this.last_pulse = this.t; return; }
  }
  _on_lane(x, y) { return y > VANISHING_Y - 4 && Math.abs(x - W / 2) < C.laneHalf(y) + 8; }
  _hud(x, y) { return this.hud_rects[0].collidepoint(x, y) || this.hud_rects[1].collidepoint(x, y); }
  _beam(screen, sh, ox, tx, ty, length) {
    const SH = Math.max(2, C.STAGE_SPOT_SLICE), n = Math.min(Math.floor(408 / SH), Math.trunc(ty * length / SH));
    if (n <= 0) return;
    const k = (tx - ox) / Math.max(1, ty), hh = n * SH, ctx = screen.x;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.transform(1, 0, k, 1, ox - sh.cx, 0);                       // 下へ行くほど横へずらす（斜めの光の筋）
    ctx.drawImage(sh.sheet.c, 0, 0, sh.sheet.c.width, hh * sh.sheet.r, 0, 0, sh.sheet.w, hh);
    ctx.restore();
    if (length >= 1) screen.blit(sh.pool, [Math.trunc(ox + k * hh - sh.pool.w / 2), hh], null, "add");
  }
  draw(screen) {
    if (!this.ok || !this.ready) return;
    const t = this.t, lv = this.level, since = this.since;
    if (lv >= 5 && this.sign_tube && since[5] !== undefined) {
      const k = Math.min(1, (t - since[5]) / Math.max(0.05, C.STAGE_SIGN_ON_SEC)), q = Math.trunc(k * this.sign_glows.length);
      if (q > 0) screen.blit(this.sign_glows[q - 1], [this.sign_pos[0] - this.sign_pad, this.sign_pos[1] - this.sign_pad], null, "add");
      screen.blit(this.sign_tube, this.sign_pos, null, null, k);
    }
    if (lv >= 2 && since[2] !== undefined) {
      for (const [cx, cy, key] of this.candles.slice(0, Math.trunc((t - since[2]) / Math.max(0.05, C.STAGE_CANDLE_GAP)) + 1)) {
        const g = this._candle_img.get(key); screen.blit(g, [cx - Math.floor(g.w / 2), cy - Math.floor(g.h / 2)], null, "add");
      }
    }
    if (lv >= 3 && since[3] !== undefined) {
      const base = C.STAGE_FOOT_BASE * Math.min(1, (t - since[3]) / Math.max(0.05, C.STAGE_FOOT_ON_SEC)), nf = Math.max(1, this.foot_pts.length - 1), w = 0.16;
      const head = this.foot_phase * (1 + 2 * w) - w;
      this.foot_pts.forEach(([fx, fy], i) => {
        let b = base;
        if (this.foot_amp > 0) b += (1 - base) * this.foot_amp * Math.max(0, 1 - Math.abs(head - i / nf) / w);
        b *= this.foot_rate[i];
        const q = Math.round(b * 7); if (q <= 0) return;
        const g = this.foot_img[Math.min(7, q)];
        screen.blit(g, [fx - Math.floor(g.w / 2), fy - Math.floor(g.h / 2)], null, "add");
        draw.circle(screen, scaleCol([255, 236, 190], 0.35 + 0.65 * b), [fx, fy], 3);
      });
    }
    const ballT = lv >= 4 && since[4] !== undefined ? t - since[4] : null;
    if (ballT !== null && ballT > C.STAGE_BALL_DROP_SEC) {
      const shown = Math.trunc((ballT - C.STAGE_BALL_DROP_SEC) / 0.06);
      this.dots.slice(0, shown).forEach(([x0, y, sp, sz]) => {
        const x = ((x0 + sp * ballT) % (W + 24)) - 12;
        let img = this.dot_img[sz];
        if (this._on_lane(x, y)) { if (!this.dot_img_lane) return; img = this.dot_img_lane[sz]; }
        else if (this._hud(x, y)) return;
        screen.blit(img, [Math.trunc(x) - Math.floor(img.w / 2), Math.trunc(y) - Math.floor(img.h / 2)], null, "add");
      });
    }
    const boost = C.STAGE_PULSE_GAIN > 0 && this.pulse_t < C.STAGE_PULSE_SEC * 0.5, S = Math.max(2, C.STAGE_SPOT_MIX_STEPS);
    this.spots.forEach((sp, i) => {
      if (sp.len <= 0) return;
      let key = `${sp.col}|${boost ? 1 : 0}`;
      if (sp.from !== null) { const k = Math.trunc(sp.mix_t / Math.max(0.01, sp.mix_sec) * S); key = k <= 0 ? `${sp.from}|0` : this._mix_key(sp.from, sp.col, Math.min(S - 1, k)); }
      this._beam(screen, this._sheet(key), C.STAGE_SPOTS[i].ox, sp.tx, sp.ty, sp.len);
    });
    if (ballT !== null) {
      const R = Math.max(6, C.STAGE_BALL_R), [bx, by] = C.STAGE_BALL_POS;
      const y = Math.trunc(-R - 8 + (by + R + 8) * C.easeOut(Math.min(1, ballT / Math.max(0.05, C.STAGE_BALL_DROP_SEC))));
      draw.line(screen, [44, 40, 52], [bx, 0], [bx, y - R], 2);
      screen.blit(this.ball_halo, [bx - Math.floor(this.ball_halo.w / 2), y - Math.floor(this.ball_halo.h / 2)], null, "add");
      const img = this.ball_frames[Math.trunc(Math.max(0, ballT - C.STAGE_BALL_DROP_SEC) / Math.max(0.34, C.STAGE_BALL_FRAME_SEC)) % this.ball_frames.length];
      screen.blit(img, [bx - R - 1, y - R - 5]);
    }
    if (lv >= 6 && since[6] !== undefined) {
      const t6 = t - since[6];
      for (const [x0, delay, v, ph, ci] of this.confetti) {
        if (t6 < delay) continue;
        const y = -8 + ((t6 - delay) * v) % this.conf_span, x = x0 + 12 * Math.sin(t6 * 1.3 + ph);
        let col = C.STAGE_CONFETTI_COLS[ci];
        if (this._on_lane(x, y)) { if (!this.conf_lane_cols) continue; col = this.conf_lane_cols[ci]; }
        else if (this._hud(x, y)) continue;
        screen.fill(col, Math.trunc(t6 * 2.2 + ph) % 2 ? [Math.trunc(x), Math.trunc(y), 4, 2] : [Math.trunc(x), Math.trunc(y), 2, 4]);
      }
    }
    if (C.STAGE_PULSE_ADD > 0 && this.pulse_t < C.STAGE_PULSE_SEC) {
      const v = Math.round(C.STAGE_PULSE_ADD * (1 - this.pulse_t / C.STAGE_PULSE_SEC));
      if (v > 0) screen.fill([v, Math.trunc(v * 0.85), Math.trunc(v * 0.85)], null, "add");
    }
  }
  draw_message(screen) {
    if (!this.ok || this.msg_t >= C.STAGE_MSG_SEC || this.msg_level < 2) return;
    const text = C.STAGE_LEVEL_MESSAGES[this.msg_level - 1] || ""; if (!text) return;
    let img = this._msgs.get(text);
    if (!img) {
      const font = this.art.F.m_md, label = font.render(text, true, this.msg_level >= C.STAGE_LEVEL_SCORES.length ? C.CLUB_FX_COL_GOLD : C.CLUB_COL_CREAM);
      const w = label.w + 36, h = label.h + 12;
      img = new Surface(w, h, { alpha: true });
      draw.rect(img, [16, 5, 10, 205], [0, 0, w, h], 0, Math.floor(h / 2)); draw.rect(img, C.CLUB_COL_PINK_DEEP, [0, 0, w, h], 1, Math.floor(h / 2));
      img.blit(label, [18, 6]); this._msgs.set(text, img);
    }
    const k = Math.min(1, this.msg_t / 0.25, (C.STAGE_MSG_SEC - this.msg_t) / 0.35);
    screen.blit(img, [Math.floor(W / 2) - Math.floor(img.w / 2), Math.trunc(C.STAGE_MSG_Y) - Math.floor(img.h / 2)], null, null, Math.max(0, k));
  }
}

// =====================================================
// プレイ中の見た目
// =====================================================
export class PlayStage {
  static NORMA_LANE = { left: -2, up: -1, front: 0, down: 1, right: 2 };
  constructor(ts, art, sound) {
    this.ts = ts; this.art = art; this.snd = sound;
    this._fonts = new Map(); this._tc = new Map(); this._glow = new Map(); this._polys = new Map(); this._pops_img = new Map();
    this.show = new StageShow(ts, art); this.bg = null; this.crowd = null; this.per_step = C.CLUB_AUDIENCE_STEP_COUNT;
    this.reset(false);
  }
  ensure() {
    if (this.bg) return;
    let view;
    try { view = this._paint_view(); } catch (e) { console.warn("[プレイ演出] 背景を描けませんでした", e); view = new Surface(W, H); view.fill([70, 14, 34]); }
    const bg = this.art.tone_surface(view, C.CLUB_VIEW_SATURATION, C.CLUB_VIEW_BRIGHTNESS);
    this.art.shade_rect(bg, [8, 10, 236, 116], [0, 0, 0, 120], 10);
    this.bg = bg;
    const top = C.laneHalf(VANISHING_Y) + 6, bot = C.laneHalf(H) + 10, x0 = Math.trunc(W / 2 - bot);
    this.shade = new Surface(Math.trunc(bot * 2), H - VANISHING_Y + 4, { alpha: true });
    draw.polygon(this.shade, [0, 0, 0, Math.max(0, Math.min(255, C.CLUB_LANE_FLOOR_ALPHA))], [[Math.trunc(W / 2 - top) - x0, 0], [Math.trunc(W / 2 + top) - x0, 0], [Math.trunc(W / 2 + bot) - x0, H - VANISHING_Y + 4], [0, H - VANISHING_Y + 4]]);
    this.shade_pos = [x0, VANISHING_Y - 4];
    this.bg_empty = bg.copy(); this.bg_empty.blit(this.shade, this.shade_pos);
    this.crowd = new StageCrowd([[0, 356, 120, 124], [532, 0, 268, 186], [0, 0, 252, 128]]);
    this.per_step = this.crowd.per_step;
    try { this.show.ensure(); } catch (e) { console.warn("[ステージ演出] 準備でエラー。照明の演出を省略します", e); this.show.ok = false; }
  }
  reset(tutorial) {
    this.tutorial = !!tutorial; this.t = 0; this.particles = []; this.rings = []; this.popups = [];
    this.lane_flash = new Map(); this.icon_flash = new Map(); this.hold_glow = new Map();
    this.disp = 0; this.score_from = 0; this.score_to = 0; this.roll_t = 9; this.pop_t = 9;
    this.combo_prev = 0; this.bounce_t = 9; this.ms_t = 9; this.fade_t = 9; this.fade_combo = 0; this.ms_combo = 0;
    this.fb_age = 99; this.fb_text = ""; this.ovation_k = 0; this.ovation_on = false; this.buzzer_done = false;
    if (this.crowd) this.crowd.reset();
    this.show.reset(tutorial);
  }
  gfont(size) { let f = this._fonts.get(size); if (!f) { f = new Font(size, { family: GOTHIC }); this._fonts.set(size, f); } return f; }
  _txt(font, text, color) {
    const key = `${font.css}|${text}|${color}`; let s = this._tc.get(key);
    if (!s) { if (this._tc.size > 300) this._tc.clear(); s = font.render(text, true, color); this._tc.set(key, s); }
    return s;
  }
  _lane_x(lane, p = 1) { return p3d(lane, p)[0]; }
  _lane_of(x) { let best = -3, bd = 1e9; for (let l = -3; l <= 3; l++) { const d = Math.abs(this._lane_x(l) - x); if (d < bd) { bd = d; best = l; } } return best; }
  _lane_poly(lane, p0, p1, col) {
    const key = `${lane}|${p0}|${p1}|${col}`; let hit = this._polys.get(key);
    if (!hit) {
      const pts = [p3d(lane - 0.5, p0), p3d(lane + 0.5, p0), p3d(lane + 0.5, p1), p3d(lane - 0.5, p1)];
      const x0 = Math.min(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), x1 = Math.max(...pts.map((p) => p[0])) + 1, y1 = Math.max(...pts.map((p) => p[1])) + 1;
      const s = new Surface(Math.max(2, x1 - x0), Math.max(2, y1 - y0), { alpha: true });
      draw.polygon(s, col, pts.map(([px, py]) => [px - x0, py - y0]));
      hit = [s, [x0, y0]]; this._polys.set(key, hit);
    }
    return hit;
  }
  _paint_view() {
    const ts = this.ts, T = toneLit, HZ = C.CLUB_VIEW_HORIZON, s = new Surface(W, H);
    vgrad(s, [0, 0, W, HZ], C.TITLE_COL_WALL_TOP, C.TITLE_COL_WALL_BOTTOM, T);
    s.fill(scaleCol(C.TITLE_COL_WALL_BOTTOM, 0.72), [0, HZ - 30, W, 30]); s.fill(C.TITLE_COL_TRIM, [0, HZ - 32, W, 2]);
    const sil = C.TITLE_COL_SILHOUETTE;
    draw.rect(s, [40, 10, 20], [262, 80, 116, 62], 0, 3);
    const rng = new Rng(5);
    for (let row = 0; row < 2; row++) {
      for (let bx = 268; bx < 372; bx += 9) { const bh = rng.randint(12, 20); s.fill(rng.choice([[214, 150, 80], [120, 190, 150], [230, 110, 150], [200, 200, 220]]), [bx, 108 + row * 28 - bh, 5, bh]); }
      s.fill([90, 40, 44], [264, 108 + row * 28, 112, 2]);
    }
    draw.rect(s, [96, 38, 42], [250, HZ - 30, 140, 30]); s.fill([190, 96, 110], [250, HZ - 30, 140, 3]);
    for (const sx of [268, 300, 332, 364]) { s.fill(sil, [sx, HZ - 14, 3, 14]); draw.ellipse(s, sil, [sx - 6, HZ - 18, 15, 6]); }
    draw.rect(s, [30, 8, 18], [394, 62, 50, 68], 0, 2); vgrad(s, [398, 66, 42, 60], [20, 26, 60], [44, 50, 96], T);
    addGlow(s, radialGlow(26, [110, 114, 140], 2), 428, 84); draw.circle(s, C.TITLE_FULLMOON_COL, [428, 84], 7);
    s.fill([30, 8, 18], [418, 66, 2, 60]); s.fill([30, 8, 18], [398, 95, 42, 2]);
    draw.rect(s, [36, 9, 18], [476, 88, 52, HZ - 88]); draw.rect(s, [74, 22, 36], [480, 92, 21, HZ - 94]); draw.rect(s, [74, 22, 36], [503, 92, 21, HZ - 94]);
    draw.rect(s, [60, 200, 130], [486, 74, 32, 10], 0, 2); addGlow(s, radialGlow(20, [30, 80, 50], 2), 502, 79);
    s.fill(C.TITLE_COL_FLOOR_B, [0, HZ, W, H - HZ]);
    const zs = []; for (let k = 0; k < 30; k++) zs.push(0.19 * 1.2 ** k);
    const px = (X, z) => W / 2 + X * 64 / z, py = (z) => HZ + 60 / z;
    for (let k = 0; k < zs.length - 1; k++) {
      const z0 = zs[k], z1 = zs[k + 1]; if (py(z0) - py(z1) < 1.2) break;
      const col = scaleCol(C.TITLE_COL_FLOOR_A, Math.max(0.25, Math.min(1, 1.25 - 0.2 * z1))), n = Math.trunc(W / 2 * z1 / 64 / 0.4) + 2;
      for (let j = -n; j < n; j++) {
        if (((j + k) % 2 + 2) % 2) continue;
        const X0 = j * 0.4, X1 = (j + 1) * 0.4;
        draw.polygon(s, col, [[Math.trunc(px(X0, z1)), Math.trunc(py(z1))], [Math.trunc(px(X1, z1)), Math.trunc(py(z1))], [Math.trunc(px(X1, z0)), Math.trunc(py(z0))], [Math.trunc(px(X0, z0)), Math.trunc(py(z0))]]);
      }
    }
    for (const [ty, sc, xs] of C.CLUB_VIEW_TABLES) for (const tx of xs) ts._paint_table(s, T, tx, ty, sc);
    C.CLUB_VIEW_LAMPS.forEach((lx, n_) => {
      const i = n_ % Math.max(1, ts.lamps.length), [img, off] = ts._lamp_image(i, true, 0), pos = [Math.trunc(lx + off[0]), Math.trunc(off[1])];
      addGlow(s, ts.lamp_halo, lx, pos[1] + img.get_height() - 8); s.blit(img, pos);
    });
    const edge = C.CLUB_STAGE_EDGE.map(([x, y]) => [Math.trunc(x), Math.trunc(y)]);
    draw.polygon(s, C.TITLE_COL_STAGE_TOP, [...edge, [W, H], [0, H]]);
    const plank = scaleCol(C.TITLE_COL_STAGE_TOP, 0.74);
    for (let i = -12; i < 13; i++) { const xb = W / 2 + i * 62, xt = W / 2 + i * 46; draw.line(s, plank, [Math.trunc(xt), Math.trunc(edgeY(xt)) + 2], [Math.trunc(xb), H], 1); }
    draw.lines(s, C.TITLE_COL_TRIM, false, edge, 3);
    const foot = radialGlow(18, [120, 84, 60], 2);
    for (let fx = 30; fx < W; fx += 62) { const fy = Math.trunc(edgeY(fx)); addGlow(s, foot, fx, fy); draw.circle(s, [255, 236, 190], [fx, fy], 3); }
    this.show.paint_sign(s);
    paintVignette(s, 0.7);
    return s;
  }
  update(dt, score, combo, isMax) {
    this.ensure();
    dt = Math.max(0, Math.min(dt, 0.1)); this.t += dt;
    if (this.ovation_on) this.ovation_k = Math.min(1, this.ovation_k + dt / 0.6);
    if (!this.tutorial && this.crowd) { this.crowd.update_score(dt, score, isMax); this.crowd.update_fx(dt); }
    const target = Math.min(1000000, Math.trunc(score));
    if (target !== this.score_to) { if (target - this.score_to >= C.CLUB_SCORE_POP_MIN) this.pop_t = 0; this.score_from = this.disp; this.score_to = target; this.roll_t = 0; }
    this.roll_t += dt; this.pop_t += dt;
    this.disp = this.score_from + (this.score_to - this.score_from) * Math.min(1, this.roll_t / Math.max(0.01, C.CLUB_SCORE_ROLL_SEC));
    if (combo !== this.combo_prev) {
      if (combo > this.combo_prev) { this.bounce_t = 0; if (C.CLUB_COMBO_MILESTONES.includes(combo)) { this.ms_t = 0; this.ms_combo = combo; if (this.crowd && !this.tutorial) this.crowd.wave(); } }
      else if (this.combo_prev > 1) { this.fade_t = 0; this.fade_combo = this.combo_prev; }
      this.combo_prev = combo;
    }
    this.bounce_t += dt; this.ms_t += dt; this.fade_t += dt;
    if (this.show.ok) { try { this.show.update(dt, target, combo, this.tutorial ? null : this.crowd, this.ovation_k); } catch (e) { console.warn(e); this.show.ok = false; } }
    for (const d of [this.lane_flash, this.icon_flash, this.hold_glow]) for (const [k, v] of [...d]) { v[0] += dt; if (v[0] >= v[1]) d.delete(k); }
    for (const r of this.rings) r[2] += dt; this.rings = this.rings.filter((r) => r[2] < r[3]);
    for (const p of this.particles) { p[4] += dt; p[3] += (p[7] ? 220 : 760) * dt; if (p[7]) p[2] *= 0.985; p[0] += p[2] * dt; p[1] += p[3] * dt; }
    this.particles = this.particles.filter((p) => p[4] < p[5] && p[1] < H);
    for (const q of this.popups) q[2] += dt; this.popups = this.popups.filter((q) => q[2] < C.CLUB_NORMA_POP_SEC);
  }
  _spawn(x, y, n, col, confetti = false, power = 1) {
    const room = C.CLUB_FX_MAX_PARTICLES - this.particles.length, R = Math.random, U = (a, b) => a + (b - a) * R();
    for (let i = 0; i < Math.max(0, Math.min(Math.trunc(n), room)); i++) {
      if (confetti) { const c = [C.CLUB_FX_COL_GOLD, C.CLUB_FX_COL_PINK, C.CLUB_FX_COL_BLUE, [255, 255, 255]][Math.floor(R() * 4)]; this.particles.push([x + U(-30, 30), y - U(0, 20), U(-150, 150), U(-330, -120), 0, U(0.7, 1.1), c, 1]); }
      else { const a = U(Math.PI * 1.08, Math.PI * 1.92), v = U(120, 300) * power; this.particles.push([x, y, Math.cos(a) * v, Math.sin(a) * v, 0, U(0.25, 0.5), col, 0]); }
    }
  }
  // 判定の結果を見てエフェクトを出す（値は読むだけ）。norma は [上,下,左,右,前] の回数
  observe(prevTimer, text, timer, x, normaBefore, normaAfter) {
    const keys = ["up", "down", "left", "right", "front"];
    keys.forEach((k, i) => { if (normaAfter[i] > normaBefore[i]) this.popups.push([k, this._lane_x(PlayStage.NORMA_LANE[k]), 0]); });
    if (timer <= prevTimer || timer <= 0) return;
    const lane = this._lane_of(x), lx = this._lane_x(lane), ly = JUDGE_Y, isMax = text.includes("MAX");
    if (text.includes("Hold")) {
      const rate = C.CLUB_FX_SPARKS_HOLD * (isMax ? 2.3 : 1), n = Math.trunc(rate) + (Math.random() < rate - Math.trunc(rate) ? 1 : 0);
      this._spawn(lx + (Math.random() * 32 - 16), ly, n, isMax ? C.CLUB_FX_COL_PINK : C.CLUB_FX_COL_GOLD, false, 0.7);
      if (isMax) this.hold_glow.set(lane, [0, 0.12]);
      if (this.fb_text !== text) this.fb_age = 0;
      this.fb_text = text; return;
    }
    this.fb_age = 0; this.fb_text = text;
    const mul = isMax ? C.CLUB_FX_MAX_SCALE : 1;
    if (text.startsWith("Excellent")) {
      const col = isMax ? C.CLUB_FX_COL_PINK : C.CLUB_FX_COL_GOLD, [r0, r1, sec] = C.CLUB_FX_RING.excellent;
      this.rings.push([lx, ly, 0, sec, r0, r1 * mul, col, 3]); this._spawn(lx, ly, C.CLUB_FX_SPARKS_EXCELLENT * (isMax ? 1.6 : 1), col, false, mul);
      this.lane_flash.set(lane, [0, C.CLUB_FX_FLASH_SEC, col]); this.icon_flash.set(lane, [0, C.CLUB_FX_FLASH_SEC, col]);
      if (this.crowd && !this.tutorial) this.crowd.cheer_near(lx, C.CLUB_CHEER_COUNT);
    } else if (text.startsWith("Nice")) {
      const col = isMax ? C.CLUB_FX_COL_PINK : C.CLUB_FX_COL_BLUE, [r0, r1, sec] = C.CLUB_FX_RING.nice;
      this.rings.push([lx, ly, 0, sec, r0, r1 * mul, col, 2]); if (isMax) this._spawn(lx, ly, 8, col);
      this.icon_flash.set(lane, [0, C.CLUB_FX_FLASH_SEC, col]);
    } else if (text.startsWith("Perfect")) {
      const [r0, r1, sec] = C.CLUB_FX_RING.perfect;
      this.rings.push([lx, ly, 0, sec, r0, r1, C.CLUB_FX_COL_GOLD, 4]); this._spawn(lx, ly - 30, C.CLUB_FX_CONFETTI, null, true);
      this.icon_flash.set(lane, [0, C.CLUB_FX_FLASH_SEC, C.CLUB_FX_COL_GOLD]);
    }
  }
  draw_back(screen) {
    this.ensure();
    if (this.tutorial || !this.crowd || !this.crowd.ok) screen.blit(this.bg_empty, [0, 0]);
    else this.crowd.draw_scene(screen, this.bg, this.shade, this.shade_pos);
    try { this.show.draw(screen); } catch (e) { if (this.show.ok) console.warn("[ステージ演出] 描画でエラー", e); this.show.ok = false; }
  }
  note_glow(screen, col, poly) {
    if (C.CLUB_NOTE_GLOW <= 0) return;
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (w < 6) return;
    const key = `${col}|${Math.trunc(w / 8)}|${Math.trunc(h / 4)}`;
    let g = this._glow.get(key);
    if (!g) {
      if (this._glow.size > 400) this._glow.clear();
      const gw = Math.trunc(w / 8) * 8 + 8, gh = Math.trunc(h / 4) * 4 + 4, m = 12, s = new Surface(gw + m * 2, gh + m * 2, { res: 1 });
      draw.rect(s, scaleCol(col, C.CLUB_NOTE_GLOW), [m - 3, m - 3, gw + 6, gh + 6], 0, 4);
      g = softBlur(s, 4); this._glow.set(key, g);
    }
    screen.blit(g, [Math.trunc((Math.min(...xs) + Math.max(...xs)) / 2 - g.w / 2), Math.trunc((Math.min(...ys) + Math.max(...ys)) / 2 - g.h / 2)], null, "add");
  }
  band_glow(screen, col, poly) {
    if (C.CLUB_NOTE_GLOW <= 0) return;
    const dim = scaleCol(col, 0.5);
    draw.line(screen, dim, [Math.trunc(poly[0][0]) - 2, Math.trunc(poly[0][1])], [Math.trunc(poly[3][0]) - 2, Math.trunc(poly[3][1])], 4);
    draw.line(screen, dim, [Math.trunc(poly[1][0]) + 2, Math.trunc(poly[1][1])], [Math.trunc(poly[2][0]) + 2, Math.trunc(poly[2][1])], 4);
  }
  draw_fx(screen) {
    for (const [lane, [t, dur, col]] of this.lane_flash) { const [s, pos] = this._lane_poly(lane, 0.72, 1.0, col); screen.blit(s, pos, null, null, 150 / 255 * (1 - t / dur)); }
    for (const [lane] of this.hold_glow) { const [s, pos] = this._lane_poly(lane, 0.9, 1.02, C.CLUB_FX_COL_PINK); screen.blit(s, pos, null, null, 130 / 255); }
    for (const [x, y, t, dur, r0, r1, col, wd] of this.rings) {
      const k = t / dur, r = Math.trunc(r0 + (r1 - r0) * (1 - (1 - k) ** 2));
      draw.ellipse(screen, scaleCol(col, 1 - k * 0.8), [Math.trunc(x - r), Math.trunc(y - r * 0.32), r * 2, Math.max(2, Math.trunc(r * 0.64))], wd);
    }
    for (const [x, y, , , age, life, col, kind] of this.particles) {
      const k = 1 - age / life;
      if (kind) screen.fill(k > 0.3 ? col : scaleCol(col, 0.5), [Math.trunc(x), Math.trunc(y), 4, Math.trunc(age * 14) % 2 ? 3 : 5]);
      else screen.fill(scaleCol(col, 0.4 + 0.6 * k), [Math.trunc(x), Math.trunc(y), k > 0.5 ? 3 : 2, k > 0.5 ? 3 : 2]);
    }
  }
  draw_icon_flash(screen) {
    for (const [lane, [t, dur, col]] of this.icon_flash) { const [ix, iy] = p3d(lane, 1.1); draw.circle(screen, mix(col, C.CLUB_ICON_BACK_EDGE, t / dur), [ix, iy], C.CLUB_ICON_BACK_R + 2, 4); }
  }
  _max_badge() {
    let b = this._pops_img.get("max");
    if (!b) {
      const t = this.gfont(17).render("MAX", true, [255, 240, 248]), w = t.w + 16, h = t.h + 6;
      b = new Surface(w + 12, h + 12, { alpha: true });
      draw.rect(b, [255, 110, 186, 70], [0, 0, w + 12, h + 12], 0, 12); draw.rect(b, [255, 110, 186, 130], [3, 3, w + 6, h + 6], 0, 10);
      draw.rect(b, [214, 40, 130], [6, 6, w, h], 0, 8); draw.rect(b, [255, 190, 226], [6, 6, w, h], 2, 8); b.blit(t, [14, 9]);
      this._pops_img.set("max", b);
    }
    return b;
  }
  draw_feedback(screen, text, timer, x) {
    if (timer <= 0) return;
    const age = this.fb_age; this.fb_age += 1;
    const isMax = text.includes("(MAX)") || text.startsWith("MAX Hold"), hold = text.includes("Hold");
    let label, col, sizes;
    if (text.startsWith("Excellent")) [label, col, sizes] = ["Excellent!!", C.CLUB_FX_COL_GOLD, [40, 35, 30]];
    else if (text.startsWith("Nice")) [label, col, sizes] = ["Nice!", C.CLUB_FX_COL_BLUE, [29, 26, 23]];
    else if (text.startsWith("Perfect")) [label, col, sizes] = ["Perfect!", C.CLUB_FX_COL_GOLD, [50, 44, 38]];
    else if (text === "MISS") { if (timer <= 14) return; [label, col, sizes] = ["MISS", C.CLUB_FX_COL_MISS, [15, 15, 15]]; }
    else if (hold) [label, col, sizes] = ["Hold", [255, 236, 200], [25, 23, 22]];
    else [label, col, sizes] = [text, [255, 236, 200], [25, 23, 22]];
    const size = age < 3 ? sizes[0] : age < 6 ? sizes[1] : sizes[2];
    const s = this._txt(this.gfont(size), label, col), shadow = this._txt(this.gfont(size), label, [22, 8, 14]), badge = isMax ? this._max_badge() : null;
    const total = s.w + (badge ? badge.w + 2 : 0), left = Math.trunc(Math.max(6, Math.min(W - 6 - total, x - total / 2))), cy = JUDGE_Y - 48;
    let a = 1;
    if (!hold) { if (text === "MISS") a = Math.min(1, (timer - 14) / 8); else if (timer < 9) a = timer / 9; }
    for (const [img, ix, dy] of [[shadow, left + 2, 2], [s, left, 0], [badge, left + s.w + 2, 0]]) if (img) screen.blit(img, [ix, cy - Math.floor(img.h / 2) + dy], null, null, a);
  }
  draw_popups(screen) {
    try { this.show.draw_message(screen); } catch {}
    for (const [key, x, t] of this.popups) {
      let img = this._pops_img.get(key);
      if (!img) {
        const icon = this.art.small_icon(key, 30), label = this._txt(this.art.F.m_sm, "ノルマ +1", [255, 244, 214]), w = (icon ? 34 : 6) + label.w + 12;
        img = new Surface(w, 36, { alpha: true });
        draw.rect(img, [20, 6, 12, 215], [0, 0, w, 36], 0, 18); draw.rect(img, C.CLUB_FX_COL_GOLD, [0, 0, w, 36], 2, 18);
        if (icon) img.blit(icon, [4, 3]); img.blit(label, [icon ? 36 : 8, 18 - Math.floor(label.h / 2)]);
        this._pops_img.set(key, img);
      }
      const k = t / C.CLUB_NORMA_POP_SEC;
      screen.blit(img, [Math.trunc(Math.max(4, Math.min(W - 4 - img.w, x - img.w / 2))), Math.trunc(JUDGE_Y - 124 - 30 * k)], null, null, 1 - k * k);
    }
  }
  draw_hud(screen, combo) {
    const pk = Math.max(0, 1 - this.pop_t / Math.max(0.01, C.CLUB_SCORE_POP_SEC)), size = 22 + Math.round(3 * pk), col = mix([255, 255, 255], C.CLUB_FX_COL_GOLD, pk);
    screen.blit(this.gfont(size).render(`SCORE: ${Math.round(this.disp)}`, true, col), [20, 19 - (size - 22)]);
    const [gx, gy, gw, gh] = C.CLUB_GAUGE_RECT, frac = Math.max(0, Math.min(1, this.disp / 1000000));
    draw.rect(screen, [60, 24, 38], [gx, gy, gw, gh], 0, 3);
    if (frac > 0) draw.rect(screen, frac >= 1 ? C.CLUB_FX_COL_GOLD : C.CLUB_COL_PINK_DEEP, [gx, gy, Math.max(2, Math.trunc(gw * frac)), gh], 0, 3);
    for (let k = 1; k < 10; k++) screen.fill([236, 214, 222], [gx + Math.trunc(gw * k / 10), gy + 1, 1, gh - 2]);
    draw.rect(screen, [150, 110, 126], [gx, gy, gw, gh], 1, 3);
    const cy = gy + gh + 12;
    if (combo > 1) {
      if (this.ms_t < C.CLUB_COMBO_MILESTONE_SEC) {
        const font = this.gfont(38), txt = `${combo} COMBO!`;
        let glow = this._glow.get("combo|" + txt);
        if (!glow) { const t0 = font.render(txt, true, [150, 40, 100]), pad = new Surface(t0.w + 24, t0.h + 24, { res: 1 }); pad.blit(t0, [12, 12]); glow = softBlur(pad, 4); this._glow.set("combo|" + txt, glow); }
        screen.blit(glow, [8, cy - 14], null, "add"); screen.blit(this._txt(font, txt, [255, 150, 206]), [20, cy - 2]);
      } else {
        const bk = Math.max(0, 1 - this.bounce_t / Math.max(0.01, C.CLUB_COMBO_BOUNCE_SEC)), sz = 28 + Math.round(6 * bk);
        screen.blit(this._txt(this.gfont(sz), `${combo} COMBO!`, [241, 196, 15]), [20, cy - Math.floor((sz - 28) / 2)]);
      }
    } else if (this.fade_t < C.CLUB_COMBO_FADE_SEC && this.fade_combo > 1) {
      screen.blit(this._txt(this.gfont(28), `${this.fade_combo} COMBO!`, [241, 196, 15]), [20, cy], null, null, 1 - this.fade_t / C.CLUB_COMBO_FADE_SEC);
    }
  }
  stop_buzzer() { this.snd?.stopSE("buzzer", 120); }
  play_cheer(finalScore) { this._cheer = finalScore >= C.CLUB_CHEER_BIG_SCORE ? "cheer_big" : "cheer_small"; this.snd?.playSE(this._cheer, 1); }
  stop_cheer() { if (this._cheer) this.snd?.stopSE(this._cheer, C.CLUB_CHEER_FADE_MS); this._cheer = null; }
  start_ovation() { this.ovation_on = true; if (this.crowd) this.crowd.ovation_on = true; }
  draw_opening(screen, t, title, diff, paintPlay, sound = true) {
    this.ensure();
    const art = this.art, lit = art.bg("curtain");
    let dark = this._pops_img.get("curtain_dark");
    if (!dark) { dark = art.tone_surface(lit, 0.7, C.CLUB_OPEN_DARK); this._pops_img.set("curtain_dark", dark); this._pops_img.set("curtain_spot", transform.smoothscale(radialGlow(48, [70, 52, 44], 1.6), [720, 420])); }
    const rise = t >= C.CLUB_OPEN_T_RISE;
    if (sound && !this.buzzer_done && t >= C.CLUB_OPEN_T_BUZZER) { this.buzzer_done = true; this.snd?.playSE("buzzer", 1); }
    let y = 0;
    if (rise) {
      paintPlay(screen);
      const p = (t - C.CLUB_OPEN_T_RISE) / Math.max(0.05, C.CLUB_OPEN_T_END - C.CLUB_OPEN_T_RISE);
      y = -Math.trunc(H * C.ease(p)); screen.blit(lit, [0, y]);
    } else {
      const k = clamp01((t - C.CLUB_OPEN_T_LIGHT) / Math.max(0.05, C.CLUB_OPEN_FADE_SEC));
      screen.blit(dark, [0, 0]);
      if (k > 0) { screen.blit(lit, [0, 0], null, null, k); const spot = this._pops_img.get("curtain_spot"); screen.blit(spot, [Math.floor(W / 2) - Math.floor(spot.w / 2), -150], null, "add", k); }
    }
    const a = clamp01((t - C.CLUB_OPEN_T_TITLE) / Math.max(0.05, C.CLUB_OPEN_FADE_SEC));
    if (a > 0) {
      const F = art.F, font = F.m_xl.size(title)[0] <= W - 80 ? F.m_xl : F.m_lg;
      const rows = [[this._txt(font, title, [255, 244, 232]), Math.floor(H / 2) - 70], [this._txt(this.gfont(30), diff, C.CLUB_FX_COL_GOLD), Math.floor(H / 2) - 4]];
      if (this.tutorial) rows.push([this._txt(F.m_md, "― 開店前のリハーサル ―", C.CLUB_COL_PINK), Math.floor(H / 2) + 44]);
      for (const [img, ty] of rows) screen.blit(img, [Math.floor(W / 2) - Math.floor(img.w / 2), ty + y], null, null, a);
    }
    return t >= C.CLUB_OPEN_T_END;
  }
}
