// =====================================================
// title.js — タイトル画面「Tongue Music Club」（PC版 StageBand / TitleScene の移植）
//   DARK（待機）→ POWERUP（復旧演出）→ READY（準備完了）。絵はコードで描き、重い処理は起動時に1回だけ
// =====================================================
import { W, H, TAU, Rect, Rng, Surface, Font, draw, transform, mix, scaleCol, clamp01, radialGlow, softBlur, toneSurface, fromImage, GOTHIC, css } from "./pg.js";
import * as C from "./cfg.js";
import { Audience } from "./crowd.js";

const rot = (vx, vy, deg) => { const a = deg * Math.PI / 180; return [vx * Math.cos(a) + vy * Math.sin(a), -vx * Math.sin(a) + vy * Math.cos(a)]; };
const toneLit = (c) => [Math.trunc(c[0]), Math.trunc(c[1]), Math.trunc(c[2])];
function toneDark(c) {
  const [r, g, b] = c, gray = 0.30 * r + 0.59 * g + 0.11 * b, s = C.TITLE_DARK_SATURATION, br = C.TITLE_DARK_BRIGHTNESS, [tr, tg, tb] = C.TITLE_DARK_TINT;
  const f = (v, t) => Math.max(0, Math.min(255, Math.trunc((gray + (v - gray) * s) * br * t)));
  return [f(r, tr), f(g, tg), f(b, tb)];
}
export function vgrad(s, rect, cTop, cBottom, T) {
  const [x, y, w, h] = rect;
  for (let i = 0; i < h; i++) s.fill(T(mix(cTop, cBottom, i / Math.max(1, h - 1))), [x, y + i, w, 1]);
}
export function addGlow(s, glow, cx, cy) { s.blit(glow, [Math.trunc(cx - glow.get_width() / 2), Math.trunc(cy - glow.get_height() / 2)], null, "add"); }
// 画面のふちを暗くする（掛け算）
export function paintVignette(s, edge) {
  const w = Math.trunc(W / 8), h = Math.trunc(H / 8);
  const small = new Surface(w, h, { res: 1 }), e = Math.trunc(255 * edge);
  small.fill([e, e, e]);
  const n = 22;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), v = Math.trunc(e + (255 - e) * k), rw = Math.trunc(w * (1.45 - 1.05 * k)), rh = Math.trunc(h * (1.45 - 1.05 * k));
    draw.ellipse(small, [v, v, v], [Math.floor(w / 2) - Math.floor(rw / 2), Math.floor(h / 2) - Math.floor(rh / 2), rw, rh]);
  }
  s.blit(transform.smoothscale(small, [W, H], s.r), [0, 0], null, "mult");
}
export { toneLit, toneDark };

// =====================================================
// バンド（5人）
// =====================================================
export class StageBand {
  static CW = 240; static CH = 272; static GY = 264;
  constructor(faces) {
    this.members = []; this._dark = null;
    for (const cfg of C.TITLE_BAND) {
      try {
        const sp = this._build_member(cfg, faces[cfg.face]);
        this.members.push({ cfg, sprite: sp, x: cfg.x ?? 400, foot_y: C.TITLE_STAGE_FLOOR_Y + 4 + (cfg.foot_dy || 0) });
      } catch (e) { console.warn("[バンド] メンバーを描けませんでした", cfg.face, e); }
    }
    const rank = { drums: 0, vocal: 2 };
    this.order = this.members.map((_, i) => i).sort((a, b) => (rank[this.members[a].cfg.inst] ?? 1) - (rank[this.members[b].cfg.inst] ?? 1));
  }
  _face_box(img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    try {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, w, h).data, [sr, sg, sb] = C.TITLE_BAND_SKIN;
      const colN = new Int32Array(w), rowN = new Int32Array(h);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const i = (yy * w + xx) * 4;
        if (d[i + 3] > 128 && Math.abs(d[i] - sr) < 30 && Math.abs(d[i + 1] - sg) < 34 && Math.abs(d[i + 2] - sb) < 48) { colN[xx]++; rowN[yy]++; }
      }
      const xs = [], ys = []; colN.forEach((v, i) => { if (v > 2) xs.push(i); }); rowN.forEach((v, i) => { if (v > 2) ys.push(i); });
      if (xs.length > 8 && ys.length > 8) return [xs[0], ys[0], xs[xs.length - 1] - xs[0] + 1, ys[ys.length - 1] - ys[0] + 1];
    } catch {}
    return [0, 0, w, h];
  }
  _build_member(cfg, face) {
    const { CW, CH, GY } = StageBand, cx = Math.floor(CW / 2);
    // 2倍の大きさで描いて縮小する（縮小後もスマホの高精細画面できれいに見えるよう、解像度は2倍のまま）
    const c = new Surface(CW, CH, { alpha: true, res: 2 });
    const suit = C.TITLE_BAND_SUIT, shade = C.TITLE_BAND_SUIT_SHADE, red = C.TITLE_BAND_RED, skin = C.TITLE_BAND_SKIN;
    const inst = cfg.inst || "", D = C.TITLE_BAND_FACE_D, fcx = cx, fcy = 78;
    draw.ellipse(c, red, [cx - 28, GY - 12, 28, 13]); draw.ellipse(c, red, [cx, GY - 12, 28, 13]);
    draw.rect(c, suit, [cx - 21, 194, 19, 64], 0, 4); draw.rect(c, suit, [cx + 2, 194, 19, 64], 0, 4);
    draw.line(c, shade, [cx, 200], [cx, 256], 2);
    draw.rect(c, suit, [cx - 50, 126, 17, 62], 0, 8); draw.rect(c, suit, [cx + 33, 126, 17, 62], 0, 8);
    draw.circle(c, skin, [cx - 41, 190], 7); draw.circle(c, skin, [cx + 42, 190], 7);
    draw.polygon(c, suit, [[cx - 35, 122], [cx + 35, 122], [cx + 40, 204], [cx - 40, 204]]);
    draw.line(c, shade, [cx - 34, 128], [cx - 38, 200], 2); draw.line(c, shade, [cx + 34, 128], [cx + 38, 200], 2); draw.line(c, shade, [cx, 166], [cx, 204], 2);
    draw.polygon(c, shade, [[cx - 18, 122], [cx, 166], [cx + 18, 122]], 2);
    draw.polygon(c, red, [[cx - 5, 124], [cx + 5, 124], [cx + 8, 154], [cx, 166], [cx - 8, 154]]);
    draw.rect(c, skin, [cx - 8, 112, 16, 14]);
    if (face) {
      const [bx, by, bw, bh] = this._face_box(face);
      const k = D / Math.max(8, bw) * (cfg.face_scale ?? 1);
      const fw = Math.max(4, Math.trunc(face.naturalWidth * k)), fh = Math.max(4, Math.trunc(face.naturalHeight * k));
      const centerY = (cfg.anchor || "top") === "bottom" ? (by + bh) * k - D / 2 : by * k + D / 2;
      const px = fcx - (bx + bw / 2) * k + (cfg.face_dx || 0), py = fcy - centerY + (cfg.face_dy || 0);
      c.x.drawImage(face, Math.round(px), Math.round(py), fw, fh);
    } else {
      draw.circle(c, skin, [fcx, fcy], Math.floor(D / 2));
      draw.circle(c, [40, 30, 30], [fcx - 16, fcy - 4], 5); draw.circle(c, [40, 30, 30], [fcx + 16, fcy - 4], 5);
    }
    const hs = cfg.hat_scale ?? 1, hx = fcx + (cfg.hat_dx || 0), brimY = fcy - D * 0.36 + (cfg.hat_dy || 0);
    const cw_ = D * 0.80 * hs, ch_ = D * 0.46 * hs;
    const crown = new Rect(Math.trunc(hx - cw_ / 2), Math.trunc(brimY - ch_), Math.trunc(cw_), Math.trunc(ch_ + 4));
    draw.rect(c, suit, crown, 0, Math.trunc(14 * hs));
    draw.line(c, shade, [Math.trunc(hx), crown.y + 3], [Math.trunc(hx - 3 * hs), crown.y + Math.trunc(ch_ * 0.45)], 2);
    draw.rect(c, red, [crown.x, Math.trunc(brimY - 11 * hs), crown.w, Math.trunc(9 * hs)]);
    const bw_ = D * 1.34 * hs, bh_ = 15 * hs;
    draw.ellipse(c, suit, [Math.trunc(hx - bw_ / 2), Math.trunc(brimY - bh_ / 2), Math.trunc(bw_), Math.trunc(bh_)]);
    draw.ellipse(c, shade, [Math.trunc(hx - bw_ / 2), Math.trunc(brimY - bh_ / 2), Math.trunc(bw_), Math.trunc(bh_)], 1);
    this._paint_instrument(c, inst, cx, GY);
    const k = C.TITLE_BAND_SCALE * (cfg.scale ?? 1);
    return transform.smoothscale(c, [Math.max(8, Math.trunc(CW * k)), Math.max(8, Math.trunc(CH * k))], 2);
  }
  _paint_instrument(c, inst, cx, GY) {
    const sil = C.TITLE_COL_SILHOUETTE, body = C.TITLE_COL_CURTAIN_DARK, rim = C.TITLE_COL_CURTAIN_LIGHT, wood = [64, 22, 30];
    if (inst === "guitar" || inst === "bass" || inst === "guitar_r") {
      const d = inst === "guitar" ? 1 : -1, long = inst === "bass" ? 1.28 : 1.0, bx = cx + d * 10, by = 184;
      const nx = Math.trunc(bx - d * 86 * long), ny = Math.trunc(by - 66 * long);
      draw.line(c, wood, [bx, by], [nx, ny], 8); draw.line(c, rim, [bx, by - 3], [nx, ny - 3], 1);
      draw.rect(c, sil, [nx - 9, ny - 8, 18, 14], 0, 3);
      const col = inst !== "bass" ? body : scaleCol(body, 0.62);
      draw.ellipse(c, col, [bx - 34, by - 22, 68, 50]); draw.ellipse(c, col, [bx - d * 6 - 22, by - 30, 44, 40]);
      draw.ellipse(c, rim, [bx - 34, by - 22, 68, 50], 2);
      draw.circle(c, sil, [bx, by + 2], inst !== "bass" ? 9 : 5);
      draw.line(c, sil, [bx - 12, by + 14], [bx + 12, by + 14], 3);
    } else if (inst === "vocal") {
      const px = cx + 48;
      draw.ellipse(c, sil, [px - 20, GY - 8, 40, 10]); draw.line(c, sil, [px, GY - 4], [px, 146], 4); draw.line(c, sil, [px, 146], [cx + 18, 124], 4);
      draw.ellipse(c, sil, [cx + 4, 112, 22, 16]); draw.ellipse(c, rim, [cx + 4, 112, 22, 16], 2);
    } else if (inst === "drums") {
      const gold = [214, 170, 92];
      for (const [sx, sy] of [[cx - 84, 140], [cx + 84, 134]]) {
        draw.line(c, sil, [sx, sy], [sx, GY], 3); draw.ellipse(c, gold, [sx - 30, sy - 6, 60, 12]); draw.ellipse(c, [250, 226, 160], [sx - 30, sy - 6, 60, 12], 1);
      }
      for (const tx of [cx - 46, cx + 46]) {
        draw.rect(c, body, [tx - 22, 172, 44, 24], 0, 4); draw.ellipse(c, [250, 238, 242], [tx - 22, 164, 44, 16]); draw.ellipse(c, rim, [tx - 22, 164, 44, 16], 2);
      }
      draw.circle(c, body, [cx, 222], 41); draw.circle(c, [250, 238, 242], [cx, 222], 31); draw.circle(c, rim, [cx, 222], 41, 3); draw.circle(c, C.TITLE_BAND_RED, [cx, 222], 8);
    } else if (inst === "keyboard") {
      draw.line(c, sil, [cx - 60, 198], [cx + 58, GY], 6); draw.line(c, sil, [cx + 60, 198], [cx - 58, GY], 6);
      draw.rect(c, [36, 12, 22], [cx - 92, 172, 184, 28], 0, 5); draw.rect(c, rim, [cx - 92, 172, 184, 28], 2, 5);
      draw.rect(c, [250, 246, 248], [cx - 84, 178, 168, 12]);
      for (let kx = cx - 84; kx < cx + 84; kx += 12) c.fill([30, 14, 22], [kx + 7, 178, 5, 7]);
    }
  }
  dark_sprites() {
    if (!this._dark) this._dark = this.members.map((m) => toneSurface(m.sprite, C.CLUB_PLAY_BAND_SATURATION, C.CLUB_PLAY_BAND_BRIGHTNESS));
    return this._dark;
  }
  draw(surf, sprites = null, amp = 1) {
    const t = performance.now() / 1000, w = TAU / Math.max(0.1, C.TITLE_BAND_SWAY_PERIOD);
    for (const i of this.order) {
      const m = this.members[i], sp = sprites ? sprites[i] : m.sprite, ph = i * 1.7;
      const dx = Math.round(amp * C.TITLE_BAND_SWAY_X * Math.sin(t * w * 0.5 + ph));
      const dy = amp > 0 ? Math.round(amp * C.TITLE_BAND_SWAY_Y * Math.abs(Math.sin(t * w + ph))) : 0;
      surf.blit(sp, [m.x - Math.floor(sp.get_width() / 2) + dx, m.foot_y - sp.get_height() - dy]);
    }
  }
}

// =====================================================
// タイトル画面
// =====================================================
export class TitleScene {
  // sound: ClubSound（音。無ければ無音）, faces: 顔の画像, bgImgs: {lit, dark}（任意）
  constructor({ btnRect, sound, faces, bgImgs = {}, neonFamily = null }) {
    this.W = W; this.H = H;
    this.btn_rect = new Rect(btnRect);
    this.font_sm = new Font(16); this.font_md = new Font(24); this.font_lg = new Font(32);
    this.rng = new Rng();
    this.snd = sound; this.neonFamily = neonFamily;
    this._rot_cache = new Map(); this._text_cache = new Map();
    this.candles = C.TITLE_TABLES.map(([x, y, sc], i) => [x, y - 12 * sc, sc, i * 1.7]);
    this._build_backgrounds(bgImgs);
    this._build_lamps();
    this._build_neon();
    this._build_fx();
    this._build_show(faces);
    this._build_ready_bg();
    this._build_ui();
    this.active = true; this.bgm_playing = false; this.spark_loop_on = false;
    this.restart();
  }
  restart() {
    this.state = "DARK"; this.t = 0; this.t_state = 0; this.lit = 0;
    this.lamp_p = this.lamps.map(() => 0); this.spot = 0; this.neon_level = 0; this.neon_glow_gain = 0; this.neon_clock = 0;
    this.flicker_idx = -1; this.flash = 0; this.ui = 0; this.particles = []; this.spark_glows = []; this.arcs = [];
    this.spark_timer = this.rng.uniform(0.3, 1.0); this.spark_boost_t = 0; this.blink_t = 0; this.blink_set = [];
    this.blink_next = this.rng.uniform(...C.TITLE_NEON_BLINK_INTERVAL); this.cam_error = "";
    this.cloud_p = 0; this.curtain_p = 0; this.crowd.reset();
    this._stop_bgm(0); this._start_spark_loop();
  }
  update(dt, camReady, camError = "") {
    dt = Math.max(0, Math.min(dt, 0.1));
    if (!this.active) this._resume();
    this.cam_error = camError; this.t += dt; this.t_state += dt;
    if (this.state === "DARK") {
      this._update_spark_timer(dt, true);
      if (camReady && camError === "" && this.t_state >= C.TITLE_DARK_MIN_SEC) this._start_powerup();
    } else if (this.state === "POWERUP") {
      if (this.t_state < C.TITLE_T_LAMPS) this._update_spark_timer(dt, false);
      this._apply_powerup_timeline(this.t_state, dt);
      this.cloud_p = clamp01((this.t_state - C.TITLE_T_CLOUDS) / Math.max(0.01, C.TITLE_CLOUDS_SEC));
      this.curtain_p = clamp01((this.t_state - C.TITLE_T_CURTAIN) / Math.max(0.01, C.TITLE_CURTAIN_SEC));
      if (this.t_state >= C.TITLE_T_READY) this._enter_ready();
    } else {
      this.neon_clock += dt;
      this.ui = clamp01(this.t_state / Math.max(0.01, C.TITLE_UI_FADE_SEC));
      this._update_neon_blink(dt);
      if (!this.bgm_playing) this._start_bgm();
      this.crowd.update(dt, C.TITLE_AUDIENCE_COUNT, C.TITLE_AUDIENCE_SWAY, C.TITLE_AUDIENCE_SPAN / Math.max(1, C.TITLE_AUDIENCE_COUNT));
    }
    this._update_particles(dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / Math.max(0.01, C.TITLE_FLASH_SEC));
    this._update_spark_volume(dt);
  }
  // タップ。GAME START が押されたら true
  handle_click(pos) {
    if (this.state === "POWERUP") { this._enter_ready(); return false; }
    if (this.state === "READY" && this.btn_rect.collidepoint(pos)) { this.leave(); return true; }
    return false;
  }
  leave() {
    this._stop_spark_loop(C.TITLE_SPARK_FADEOUT_MS);
    if (C.TITLE_BGM !== C.BGM_LOGIN) this._stop_bgm(C.TITLE_BGM_FADEOUT_MS);
    this.active = false;
  }
  _resume() { this.active = true; if (this.state === "READY") this._start_bgm(); else if (this.state === "DARK") this._start_spark_loop(); }
  _start_powerup() {
    this.state = "POWERUP"; this.t_state = 0; this.flicker_idx = -1; this.flash = 1;
    this.lamps.forEach((l, i) => { const [tx, ty] = this._lamp_point(i, l.tip); this._emit_sparks(tx, ty, C.TITLE_SPARK_BIG_COUNT, true); });
    this._stop_spark_loop(C.TITLE_SPARK_FADEOUT_MS);
    this.snd?.playSE("lights", C.TITLE_VOL_LIGHTS_ON);
  }
  _apply_powerup_timeline(t, dt) {
    if (t < C.TITLE_T_NEON_FLICKER) { this.neon_level = 0; this.neon_glow_gain = 0; }
    else if (t < C.TITLE_T_NEON_STABLE) {
      const ft = t - C.TITLE_T_NEON_FLICKER, P = C.TITLE_NEON_FLICKER_PATTERN;
      let idx = -1; P.forEach(([pt], i) => { if (ft >= pt) idx = i; });
      if (idx > this.flicker_idx) {
        let zap = false;
        for (let j = this.flicker_idx + 1; j <= idx; j++) { const prev = j > 0 ? P[j - 1][1] : 0; if (prev < C.TITLE_NEON_ZAP_THRESH && C.TITLE_NEON_ZAP_THRESH <= P[j][1]) zap = true; }
        if (zap) this.snd?.playSE("spark", C.TITLE_VOL_NEON_ZAP, C.TITLE_NEON_ZAP_MS);
        this.flicker_idx = idx;
      }
      this.neon_level = idx >= 0 ? P[idx][1] : 0; this.neon_glow_gain = C.TITLE_NEON_FLICKER_GLOW;
    } else {
      this.neon_level = 1; this.neon_clock += dt;
      const k = clamp01((t - C.TITLE_T_NEON_STABLE) / Math.max(0.01, C.TITLE_NEON_GLOW_FADE_SEC));
      this.neon_glow_gain = C.TITLE_NEON_FLICKER_GLOW + (1 - C.TITLE_NEON_FLICKER_GLOW) * k;
    }
    this.lit = clamp01((t - C.TITLE_T_CROSSFADE) / Math.max(0.01, C.TITLE_CROSSFADE_SEC));
    for (let i = 0; i < this.lamps.length; i++) this.lamp_p[i] = clamp01((t - C.TITLE_T_LAMPS - i * C.TITLE_LAMP_STAGGER) / Math.max(0.01, C.TITLE_LAMP_RETURN_SEC));
    this.spot = clamp01((t - C.TITLE_T_SPOT) / Math.max(0.01, C.TITLE_SPOT_FADE_SEC));
  }
  _enter_ready() {
    const skipped = this.state === "POWERUP" && this.t_state < C.TITLE_T_READY - 0.02;
    this.state = "READY"; this.t_state = 0; this.lit = 1; this.spot = 1; this.cloud_p = 1; this.curtain_p = 1;
    if (skipped) this.crowd.fill(C.TITLE_AUDIENCE_COUNT);
    this.lamp_p = this.lamps.map(() => 1); this.neon_level = 1; this.neon_glow_gain = 1;
    this.flicker_idx = C.TITLE_NEON_FLICKER_PATTERN.length; this.blink_t = 0; this.blink_next = this.rng.uniform(...C.TITLE_NEON_BLINK_INTERVAL);
    this._stop_spark_loop(C.TITLE_SPARK_FADEOUT_MS); this._start_bgm();
  }

  // ---------- 音（ClubSound に任せる。無い音は鳴らさない） ----------
  _start_spark_loop() { if (this.snd?.startLoop("spark", C.TITLE_VOL_SPARK_LOOP, C.TITLE_SPARK_LOOP_MIN_SEC)) { this.spark_loop_on = true; this.spark_boost_t = 0; } }
  _stop_spark_loop(ms) { if (!this.spark_loop_on) return; this.snd?.stopLoop("spark", ms); this.spark_loop_on = false; }
  _spark_sound() {
    if (!this.snd) return;
    if (this.snd.isLoop("spark")) { if (this.spark_loop_on) this.spark_boost_t = C.TITLE_SPARK_BOOST_SEC; }
    else this.snd.playSE("spark", C.TITLE_VOL_SPARK_ONESHOT);
  }
  _update_spark_volume(dt) {
    if (!this.spark_loop_on || this.spark_boost_t <= 0) return;
    this.spark_boost_t = Math.max(0, this.spark_boost_t - dt);
    const k = this.spark_boost_t / Math.max(0.01, C.TITLE_SPARK_BOOST_SEC);
    this.snd?.setLoopVolume("spark", C.TITLE_VOL_SPARK_LOOP + (C.TITLE_VOL_SPARK_BOOST - C.TITLE_VOL_SPARK_LOOP) * k);
  }
  _start_bgm() { if (this.bgm_playing || !this.snd) return; if (this.snd.music(C.TITLE_BGM, C.TITLE_VOL_BGM, C.TITLE_BGM_FADEIN_MS)) this.bgm_playing = true; }
  _stop_bgm(ms) { if (!this.bgm_playing) return; this.snd?.stopMusic(ms); this.bgm_playing = false; }

  // ---------- 火花 ----------
  _update_spark_timer(dt, withSound) {
    this.spark_timer -= dt;
    if (this.spark_timer > 0 || !this.lamps.length) return;
    this.spark_timer = this.rng.uniform(...C.TITLE_SPARK_INTERVAL);
    const i = this.rng.randrange(this.lamps.length), [tx, ty] = this._lamp_point(i, this.lamps[i].tip);
    this._emit_sparks(tx, ty, this.rng.randint(...C.TITLE_SPARK_COUNT));
    if (withSound) this._spark_sound();
  }
  _emit_sparks(x, y, count, big = false) {
    const rng = this.rng;
    for (let n = 0; n < count; n++) {
      if (this.particles.length >= C.TITLE_SPARK_MAX) break;
      const ang = rng.uniform(0, TAU), spd = rng.uniform(...C.TITLE_SPARK_SPEED) * (big ? 1.5 : 1), life = rng.uniform(...C.TITLE_SPARK_LIFE);
      this.particles.push([x, y, Math.cos(ang) * spd, Math.sin(ang) * spd - C.TITLE_SPARK_UP_BIAS, life, life, rng.choice(C.TITLE_SPARK_COLORS)]);
    }
    this.spark_glows.push([x, y, C.TITLE_SPARK_GLOW_SEC, big]);
    for (let n = 0; n < (big ? 3 : 2); n++) {
      let ang = rng.uniform(0, TAU), px = x, py = y; const pts = [[Math.trunc(x), Math.trunc(y)]];
      for (let s = 0; s < 3; s++) { ang += rng.uniform(-0.9, 0.9); const st = rng.uniform(5, 11) * (big ? 1.6 : 1); px += Math.cos(ang) * st; py += Math.sin(ang) * st; pts.push([Math.trunc(px), Math.trunc(py)]); }
      this.arcs.push([pts, 0.07]);
    }
  }
  _update_particles(dt) {
    if (this.particles.length) {
      const g = C.TITLE_SPARK_GRAVITY * dt;
      this.particles = this.particles.filter((p) => { p[4] -= dt; if (p[4] <= 0) return false; p[3] += g; p[0] += p[2] * dt; p[1] += p[3] * dt; return true; });
    }
    for (const gl of this.spark_glows) gl[2] -= dt; this.spark_glows = this.spark_glows.filter((gl) => gl[2] > 0);
    for (const a of this.arcs) a[1] -= dt; this.arcs = this.arcs.filter((a) => a[1] > 0);
  }
  _update_neon_blink(dt) {
    if (this.blink_t > 0) { this.blink_t -= dt; return; }
    this.blink_next -= dt;
    if (this.blink_next > 0 || !this.neon_letters.length) return;
    this.blink_next = this.rng.uniform(...C.TITLE_NEON_BLINK_INTERVAL); this.blink_t = this.rng.uniform(...C.TITLE_NEON_BLINK_SEC);
    const pick = this.rng.randrange(this.neon_letters.length);
    if (this.rng.random() < C.TITLE_NEON_BLINK_WORD_PROB) { const word = this.neon_letters[pick].word; this.blink_set = this.neon_letters.map((lt, i) => (lt.word === word ? i : -1)).filter((i) => i >= 0); }
    else this.blink_set = [pick];
  }

  // ---------- 背景 ----------
  _build_backgrounds(imgs) {
    const lit = imgs.lit ? transform.smoothscale(fromImage(imgs.lit), [W, H]) : null;
    this.bg_lit = lit ? this._opaque(lit) : this._render_room(true);
    if (imgs.dark) this.bg_dark = this._opaque(transform.smoothscale(fromImage(imgs.dark), [W, H]));
    else if (lit) {
      this.bg_dark = this.bg_lit.copy();
      const [tr, tg, tb] = C.TITLE_DARK_TINT, k = 255 * C.TITLE_DARK_BRIGHTNESS;
      this.bg_dark.fill([Math.min(255, Math.trunc(k * tr)), Math.min(255, Math.trunc(k * tg)), Math.min(255, Math.trunc(k * tb))], null, "mult");
      this._paint_dust(this.bg_dark);
    } else this.bg_dark = this._render_room(false);
  }
  _opaque(s) { const o = new Surface(W, H); o.blit(s, [0, 0]); return o; }
  _render_room(lit) {
    const T = lit ? toneLit : toneDark, s = new Surface(W, H);
    this._paint_wall(s, T); this._paint_floor(s, T); this._paint_window(s, T, lit); this._paint_door(s, T, lit); this._paint_stage(s, T, lit);
    for (const [x, y, sc] of C.TITLE_TABLES) this._paint_table(s, T, x, y, sc);
    if (lit) this._paint_lit_lights(s); else { this._paint_dark_lights(s); this._paint_cobwebs(s); this._paint_dust(s); }
    paintVignette(s, lit ? 0.60 : 0.50);
    return s;
  }
  _paint_wall(s, T) {
    const FLOOR = C.TITLE_FLOOR_Y;
    vgrad(s, [0, 0, W, FLOOR], C.TITLE_COL_WALL_TOP, C.TITLE_COL_WALL_BOTTOM, T);
    for (let x = 0; x < W; x += 34) s.fill([0, 0, 0, 30], [x, 0, 17, FLOOR], null);   // 縦じま（下地に半透明の黒）
    const wy = FLOOR - 82;
    s.fill(T(C.TITLE_COL_WAINSCOT), [0, wy, W, FLOOR - wy]); s.fill(T(C.TITLE_COL_TRIM), [0, wy - 3, W, 3]);
    const groove = T(scaleCol(C.TITLE_COL_WAINSCOT, 0.6));
    for (let x = 12; x < W; x += 44) s.fill(groove, [x, wy + 8, 2, FLOOR - wy - 20]);
    s.fill(T(C.TITLE_COL_FRAME), [0, FLOOR - 8, W, 8]);
    s.fill(T(C.TITLE_COL_CEILING), [0, 0, W, 12]); s.fill(T(mix(C.TITLE_COL_CEILING, C.TITLE_COL_TRIM, 0.22)), [0, 12, W, 2]);
    for (const cfg of C.TITLE_LAMPS) { const [ax, ay] = cfg.anchor; draw.rect(s, T([52, 20, 32]), [ax - 8, ay - 6, 16, 7], 0, 2); }
  }
  _paint_floor(s, T) {
    const FLOOR = C.TITLE_FLOOR_Y;
    s.fill(T(C.TITLE_COL_FLOOR_B), [0, FLOOR, W, H - FLOOR]);
    const vy = FLOOR - 84, depth = (H + 18) - vy, ys = [];
    for (let k = 0; ; k++) { const y = vy + depth / (1 + k * 0.22); if (y <= FLOOR) { ys.push(FLOOR); break; } ys.push(y); }
    const cellW = (y) => 122 * (y - vy) / (H - vy);
    const n = Math.trunc(W / 2 / cellW(FLOOR)) + 2, cx = W / 2;
    for (let r = 0; r < ys.length - 1; r++) {
      const yb = ys[r], yt = ys[r + 1], fade = 1 - 0.5 * (r / Math.max(1, ys.length - 2)), col = T(scaleCol(C.TITLE_COL_FLOOR_A, fade));
      const wb = cellW(yb), wt = cellW(yt);
      for (let i = -n; i < n; i++) {
        if (((i + r) % 2 + 2) % 2 !== 0) continue;
        draw.polygon(s, col, [[Math.trunc(cx + i * wt), Math.trunc(yt)], [Math.trunc(cx + (i + 1) * wt), Math.trunc(yt)], [Math.trunc(cx + (i + 1) * wb), Math.trunc(yb)], [Math.trunc(cx + i * wb), Math.trunc(yb)]]);
      }
    }
  }
  _paint_window(s, T, lit) {
    const [fx, fy, fw, fh] = [28, 150, 78, 104];
    this.window_rect = new Rect(fx, fy, fw, fh);
    draw.rect(s, T(C.TITLE_COL_FRAME), [fx, fy, fw, fh], 0, 3);
    const gx = fx + 6, gy = fy + 6, gw = fw - 12, gh = fh - 12;
    if (lit) vgrad(s, [gx, gy, gw, gh], [14, 16, 44], [38, 30, 72], toneLit); else vgrad(s, [gx, gy, gw, gh], [46, 60, 104], [96, 116, 166], toneLit);
    s.fill(T(C.TITLE_COL_FRAME), [fx + Math.floor(fw / 2) - 1, gy, 3, gh]); s.fill(T(C.TITLE_COL_FRAME), [gx, fy + Math.floor(fh / 2) - 1, gw, 3]);
    s.fill(T(mix(C.TITLE_COL_FRAME, C.TITLE_COL_TRIM, 0.25)), [fx - 4, fy + fh, fw + 8, 5]);
  }
  _paint_door(s, T) {
    const FLOOR = C.TITLE_FLOOR_Y, dx = 704, dy = 216, dw = 64, dh = FLOOR - dy;
    draw.rect(s, T(C.TITLE_COL_FRAME), [dx, dy, dw, dh]); draw.rect(s, T([74, 18, 36]), [dx + 5, dy + 5, dw - 10, dh - 5]);
    draw.rect(s, T([46, 11, 23]), [dx + 12, dy + 14, dw - 24, 44], 2); draw.rect(s, T([46, 11, 23]), [dx + 12, dy + 68, dw - 24, dh - 80], 2);
    draw.circle(s, T([214, 170, 104]), [dx + 13, dy + 74], 3);
  }
  _paint_stage(s, T, lit) {
    const X0 = C.TITLE_STAGE_X0, X1 = C.TITLE_STAGE_X1, TOP = C.TITLE_STAGE_TOP, FY = C.TITLE_STAGE_FLOOR_Y, FRONT = C.TITLE_STAGE_FRONT_Y, FLOOR = C.TITLE_FLOOR_Y;
    const backY = FY - 12, cw = X1 - X0, ch = backY - TOP;
    for (let x = X0; x < X1; x++) {
      const ph = (x - X0) / C.TITLE_CURTAIN_FOLD_W * TAU, f = 0.5 + 0.5 * Math.sin(ph), f2 = 0.5 + 0.5 * Math.sin(ph * 0.37 + 1.3);
      s.fill(T(mix(C.TITLE_COL_CURTAIN_DARK, C.TITLE_COL_CURTAIN_LIGHT, Math.pow(f, 1.4) * 0.8 + f2 * 0.2)), [x, TOP, 1, ch]);
    }
    for (let i = 0; i < ch; i++) {
      const v = i / Math.max(1, ch - 1), a = 150 * Math.pow(Math.max(0, 1 - v / 0.55), 1.5) + 70 * Math.max(0, (v - 0.72) / 0.28);
      s.x.fillStyle = `rgba(10,0,6,${Math.min(255, Math.trunc(a)) / 255})`; s.x.fillRect(X0, TOP + i, cw, 1);
    }
    draw.polygon(s, T(C.TITLE_COL_STAGE_TOP), [[X0, backY], [X1, backY], [X1 + 18, FRONT], [X0 - 18, FRONT]]);
    const plank = T(scaleCol(C.TITLE_COL_STAGE_TOP, 0.72));
    for (let i = 1; i < 12; i++) { const k = i / 12; draw.line(s, plank, [Math.trunc(X0 + cw * k), backY], [Math.trunc(X0 - 18 + (cw + 36) * k), FRONT], 1); }
    const tieY = TOP + Math.trunc(ch * 0.64), drape = T(C.TITLE_COL_DRAPE), drapeDk = T(scaleCol(C.TITLE_COL_DRAPE, 0.66)), drapeLt = T(C.TITLE_COL_CURTAIN_LIGHT);
    const drapeW = (y) => (y <= tieY ? 84 - 50 * Math.pow((y - TOP) / (tieY - TOP), 1.5) : 34 + 22 * Math.pow((y - tieY) / Math.max(1, backY - tieY), 0.7));
    for (const side of [-1, 1]) {
      const edge = side < 0 ? X0 : X1, ys = []; for (let y = TOP; y <= backY; y += 4) ys.push(y); if (ys[ys.length - 1] !== backY) ys.push(backY);
      const inner = ys.map((y) => [Math.trunc(edge - side * drapeW(y)), y]);
      draw.polygon(s, drape, [[edge, TOP], ...inner, [edge, backY]]);
      for (const [frac, col] of [[0.30, drapeDk], [0.58, drapeLt], [0.82, drapeDk]]) draw.lines(s, col, false, ys.map((y) => [Math.trunc(edge - side * drapeW(y) * frac), y]), 2);
      const tieW = Math.trunc(drapeW(tieY)) + 4, tx = side > 0 ? edge - tieW : edge;
      draw.rect(s, T([255, 190, 208]), [tx, tieY - 4, tieW, 8], 0, 3);
    }
    const nSwag = 5, sw = cw / nSwag, swag = T(C.TITLE_COL_DRAPE), swagLt = T(C.TITLE_COL_CURTAIN_LIGHT), swagDk = T(scaleCol(C.TITLE_COL_DRAPE, 0.7));
    for (let i = 0; i < nSwag; i++) {
      const x = Math.trunc(X0 + i * sw), w = Math.trunc(X0 + (i + 1) * sw) - x;
      draw.ellipse(s, swag, [x, TOP - 34, w, 70]); draw.ellipse(s, swagDk, [x + 8, TOP - 30, w - 16, 54], 2); draw.ellipse(s, swagLt, [x, TOP - 34, w, 70], 2);
    }
    for (let i = 1; i < nSwag; i++) { const jx = Math.trunc(X0 + i * sw); draw.polygon(s, swagDk, [[jx - 10, TOP], [jx + 10, TOP], [jx, TOP + 46]]); draw.line(s, swagLt, [jx - 10, TOP], [jx, TOP + 46], 1); }
    const frame = T(C.TITLE_COL_FRAME), trim = T(C.TITLE_COL_TRIM);
    s.fill(frame, [X0 - 18, 14, cw + 36, TOP - 14]); s.fill(frame, [X0 - 18, 14, 18, FRONT - 14]); s.fill(frame, [X1, 14, 18, FRONT - 14]);
    s.fill(trim, [X0 - 18, TOP - 2, cw + 36, 2]); s.fill(trim, [X0 - 2, TOP, 2, backY - TOP]); s.fill(trim, [X1, TOP, 2, backY - TOP]);
    const colLine = T(mix(C.TITLE_COL_FRAME, C.TITLE_COL_TRIM, 0.3));
    s.fill(colLine, [X0 - 11, 22, 2, FRONT - 30]); s.fill(colLine, [X1 + 9, 22, 2, FRONT - 30]);
    const [ncx, ncy] = C.TITLE_NEON_CENTER, board = new Rect(0, 0, C.TITLE_NEON_MAX_W + 40, 76); board.center = [ncx, ncy];
    draw.rect(s, T([12, 3, 8]), board, 0, 7); draw.rect(s, T([104, 34, 60]), board, 2, 7);
    for (const [bx, by] of [[board.left + 9, board.top + 9], [board.right - 10, board.top + 9], [board.left + 9, board.bottom - 10], [board.right - 10, board.bottom - 10]]) draw.circle(s, T([104, 34, 60]), [bx, by], 2);
    this.sconces = [[X0 - 9, 204], [X1 + 9, 204]];
    for (const [sx, sy] of this.sconces) {
      draw.polygon(s, lit ? [255, 222, 184] : T([96, 36, 52]), [[sx - 4, sy - 8], [sx + 4, sy - 8], [sx + 7, sy + 6], [sx - 7, sy + 6]]);
      s.fill(T([96, 36, 52]), [sx - 2, sy + 6, 4, 5]);
    }
    s.fill(T([44, 10, 22]), [X0 - 18, FRONT, cw + 36, FLOOR - FRONT]);
    const groove = T([30, 7, 16]);
    for (let x = X0 - 6; x < X1 + 18; x += 26) s.fill(groove, [x, FRONT + 8, 2, FLOOR - FRONT - 14]);
    this.footlights = []; for (let x = X0 + 14; x < X1; x += 59) this.footlights.push(x);
    for (const x of this.footlights) draw.circle(s, lit ? [255, 226, 186] : T([84, 30, 44]), [x, FRONT], 4);
    s.fill(trim, [X0 - 18, FRONT, cw + 36, 3]); s.fill(T([20, 5, 11]), [X0 - 18, FLOOR - 4, cw + 36, 4]);
  }
  _paint_table(s, T, x, y, sc) {
    const R = (v) => Math.round(v * sc), sil = T(C.TITLE_COL_SILHOUETTE);
    for (const side of [-1, 1]) {
      const bx = x + side * R(64);
      draw.rect(s, sil, [bx - R(4), y - R(42), Math.max(2, R(8)), R(52)], 0, Math.max(1, R(3)));
      const seatX = Math.min(bx, bx - side * R(28));
      s.fill(sil, [seatX, y + R(6), R(28) + 1, Math.max(2, R(6))]);
      draw.line(s, sil, [bx, y + R(10)], [bx + side * R(3), y + R(52)], Math.max(2, R(3)));
      draw.line(s, sil, [bx - side * R(25), y + R(10)], [bx - side * R(27), y + R(50)], Math.max(2, R(3)));
    }
    s.fill(sil, [x - R(3), y + R(14), Math.max(2, R(6)), R(36)]);
    draw.ellipse(s, sil, [x - R(19), y + R(46), R(38), Math.max(3, R(9))]);
    const side = T(C.TITLE_COL_CLOTH_SIDE);
    draw.polygon(s, side, [[x - R(46), y], [x + R(46), y], [x + R(41), y + R(20)], [x - R(41), y + R(20)]]);
    draw.ellipse(s, side, [x - R(41), y + R(14), R(82), Math.max(3, R(12))]);
    const fold = T(scaleCol(C.TITLE_COL_CLOTH_SIDE, 0.72));
    for (const fx of [-28, -10, 10, 28]) draw.line(s, fold, [x + R(fx), y + R(9)], [x + R(fx * 0.9), y + R(22)], 1);
    draw.ellipse(s, T(C.TITLE_COL_CLOTH_TOP), [x - R(46), y - R(10), R(92), Math.max(4, R(20))]);
    const plate = T([250, 222, 232]);
    draw.ellipse(s, plate, [x - R(33), y - R(4), R(18), Math.max(2, R(6))]); draw.ellipse(s, plate, [x + R(15), y - R(4), R(18), Math.max(2, R(6))]);
    s.fill(T([120, 40, 60]), [x - R(3), y - R(9), Math.max(2, R(6)), Math.max(2, R(8))]);
  }
  _paint_lit_lights(s) {
    addGlow(s, transform.smoothscale(radialGlow(48, [84, 26, 46], 1.6), [680, 330]), W / 2, 196);
    const foot = radialGlow(20, [120, 74, 54]); for (const x of this.footlights) addGlow(s, foot, x, C.TITLE_STAGE_FRONT_Y - 3);
    const sconce = radialGlow(42, [120, 70, 58]); for (const [sx, sy] of this.sconces) addGlow(s, sconce, sx, sy);
    addGlow(s, transform.smoothscale(radialGlow(48, [52, 22, 26], 1.5), [760, 150]), W / 2, 430);
  }
  _paint_dark_lights(s) {
    const wr = this.window_rect, patch = [[118, 380], [322, 380], [268, 476], [40, 476]];
    const onPatch = (u, v) => { const tx = patch[0][0] + (patch[1][0] - patch[0][0]) * u, ty = patch[0][1] + (patch[1][1] - patch[0][1]) * u, bx = patch[3][0] + (patch[2][0] - patch[3][0]) * u, by = patch[3][1] + (patch[2][1] - patch[3][1]) * u; return [tx + (bx - tx) * v, ty + (by - ty) * v]; };
    let q = 10, small = new Surface(W / q, H / q, { res: 1 });
    const shaft = [[wr.left + 6, wr.top + 6], [wr.right - 6, wr.top + 6], patch[1], patch[2], patch[3]];
    draw.polygon(small, scaleCol(C.TITLE_MOON_COL, 0.42), shaft.map(([px, py]) => [Math.trunc(px / q), Math.trunc(py / q)]));
    s.blit(transform.smoothscale(small, [W, H], s.r), [0, 0], null, "add");
    q = 4; small = new Surface(W / q, H / q, { res: 1 });
    for (const [u0, u1] of [[0, 0.46], [0.54, 1]]) for (const [v0, v1] of [[0, 0.45], [0.55, 1]]) {
      const pane = [onPatch(u0, v0), onPatch(u1, v0), onPatch(u1, v1), onPatch(u0, v1)];
      draw.polygon(small, C.TITLE_MOON_COL, pane.map(([px, py]) => [Math.trunc(px / q), Math.trunc(py / q)]));
    }
    s.blit(transform.smoothscale(small, [W, H], s.r), [0, 0], null, "add");
    addGlow(s, radialGlow(84, scaleCol(C.TITLE_MOON_COL, 1.1)), wr.centerx, wr.centery);
  }
  _paint_cobwebs(s) {
    const col = [58, 62, 78];
    const web = (cx, cy, dx, dy, size) => {
      const ends = []; for (let i = 0; i < 5; i++) { const a = i * (Math.PI / 2) / 4; ends.push([cx + dx * Math.cos(a) * size, cy + dy * Math.sin(a) * size]); }
      for (const [ex, ey] of ends) draw.line(s, col, [Math.trunc(cx), Math.trunc(cy)], [Math.trunc(ex), Math.trunc(ey)], 1);
      for (const frac of [0.35, 0.62, 0.9]) draw.lines(s, col, false, ends.map(([ex, ey], j) => { const f = frac * (j % 2 ? 0.92 : 1); return [Math.trunc(cx + (ex - cx) * f), Math.trunc(cy + (ey - cy) * f)]; }), 1);
    };
    web(C.TITLE_STAGE_X0, C.TITLE_STAGE_TOP, 1, 1, 46); web(C.TITLE_STAGE_X1, C.TITLE_STAGE_TOP, -1, 1, 34); web(W, 14, -1, 1, 54); web(0, C.TITLE_FLOOR_Y - 84, 1, -1, 30);
  }
  _paint_dust(s) {
    const rng = new Rng(C.TITLE_DUST_SEED);
    for (let i = 0; i < C.TITLE_DUST_COUNT; i++) {
      const x = rng.randrange(W), y = rng.randrange(14, H), v = rng.randint(40, 96), col = [v, v, Math.min(255, Math.trunc(v * 1.15))];
      if (rng.random() < 0.15) s.fill(col, [x, y, 2, 1]); else s.fill(col, [x, y, 1, 1]);
    }
  }

  // ---------- 照明 ----------
  _build_lamps() {
    this.lamps = C.TITLE_LAMPS.map((cfg, idx) => {
      const L = cfg.cord_len, tip = cfg.spark_tip || [14, L * 0.6], bulb = [0, L + C.TITLE_LAMP_SHADE_H + 1];
      const reach = Math.max(L + C.TITLE_LAMP_SHADE_H + 14, Math.hypot(C.TITLE_LAMP_SHADE_W / 2 + 4, L + C.TITLE_LAMP_SHADE_H + 6), Math.hypot(tip[0], tip[1]) + 10);
      const R = Math.trunc(reach) + 2;
      return { cfg, anchor: [cfg.anchor[0], cfg.anchor[1]], tip, bulb, phase: idx * 2.1, sprite: { false: this._draw_lamp_sprite(R, L, tip, false), true: this._draw_lamp_sprite(R, L, tip, true) } };
    });
    this.lamp_halo = radialGlow(C.TITLE_LAMP_HALO_R, C.TITLE_LAMP_HALO_COL);
  }
  _draw_lamp_sprite(R, L, tip, lit) {
    const sp = new Surface(R * 2, R * 2, { alpha: true }), c = R; L = Math.trunc(L);
    const hw = Math.floor(C.TITLE_LAMP_SHADE_W / 2), sh = C.TITLE_LAMP_SHADE_H, top = c + L;
    const [cord, shade, edge, bulb] = lit ? [[46, 14, 24], [214, 52, 98], [255, 164, 192], [255, 246, 216]] : [[34, 30, 38], [40, 34, 44], [78, 78, 100], [62, 64, 76]];
    draw.line(sp, cord, [c, c], [c, top], 2);
    if (!lit) {
      const tx = c + Math.trunc(tip[0]), ty = c + Math.trunc(tip[1]), y0 = Math.max(c + 2, ty - 20);
      draw.lines(sp, [52, 46, 56], false, [[c, y0], [c + Math.trunc(tip[0] * 0.45), y0 + 3], [c + Math.trunc(tip[0] * 0.7), ty - 6], [tx, ty]], 2);
      const d = tip[0] >= 0 ? 1 : -1;
      for (const [ox, oy] of [[3 * d, -2], [4 * d, 1], [2 * d, 4]]) draw.line(sp, [196, 128, 70], [tx, ty], [tx + ox, ty + oy], 1);
    }
    draw.rect(sp, cord, [c - 4, top - 7, 8, 8], 0, 2);
    draw.circle(sp, bulb, [c, top + sh + 1], 6);
    draw.polygon(sp, shade, [[c - 7, top], [c + 7, top], [c + hw, top + sh], [c - hw, top + sh]]);
    draw.line(sp, edge, [c - 7, top], [c - hw, top + sh], 2); draw.line(sp, edge, [c - hw, top + sh], [c + hw, top + sh], 2);
    if (lit) draw.ellipse(sp, [255, 236, 200], [c - hw + 5, top + sh - 3, (hw - 5) * 2, 6]);
    return sp;
  }
  _lamp_angle(i) {
    const cfg = this.lamps[i].cfg, p = this.lamp_p[i], droop = cfg.droop_deg, home = cfg.home_deg || 0;
    let ang = droop + (home - droop) * C.easeOutBack(p, C.TITLE_LAMP_OVERSHOOT);
    if (p < 1) ang += (cfg.sway_deg ?? 2.5) * Math.sin(this.t * TAU / Math.max(0.1, cfg.sway_period ?? 2.5) + this.lamps[i].phase) * (1 - p);
    return ang;
  }
  _lamp_point(i, local, q = null) {
    const [ax, ay] = this.lamps[i].anchor;
    if (q === null) q = Math.round(this._lamp_angle(i) * 2);
    const [dx, dy] = rot(local[0], local[1], q * 0.5);
    return [ax + dx, ay + dy];
  }
  _draw_lamps(dst, lit, atHome = false) {
    this.lamps.forEach((lamp, i) => {
      const ang = atHome ? (lamp.cfg.home_deg || 0) : this._lamp_angle(i), q = Math.round(ang * 2), [ax, ay] = lamp.anchor;
      if (lit > 0.02) { const [bx, by] = this._lamp_point(i, lamp.bulb, q), hr = Math.floor(this.lamp_halo.get_width() / 2); this._blit_add(dst, this.lamp_halo, [Math.trunc(bx) - hr, Math.trunc(by) - hr], lit); }
      if (lit < 0.98) { const [img, off] = this._lamp_image(i, false, q); dst.blit(img, [Math.round(ax + off[0]), Math.round(ay + off[1])]); }
      if (lit > 0.02) { const [img, off] = this._lamp_image(i, true, q); this._blit_alpha(dst, img, [Math.round(ax + off[0]), Math.round(ay + off[1])], lit); }
    });
  }
  _lamp_image(i, lit, q) {
    const key = `${i},${lit},${q}`;
    let hit = this._rot_cache.get(key);
    if (!hit) {
      if (this._rot_cache.size >= C.TITLE_LAMP_CACHE_MAX) this._rot_cache.clear();
      const r = transform.rotozoom(this.lamps[i].sprite[lit], q * 0.5, 1);
      hit = [r, [-r.get_width() / 2, -r.get_height() / 2]];
      this._rot_cache.set(key, hit);
    }
    return hit;
  }

  // ---------- ネオン看板 ----------
  _neon_font(size) { return new Font(size, { family: this.neonFamily ? `"${this.neonFamily}",${C.TITLE_NEON_SYSFONTS}` : C.TITLE_NEON_SYSFONTS, bold: C.TITLE_NEON_BOLD }); }
  _stroke(glyph, r) {
    const [w, h] = glyph.get_size(), out = new Surface(w + r * 2 + 2, h + r * 2 + 2, { alpha: true });
    if (r <= 0) { out.blit(glyph, [1, 1]); return out; }
    const d = Math.max(1, Math.round(r * 0.7));
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [d, d], [-d, d], [d, -d], [-d, -d]]) out.blit(glyph, [r + 1 + ox, r + 1 + oy]);
    return out;
  }
  _build_neon() {
    const text = C.TITLE_NEON_TEXT;
    let size = C.TITLE_NEON_SIZE, font = this._neon_font(size);
    while (size > 18 && font.size(text)[0] > C.TITLE_NEON_MAX_W) { size -= 2; font = this._neon_font(size); }
    const [totalW, textH] = font.size(text), [cx, cy] = C.TITLE_NEON_CENTER;
    const x0 = Math.trunc(cx - totalW / 2), y0 = Math.trunc(cy - textH / 2), r = C.TITLE_NEON_TUBE_WIDTH, gp = C.TITLE_NEON_GLOW_PAD, m = r + 1;
    this.neon_letters = [];
    let word = 0, minX = 1e6, minY = 1e6, maxX = -1e6, maxY = -1e6;
    [...text].forEach((chv, i) => {
      if (/\s/.test(chv)) { word++; return; }
      const lx = x0 + font.size(text.slice(0, i))[0];
      const off = this._stroke(font.render(chv, true, C.TITLE_NEON_OFF_COL), r);
      off.blit(font.render(chv, true, scaleCol(C.TITLE_NEON_OFF_COL, 1.5)), [m, m]);
      const on = this._stroke(font.render(chv, true, C.TITLE_NEON_TUBE_COL), r);
      on.blit(font.render(chv, true, C.TITLE_NEON_CORE_COL), [m, m]);
      const [sw, sh] = on.get_size();
      const base = new Surface(sw + gp * 2, sh + gp * 2); base.blit(this._stroke(font.render(chv, true, C.TITLE_NEON_GLOW_COL), r), [gp, gp]);
      const glow = new Surface(base.w, base.h);
      for (const [factor, times] of C.TITLE_NEON_GLOW_BLUR) { const bl = softBlur(base, factor); for (let k = 0; k < times; k++) glow.blit(bl, [0, 0], null, "add"); }
      const pos = [lx - m, y0 - m], gpos = [pos[0] - gp, pos[1] - gp];
      this.neon_letters.push({ off, on, glow, pos, glow_pos: gpos, word });
      minX = Math.min(minX, gpos[0]); minY = Math.min(minY, gpos[1]); maxX = Math.max(maxX, gpos[0] + glow.w); maxY = Math.max(maxY, gpos[1] + glow.h);
    });
    this.neon_glow_all = null; this.neon_glow_all_pos = [0, 0];
    if (this.neon_letters.length) {
      this.neon_glow_all = new Surface(maxX - minX, maxY - minY);
      for (const lt of this.neon_letters) this.neon_glow_all.blit(lt.glow, [lt.glow_pos[0] - minX, lt.glow_pos[1] - minY], null, "add");
      this.neon_glow_all_pos = [minX, minY];
    }
  }
  _build_fx() {
    this.spark_glow = radialGlow(C.TITLE_SPARK_GLOW_R, C.TITLE_SPARK_GLOW_COL);
    this.spark_glow_big = radialGlow(Math.trunc(C.TITLE_SPARK_GLOW_R * 1.9), C.TITLE_SPARK_GLOW_COL);
    this.candle_glow = radialGlow(34, [128, 82, 44]);
    const q = 4, xs = [], ys = [];
    for (const [tc, tw, bc, bw] of C.TITLE_SPOT_BEAMS) { xs.push(tc[0] - tw / 2, tc[0] + tw / 2, bc[0] - bw / 2, bc[0] + bw / 2); ys.push(tc[1], bc[1]); }
    const [px, py, pw, ph] = C.TITLE_SPOT_POOL; xs.push(px - pw / 2, px + pw / 2); ys.push(py - ph / 2, py + ph / 2);
    const rng = new Rng(C.TITLE_DUST_SEED + 1);
    this.motes = []; for (let i = 0; i < C.TITLE_DUST_MOTES; i++) this.motes.push([rng.uniform(0, W), rng.uniform(30, H), rng.uniform(-7, 7), rng.uniform(-5, 3), rng.uniform(0, 6.28)]);
    const bx0 = Math.trunc(Math.min(...xs)) - 12, by0 = Math.trunc(Math.min(...ys));
    let bw_ = Math.trunc(Math.max(...xs)) + 12 - bx0, bh_ = Math.trunc(Math.max(...ys)) + 8 - by0;
    bw_ = (Math.floor(bw_ / q) + 1) * q; bh_ = (Math.floor(bh_ / q) + 1) * q;
    const acc = new Surface(bw_ / q, bh_ / q, { res: 1 });
    for (const [tc, tw, bc, bw] of C.TITLE_SPOT_BEAMS) {
      const layer = new Surface(acc.w, acc.h, { res: 1 });
      const pts = [[tc[0] - tw / 2, tc[1]], [tc[0] + tw / 2, tc[1]], [bc[0] + bw / 2, bc[1]], [bc[0] - bw / 2, bc[1]]];
      draw.polygon(layer, C.TITLE_SPOT_COL, pts.map(([x, y]) => [Math.trunc((x - bx0) / q), Math.trunc((y - by0) / q)]));
      acc.blit(layer, [0, 0], null, "add");
    }
    const layer = new Surface(acc.w, acc.h, { res: 1 });
    draw.ellipse(layer, scaleCol(C.TITLE_SPOT_COL, 0.9), [Math.trunc((px - pw / 2 - bx0) / q), Math.trunc((py - ph / 2 - by0) / q), Math.max(1, Math.trunc(pw / q)), Math.max(1, Math.trunc(ph / q))]);
    acc.blit(layer, [0, 0], null, "add");
    this.spot_surf = transform.smoothscale(acc, [bw_, bh_], 1); this.spot_pos = [bx0, by0];
  }

  // ---------- 満月と雲・幕・バンド・観客 ----------
  _build_show(faces) {
    this.moon_glow = radialGlow(C.TITLE_MOON_GLOW_R, C.TITLE_MOON_GLOW_COL, 2.2);
    this.clouds = [];
    for (const [seed, [w, h]] of [[3, [30, 14]], [8, [28, 13]]]) {
      const rng = new Rng(seed), c = new Surface(w + 4, h + 6, { alpha: true });
      draw.ellipse(c, C.TITLE_CLOUD_COL, [0, Math.floor(h / 3) + 3, w + 4, h - Math.floor(h / 3) + 2]);
      for (let i = 0; i < 3; i++) draw.circle(c, scaleCol(C.TITLE_CLOUD_COL, 1.1), [7 + Math.floor(i * (w - 10) / 2), Math.floor(h / 2) + 2 + rng.randint(-1, 1)], Math.floor(h / 2) - 1 + rng.randint(-1, 1));
      this.clouds.push(c);
    }
    const X0 = C.TITLE_STAGE_X0, X1 = C.TITLE_STAGE_X1;
    this.curtain_rect = new Rect(X0, C.TITLE_STAGE_TOP + 22, X1 - X0, C.TITLE_STAGE_FRONT_Y - C.TITLE_STAGE_TOP - 20);
    this.curtain_lit = this._paint_curtain(toneLit);
    this.bg_dark.blit(this._paint_curtain(toneDark), this.curtain_rect.topleft);
    this.band = new StageBand(faces || {});
    const br = this.btn_rect, blocked = [[br.x - 34, br.y - 12, br.w + 68, H - br.y + 12]];
    this.msg_plate = new Surface(br.w + 110, 24, { alpha: true });
    draw.rect(this.msg_plate, [0, 0, 0, 130], [0, 0, br.w + 110, 24], 0, 8);
    this.crowd = new Audience("title", C.TITLE_AUDIENCE_COUNT, blocked);
  }
  _paint_curtain(T) {
    const [w, h] = this.curtain_rect.size, s = new Surface(w, h);
    for (let x = 0; x < w; x++) {
      const ph = x / C.TITLE_CURTAIN_FOLD * TAU, f = 0.5 + 0.5 * Math.sin(ph), f2 = 0.5 + 0.5 * Math.sin(ph * 0.37 + 1.3);
      s.fill(T(mix(scaleCol(C.TITLE_COL_CURTAIN_DARK, 0.86), scaleCol(C.TITLE_COL_CURTAIN_LIGHT, 0.9), Math.pow(f, 1.4) * 0.8 + f2 * 0.2)), [x, 0, 1, h]);
    }
    for (let i = 0; i < 26; i++) { const k = 0.62 + 0.38 * i / 25, v = Math.trunc(255 * k); s.fill([v, v, v], [0, i, w, 1], "mult"); }
    s.fill(T([168, 122, 60]), [0, h - 13, w, 3]);
    for (let x = 2; x < w; x += 6) s.fill(T([132, 94, 44]), [x, h - 10, 2, 7]);
    s.fill(T([20, 4, 10]), [0, h - 3, w, 3]);
    return s;
  }
  _draw_curtain(screen, lit) {
    const r = this.curtain_rect, e = this.curtain_p * this.curtain_p * (3 - 2 * this.curtain_p), h = Math.round(r.h * (1 - e));
    if (h <= 0) return;
    screen.blit(this.curtain_lit, r.topleft, [0, r.h - h, r.w, h], null, lit >= 1 ? 1 : lit);
  }
  _draw_moon(screen, p = null) {
    p = p === null ? this.cloud_p : p;
    const e = p * p * (3 - 2 * p), [mx, my] = C.TITLE_MOON_POS, gr = Math.floor(this.moon_glow.get_width() / 2);
    this._blit_add(screen, this.moon_glow, [mx - gr, my - gr], C.TITLE_MOON_GLOW_HIDDEN + (1 - C.TITLE_MOON_GLOW_HIDDEN) * e);
    const [px, py, pw, ph] = C.TITLE_MOON_PANE, x = screen.x;
    x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();      // 窓ガラス1枚の中だけに描く
    draw.circle(screen, C.TITLE_FULLMOON_COL, [mx, my], C.TITLE_MOON_R);
    if (e < 1) {
      const sway = C.TITLE_CLOUD_SWAY[0] * Math.sin(this.t * TAU / Math.max(0.1, C.TITLE_CLOUD_SWAY[1])) * (1 - e);
      for (const [c, d, oy] of [[this.clouds[0], -1, -3], [this.clouds[1], 1, 3]]) {
        const cx = mx + d * (5 + C.TITLE_CLOUD_MOVE * e) + sway;
        screen.blit(c, [Math.round(cx - c.get_width() / 2), Math.trunc(my + oy - Math.floor(c.get_height() / 2))]);
      }
    }
    x.restore();
  }
  _build_ready_bg() {
    try {
      const s = this.bg_lit.copy();
      if (this.spot_surf) s.blit(this.spot_surf, this.spot_pos, null, "add");
      this._draw_lamps(s, 1, true);
      this._draw_moon(s, 1);
      this.ready_bg = s;
    } catch (e) { console.warn(e); this.ready_bg = null; }
  }
  _text(font, text, color, shadow = true) {
    const key = `${font.css}|${text}|${color}|${shadow}`;
    let s = this._text_cache.get(key);
    if (!s) {
      if (this._text_cache.size > 40) this._text_cache.clear();
      const main = font.render(text, true, color);
      if (shadow) { s = new Surface(main.w + 2, main.h + 2, { alpha: true }); s.blit(font.render(text, true, [0, 0, 0]), [2, 2]); s.blit(main, [0, 0]); }
      else s = main;
      this._text_cache.set(key, s);
    }
    return s;
  }
  _build_ui() {
    const [bw, bh] = this.btn_rect.size;
    this.btn_surfs = [[78, 205, 196], [128, 232, 224]].map((col) => {
      const b = new Surface(bw, bh, { alpha: true });
      draw.rect(b, col, [0, 0, bw, bh], 0, 6);
      const txt = this.font_md.render("GAME START", true, [17, 17, 17]);
      b.blit(txt, [Math.floor(bw / 2) - Math.floor(txt.w / 2), Math.floor(bh / 2) - Math.floor(txt.h / 2)]);
      return b;
    });
  }

  // ---------- 描画 ----------
  _blit_add(dst, src, pos, k) { if (k <= 0.02) return; dst.blit(src, pos, null, "add", Math.min(1, k)); }
  _blit_alpha(dst, src, pos, k) { if (k <= 0.02) return; dst.blit(src, pos, null, null, Math.min(1, k)); }
  draw(screen) {
    const lit = this.lit, baked = this.state === "READY" && this.ready_bg;
    if (baked) screen.blit(this.ready_bg, [0, 0]);
    else if (lit <= 0) screen.blit(this.bg_dark, [0, 0]);
    else if (lit >= 1) screen.blit(this.bg_lit, [0, 0]);
    else { screen.blit(this.bg_dark, [0, 0]); screen.blit(this.bg_lit, [0, 0], null, null, lit); }
    if (!baked) this._draw_moon(screen);
    if (lit >= 1 && this.curtain_p > 0) this.band.draw(screen);
    if (lit > 0 && this.curtain_p < 1) this._draw_curtain(screen, lit);
    if (lit < 0.9 && this.motes.length) {
      const t = this.t;
      for (const mt of this.motes) {
        const v = Math.trunc((52 + 30 * Math.sin(t * 0.9 + mt[4])) * (1 - lit));
        if (v > 8) {
          const x = (((mt[0] + mt[2] * t + 6 * Math.sin(t * 0.6 + mt[4])) % W) + W) % W, y = 30 + (((mt[1] + mt[3] * t) % (H - 30)) + (H - 30)) % (H - 30);
          screen.fill([v, v, Math.min(255, v + 14)], [Math.trunc(x), Math.trunc(y), 2, 2]);
        }
      }
    }
    if (lit > 0.02) {
      const t = this.t, gw = Math.floor(this.candle_glow.get_width() / 2);
      for (const [cx, cy, sc, ph] of this.candles) {
        const fl = 0.84 + 0.10 * Math.sin(t * 9 + ph) + 0.06 * Math.sin(t * 23 + ph * 2.3);
        this._blit_add(screen, this.candle_glow, [Math.trunc(cx) - gw, Math.trunc(cy) - gw], lit * fl);
        if (lit > 0.5) {
          const fw = Math.max(2, Math.trunc(4 * sc)), fh = Math.max(4, Math.trunc(9 * sc * (0.9 + 0.2 * fl)));
          draw.ellipse(screen, [255, 206, 110], [Math.trunc(cx) - Math.floor(fw / 2), Math.trunc(cy) - fh + 3, fw, fh]);
          draw.ellipse(screen, [255, 250, 224], [Math.trunc(cx) - 1, Math.trunc(cy) - Math.floor(fh / 2) + 2, 2, Math.max(2, Math.floor(fh / 2))]);
        }
      }
    }
    if (!baked && this.spot > 0.02 && this.spot_surf) this._blit_add(screen, this.spot_surf, this.spot_pos, this.spot);
    this._draw_neon(screen);
    if (!baked) this._draw_lamps(screen, lit);
    for (const gl of this.spark_glows) {
      const g = gl[3] ? this.spark_glow_big : this.spark_glow, hr = Math.floor(g.get_width() / 2);
      this._blit_add(screen, g, [Math.trunc(gl[0]) - hr, Math.trunc(gl[1]) - hr], gl[2] / Math.max(0.01, C.TITLE_SPARK_GLOW_SEC));
    }
    for (const [pts] of this.arcs) draw.lines(screen, [226, 238, 255], false, pts, 1);
    for (const p of this.particles) {
      const k = p[4] / Math.max(0.01, p[5]), col = scaleCol(p[6], 0.25 + 0.75 * k), x = Math.trunc(p[0]), y = Math.trunc(p[1]);
      const tail = Math.min(0.028, p[5] - p[4]);
      draw.line(screen, col, [x, y], [Math.trunc(p[0] - p[2] * tail), Math.trunc(p[1] - p[3] * tail)], 1);
      if (k > 0.3) screen.fill(col, [x - 1, y - 1, 2, 2]);
    }
    if (this.state === "READY") this.crowd.draw_people(screen);
    this._draw_ui(screen);
    if (this.flash > 0.02) { const v = Math.trunc(C.TITLE_FLASH_STRENGTH * this.flash * this.flash); if (v > 0) screen.fill([v, v, v], null, "add"); }
  }
  _draw_neon(screen) {
    const level = this.neon_level, blinking = this.blink_t > 0 && this.state === "READY" ? this.blink_set : [];
    if (level > 0.02 && this.neon_glow_gain > 0.02) {
      const breath = 1 - C.TITLE_NEON_BREATH * (1 - Math.cos(this.neon_clock * TAU / Math.max(0.1, C.TITLE_NEON_BREATH_PERIOD)));
      const g = level * this.neon_glow_gain * breath;
      if (!blinking.length && this.neon_glow_all) this._blit_add(screen, this.neon_glow_all, this.neon_glow_all_pos, g);
      else this.neon_letters.forEach((lt, i) => this._blit_add(screen, lt.glow, lt.glow_pos, g * (blinking.includes(i) ? C.TITLE_NEON_BLINK_LEVEL : 1)));
    }
    this.neon_letters.forEach((lt, i) => {
      const b = level * (blinking.includes(i) ? C.TITLE_NEON_BLINK_LEVEL : 1);
      if (b < 0.98) screen.blit(lt.off, lt.pos);
      this._blit_alpha(screen, lt.on, lt.pos, b);
    });
  }
  _draw_ui(screen) {
    const cx = Math.floor(W / 2);
    if (this.state === "DARK") {
      const main = this._text(this.font_lg, this.waitMain || C.TITLE_TEXT_WAIT_MAIN, [255, 214, 228]);
      this._blit_alpha(screen, main, [cx - Math.floor(main.w / 2), 180], 0.72 + 0.26 * Math.sin(this.t * 2.6));
      const sub = this.cam_error ? this._text(this.font_sm, this.cam_error, [231, 76, 60]) : this._text(this.font_sm, this.waitSub || C.TITLE_TEXT_WAIT_SUB, [188, 190, 204]);
      screen.blit(sub, [cx - Math.floor(sub.w / 2), 232]);
    } else if (this.state === "READY") {
      const a = this.ui;
      this._blit_alpha(screen, this.btn_surfs[0], this.btn_rect.topleft, a);
      const msg = this.cam_error ? this._text(this.font_sm, this.cam_error, [231, 76, 60]) : this._text(this.font_sm, this.readyText || C.TITLE_TEXT_READY, [236, 236, 236]);
      const my = this.btn_rect.bottom + 12;
      this._blit_alpha(screen, this.msg_plate, [cx - Math.floor(this.msg_plate.w / 2), my - 3], a);
      this._blit_alpha(screen, msg, [cx - Math.floor(msg.w / 2), my], a);
    }
  }
}
