// =====================================================
// art.js — タイトル以外の画面の絵（PC版 ClubArt / TransitionManager の移植）
// =====================================================
import { W, H, TAU, Rect, Rng, Surface, Font, draw, transform, mix, scaleCol, radialGlow, softBlur, toneSurface, GOTHIC, MINCHO } from "./pg.js";
import * as C from "./cfg.js";
import { vgrad, addGlow, paintVignette, toneLit } from "./title.js";

// ---- メニュー表・ミキサーの範囲（描画とタップ判定の両方で使う） ----
export function bookPages() {
  const [x, y, w, h] = C.CLUB_BOOK_RECT, half = Math.floor(w / 2);
  return [new Rect(x + 6, y + 6, half - 6, h - 12), new Rect(x + half, y + 6, half - 6, h - 12)];
}
export function menuSongRects() {
  const out = [];
  for (const page of bookPages()) for (let j = 0; j < C.CLUB_MENU_PER_PAGE; j++) out.push(new Rect(page.x + 10, page.y + 64 + j * 78, page.w - 20, 72));
  return out;
}
export function menuDiffRects() { const page = bookPages()[1]; return [0, 1, 2].map((i) => new Rect(page.x + 10, page.y + 64 + i * 78, page.w - 20, 72)); }
export function menuTurnRects() { const [x, y, w, h] = C.CLUB_BOOK_RECT; return [new Rect(x - 32, y + Math.floor(h / 2) - 32, 36, 64), new Rect(x + w - 4, y + Math.floor(h / 2) - 32, 36, 64)]; }
export function mixerRects(i) {
  const cx = C.CLUB_MIXER_CX[i], [y0, y1] = C.CLUB_MIXER_TRACK;
  return { cx, y0, y1, led: new Rect(cx - 34, 116, 68, 26), plus: new Rect(cx - 20, 150, 40, 26), minus: new Rect(cx - 20, y1 + 18, 40, 26), grab: new Rect(cx - 24, y0 - 10, 48, y1 - y0 + 20) };
}
export function faderY(ratio) { const [y0, y1] = C.CLUB_MIXER_TRACK; return Math.round(y1 - (y1 - y0) * Math.max(0, Math.min(1, ratio))); }
export function faderRatio(mouseY) { const [y0, y1] = C.CLUB_MIXER_TRACK; return Math.max(0, Math.min(1, (y1 - mouseY) / (y1 - y0))); }

// フォント（PC版の F["g_sm"] など。g = ゴシック、m = 明朝）
export function makeFonts() {
  const F = {};
  for (const [k, sz] of Object.entries({ xs: 13, sm: 16, md: 24, lg: 32, xl: 48 })) F["g_" + k] = new Font(sz, { family: GOTHIC });
  for (const [k, sz] of Object.entries(C.CLUB_MINCHO_SIZES)) F["m_" + k] = new Font(sz, { family: MINCHO });
  return F;
}

export class ClubArt {
  constructor(ts, fonts) {
    this.ts = ts; this.W = W; this.H = H; this.F = fonts;
    this._bg = new Map(); this._text = new Map(); this._cache = new Map(); this._stamps = new Map(); this._panels = new Map();
    this.icons = {}; this._small = new Map();
    this._warm = ["hall", "lobby", "tablet", "table", "curtain", "board", "mixer", "rehearsal", "soundcheck", "play_rehearsal"];
  }
  bg(name) {
    let s = this._bg.get(name);
    if (!s) {
      try { s = this["_make_" + name](); }
      catch (e) { console.warn("[店内演出] 背景を描けませんでした（単色にします）", name, e); s = new Surface(W, H); s.fill(C.CLUB_COL_FALLBACK); }
      this._bg.set(name, s);
    }
    return s;
  }
  warm_up() { while (this._warm.length) { const n = this._warm.shift(); if (!this._bg.has(n)) { this.bg(n); return true; } } return false; }
  cached(name, key, builder) {
    const hit = this._cache.get(name);
    if (hit && hit[0] === key) return hit[1];
    const s = builder(); this._cache.set(name, [key, s]); return s;
  }
  text(font, text, color) {
    const key = `${font.css}|${text}|${color}`;
    let s = this._text.get(key);
    if (!s) { if (this._text.size > 500) this._text.clear(); s = font.render(text, true, color); this._text.set(key, s); }
    return s;
  }
  text_c(surf, font, text, color, cx, y) { const t = this.text(font, text, color); surf.blit(t, [Math.trunc(cx - Math.floor(t.w / 2)), Math.trunc(y)]); return t; }

  // ---------- 部品 ----------
  tone_surface(src, sat, bright, tint = [1, 1, 1]) { return toneSurface(src, sat, bright, tint); }
  shade_rect(s, rect, rgba, radius = 0) { const r = new Rect(rect); const layer = new Surface(r.w, r.h, { alpha: true }); draw.rect(layer, rgba, [0, 0, r.w, r.h], 0, radius); s.blit(layer, r.topleft); }
  paper(w, h, seed = 1, col = null) {
    const base = col || C.CLUB_COL_PAPER, s = new Surface(w, h); s.fill(base);
    const rng = new Rng(seed);
    for (let i = 0; i < Math.floor(w * h / 420); i++) s.fill(scaleCol(base, rng.uniform(0.93, 0.985)), [rng.randrange(w), rng.randrange(h), rng.randint(1, 3), 1]);
    return s;
  }
  stamp(text, font, angle = -12, col = null) {
    col = col || C.CLUB_COL_STAMP;
    const key = `${text}|${font.css}|${angle}|${col}`;
    let s = this._stamps.get(key);
    if (!s) {
      const t = font.render(text, true, col), w = t.w + 22, h = t.h + 12;
      const flat = new Surface(w, h, { alpha: true });
      draw.rect(flat, col, [0, 0, w, h], 3, 6); draw.rect(flat, col, [5, 5, w - 10, h - 10], 1, 3); flat.blit(t, [11, 6]);
      const rng = new Rng(text.length * 7 + 3);
      for (let i = 0; i < Math.floor(w * h / 26); i++) flat.x.clearRect(rng.randrange(w), rng.randrange(h), 1, 1);   // かすれ
      s = transform.rotozoom(flat, angle, 1);
      this._stamps.set(key, s);
    }
    return s;
  }
  card(surf, rect, label, hover = false, font = null, style = "paper") {
    const r = new Rect(rect); font = font || this.F.m_sm;
    let body, edge, ink;
    if (style === "wood") [body, edge, ink] = [hover ? [120, 60, 44] : [86, 40, 32], [214, 160, 110], C.CLUB_COL_CREAM];
    else if (style === "chalk") [body, edge, ink] = [hover ? [46, 80, 68] : [24, 48, 40], C.CLUB_COL_CHALK, C.CLUB_COL_CHALK];
    else [body, edge, ink] = [hover ? C.CLUB_COL_CARD_HOVER : C.CLUB_COL_PAPER, C.CLUB_COL_PAPER_EDGE, C.CLUB_COL_INK];
    draw.rect(surf, C.CLUB_COL_CARD_SHADOW, r.move(2, 3), 0, 5); draw.rect(surf, body, r, 0, 5); draw.rect(surf, edge, r, 2, 5);
    if (label) {
      let f = font, t = this.text(f, label, ink);
      if (t.w > r.w - 8) { f = new Font(Math.max(10, Math.floor(font.sizePx * (r.w - 8) / t.w)), { family: font.family }); t = this.text(f, label, ink); }
      surf.blit(t, [r.centerx - Math.floor(t.w / 2), r.centery - Math.floor(t.h / 2)]);
    }
  }
  app_button(surf, rect, label, col, txtCol = [17, 17, 17], hover = false, font = null) {
    const r = new Rect(rect); font = font || this.F.g_md;
    draw.rect(surf, hover ? mix(col, [255, 255, 255], 0.28) : col, r, 0, 10);
    const t = this.text(font, label, txtCol); surf.blit(t, [r.centerx - Math.floor(t.w / 2), r.centery - Math.floor(t.h / 2)]);
  }
  panel(w, h) {
    const key = `${w}x${h}`; let s = this._panels.get(key);
    if (!s) {
      s = new Surface(w, h, { alpha: true });
      draw.rect(s, C.CLUB_COL_METAL, [0, 0, w, h], 0, 10); draw.rect(s, scaleCol(C.CLUB_COL_METAL, 1.25), [3, 3, w - 6, 16], 0, 7); draw.rect(s, C.CLUB_COL_METAL_EDGE, [0, 0, w, h], 2, 10);
      for (const [sx, sy] of [[11, 11], [w - 12, 11], [11, h - 12], [w - 12, h - 12]]) { draw.circle(s, [150, 144, 160], [sx, sy], 4); draw.line(s, [60, 56, 68], [sx - 2, sy - 2], [sx + 2, sy + 2], 1); }
      this._panels.set(key, s);
    }
    return s;
  }
  small_icon(key, size) {
    const k = `${key}|${size}`;
    if (!this._small.has(k)) { const img = this.icons[key]; this._small.set(k, img && img.naturalWidth ? transform.smoothscale(img, [size, size]) : null); }
    return this._small.get(k);
  }
  leader_line(surf, font, left, right, x, y, w, col, colRight = null) {
    const lt = this.text(font, left, col), rt = this.text(font, right, colRight || col);
    surf.blit(lt, [x, y]); surf.blit(rt, [x + w - rt.w, y]);
    const yy = y + Math.trunc(lt.h * 0.60), dot = mix(col, C.CLUB_COL_PAPER, 0.45);
    for (let dx = x + lt.w + 8; dx < x + w - rt.w - 8; dx += 7) surf.fill(dot, [dx, yy, 2, 2]);
  }
  _corner(s, col, cx, cy, sx, sy, R) {
    const ax = cx + sx * R, ay = cy + sy * R, pts = [[cx, cy]];
    for (let i = 0; i < 10; i++) { const a = i * 10 * Math.PI / 180; pts.push([Math.round(ax - sx * R * Math.sin(a)), Math.round(ay - sy * R * Math.cos(a))]); }
    draw.polygon(s, col, pts);
  }
  _folds(s, rect, foldW, cDark, cLight, phase = 0) {
    const [x0, y0, w, h] = rect;
    for (let x = 0; x < w; x++) {
      const ph = (x + phase) / foldW * TAU, f = 0.5 + 0.5 * Math.sin(ph), f2 = 0.5 + 0.5 * Math.sin(ph * 0.37 + 1.3);
      s.fill(mix(cDark, cLight, Math.pow(f, 1.4) * 0.8 + f2 * 0.2), [x0 + x, y0, 1, h]);
    }
  }
  _neon_on(s) { const ts = this.ts; if (ts.neon_glow_all) s.blit(ts.neon_glow_all, ts.neon_glow_all_pos, null, "add"); for (const lt of ts.neon_letters) s.blit(lt.on, lt.pos); }

  // ---------- 背景 ----------
  _make_hall() {
    const ts = this.ts, s = (ts.ready_bg || ts.bg_lit).copy();
    this._neon_on(s);
    for (const [cx, cy, sc] of ts.candles) {
      addGlow(s, ts.candle_glow, cx, cy);
      const fw = Math.max(2, Math.trunc(4 * sc)), fh = Math.max(4, Math.trunc(9 * sc));
      draw.ellipse(s, [255, 206, 110], [Math.trunc(cx) - Math.floor(fw / 2), Math.trunc(cy) - fh + 3, fw, fh]);
    }
    return s;
  }
  _make_lobby() {
    const ts = this.ts, far = this.bg("hall").copy();
    ts.band.draw(far, null, 0);
    const s = softBlur(far, 5); s.fill([132, 122, 128], null, "mult");
    const cy = C.CLUB_LOGIN_COUNTER_Y;
    vgrad(s, [0, cy, W, 16], [168, 70, 82], [104, 34, 48], toneLit); s.fill(C.TITLE_COL_TRIM, [0, cy, W, 2]);
    vgrad(s, [0, cy + 16, W, H - cy - 16], [62, 15, 28], [30, 7, 15], toneLit);
    for (let x = 30; x < W; x += 92) draw.rect(s, [44, 10, 20], [x, cy + 26, 70, H - cy - 34], 2, 3);
    this.text_c(s, this.F.m_sm, "R E C E P T I O N", [214, 150, 170], Math.floor(W / 2), cy + 44);
    addGlow(s, transform.smoothscale(radialGlow(48, [46, 20, 26], 1.5), [700, 300]), W / 2, 140);
    const tr = new Rect(C.CLUB_LOGIN_TABLET);
    draw.polygon(s, [16, 14, 18], [[tr.centerx - 46, tr.bottom - 4], [tr.centerx + 46, tr.bottom - 4], [tr.centerx + 62, cy + 14], [tr.centerx - 62, cy + 14]]);
    draw.rect(s, [4, 3, 5], tr.move(4, 5), 0, 20); draw.rect(s, C.CLUB_COL_BEZEL, tr, 0, 18); draw.rect(s, [58, 54, 66], tr, 1, 18);
    const sr = this.login_screen_rect();
    vgrad(s, sr.arr(), C.CLUB_COL_TABLET_TOP, C.CLUB_COL_TABLET_BOTTOM, toneLit);
    draw.circle(s, [40, 38, 48], [tr.centerx, tr.y + 7], 2);
    paintVignette(s, 0.72);
    vgrad(s, sr.arr(), C.CLUB_COL_TABLET_TOP, C.CLUB_COL_TABLET_BOTTOM, toneLit);
    return s;
  }
  login_screen_rect() { return new Rect(C.CLUB_LOGIN_TABLET).inflate(-28, -28); }
  _make_tablet() {
    const b = C.CLUB_TABLET_BEZEL, R = C.CLUB_TABLET_RADIUS, s = new Surface(W, H);
    vgrad(s, [0, 0, W, H], C.CLUB_COL_TABLET_TOP, C.CLUB_COL_TABLET_BOTTOM, toneLit);
    for (const r of [[0, 0, W, b], [0, H - b, W, b], [0, 0, b, H], [W - b, 0, b, H]]) s.fill(C.CLUB_COL_BEZEL, r);
    this._corner(s, C.CLUB_COL_BEZEL, b, b, 1, 1, R); this._corner(s, C.CLUB_COL_BEZEL, W - b - 1, b, -1, 1, R);
    this._corner(s, C.CLUB_COL_BEZEL, b, H - b - 1, 1, -1, R); this._corner(s, C.CLUB_COL_BEZEL, W - b - 1, H - b - 1, -1, -1, R);
    draw.circle(s, [44, 42, 52], [Math.floor(W / 2), Math.floor(b / 2)], 2);
    return s;
  }
  _make_rehearsal() {
    const ts = this.ts, base = ts.bg_lit.copy();
    ts.lamps.forEach((lamp, i) => { const [img, off] = ts._lamp_image(i, true, Math.round((lamp.cfg.home_deg || 0) * 2)); base.blit(img, [Math.round(lamp.anchor[0] + off[0]), Math.round(lamp.anchor[1] + off[1])]); });
    const s = this.tone_surface(base, 0.6, 0.34, [0.92, 0.96, 1.14]);
    const X0 = C.TITLE_STAGE_X0, X1 = C.TITLE_STAGE_X1, r = new Rect(X0 - 18, 14, X1 - X0 + 36, C.TITLE_FLOOR_Y - 14);
    const stage = new Surface(r.w, r.h); stage.blit(ts.bg_lit, [0, 0], r);
    const v = 255 * C.CLUB_REHEARSAL_STAGE_BRIGHTNESS; stage.fill([Math.trunc(v * 0.94), Math.trunc(v * 0.97), Math.trunc(v)], null, "mult");
    s.blit(stage, r.topleft);
    ts.band.draw(s, ts.band.members.map((m) => this.tone_surface(m.sprite, 0.9, 0.72)), 0);
    const bx = Math.floor(W / 2), by = C.TITLE_STAGE_TOP + 40;
    draw.line(s, [20, 16, 22], [bx, C.TITLE_STAGE_TOP], [bx, by - 6], 2);
    addGlow(s, radialGlow(150, [66, 62, 54], 1.6), bx, by + 46); addGlow(s, radialGlow(28, [200, 190, 160]), bx, by);
    draw.circle(s, [255, 250, 230], [bx, by], 5);
    this._neon_on(s);
    return s;
  }
  _make_soundcheck() {
    const s = new Surface(W, H), fy = 322;
    vgrad(s, [0, 0, W, fy], [22, 5, 12], [50, 11, 25], toneLit); vgrad(s, [0, fy, W, H - fy], [74, 32, 32], [40, 15, 18], toneLit);
    for (let i = -14; i < 15; i++) draw.line(s, [48, 19, 21], [Math.trunc(W / 2 + i * 34), fy], [Math.trunc(W / 2 + i * 96), H], 1);
    s.fill([30, 8, 14], [0, fy - 3, W, 3]);
    addGlow(s, transform.smoothscale(radialGlow(48, [40, 16, 22], 1.5), [620, 240]), W / 2, fy + 40);
    const dk = scaleCol(C.TITLE_COL_CURTAIN_DARK, 0.42), lt = scaleCol(C.TITLE_COL_CURTAIN_LIGHT, 0.42);
    this._folds(s, [0, 0, 74, H], 25, dk, lt); this._folds(s, [W - 44, 0, 44, H], 25, dk, lt, 9);
    for (const [x, w] of [[74, 10], [W - 54, 10]]) this.shade_rect(s, [x, 0, w, H], [0, 0, 0, 70]);
    const sil = C.TITLE_COL_SILHOUETTE, hl = [120, 44, 70], mx = 122, baseY = 350;
    draw.ellipse(s, sil, [mx - 22, baseY - 5, 44, 11]); s.fill(sil, [mx - 2, 150, 4, baseY - 150]); s.fill(sil, [mx - 5, 146, 10, 6]);
    draw.ellipse(s, sil, [mx - 10, 116, 20, 32]); for (const gy of [124, 130, 136]) draw.line(s, hl, [mx - 6, gy], [mx + 6, gy], 1);
    draw.polygon(s, sil, [[136, 452], [150, 408], [222, 408], [236, 452]]); draw.polygon(s, [34, 12, 20], [[150, 446], [160, 414], [212, 414], [222, 446]], 2);
    draw.circle(s, [34, 12, 20], [186, 431], 11, 2);
    draw.lines(s, sil, false, [[mx, baseY], [132, 372], [150, 384], [170, 398], [168, 408]], 2);
    paintVignette(s, 0.62);
    return s;
  }
  _make_table() {
    const ts = this.ts, s = new Surface(W, H); s.fill([20, 5, 11]);
    draw.ellipse(s, C.CLUB_COL_CLOTH_DARK, [-96, -74, W + 192, H + 196]); draw.ellipse(s, C.CLUB_COL_CLOTH, [-84, -64, W + 168, H + 174]);
    addGlow(s, transform.smoothscale(radialGlow(48, [44, 16, 24], 1.4), [780, 460]), W / 2, H / 2 - 20);
    const cx = 34, cy = 296;
    addGlow(s, radialGlow(64, [118, 74, 42]), cx, cy);
    draw.circle(s, [238, 206, 214], [cx, cy], 15); draw.circle(s, [132, 44, 64], [cx, cy], 11); draw.circle(s, [255, 214, 120], [cx, cy], 5); draw.circle(s, [255, 250, 226], [cx, cy], 2);
    const ux = 768, uy = 300;
    draw.circle(s, [92, 16, 38], [ux + 2, uy + 3], 22); draw.circle(s, [244, 226, 232], [ux, uy], 21); draw.circle(s, [214, 190, 198], [ux, uy], 21, 1);
    draw.rect(s, [244, 226, 232], [ux - 4, uy - 31, 8, 14], 0, 3); draw.circle(s, [250, 240, 242], [ux, uy], 14); draw.circle(s, [70, 30, 24], [ux, uy], 11);
    paintVignette(s, 0.66);
    return s;
  }
  _make_curtain() {
    const s = new Surface(W, H);
    this._folds(s, [0, 0, W, H], 33, scaleCol(C.TITLE_COL_CURTAIN_DARK, 0.52), scaleCol(C.TITLE_COL_CURTAIN_LIGHT, 0.6));
    for (let i = 0; i < H; i++) { const v = i / (H - 1), a = 150 * Math.pow(Math.max(0, 1 - v / 0.4), 1.5) + 90 * Math.max(0, (v - 0.74) / 0.26); s.x.fillStyle = `rgba(10,0,6,${Math.min(255, Math.trunc(a)) / 255})`; s.x.fillRect(0, i, W, 1); }
    s.fill([150, 108, 52], [0, H - 20, W, 3]); for (let x = 2; x < W; x += 6) s.fill([122, 86, 40], [x, H - 17, 2, 11]); s.fill([8, 2, 5], [0, H - 6, W, 6]);
    paintVignette(s, 0.6);
    return s;
  }
  _make_board() {
    const rng = new Rng(77), s = new Surface(W, H);
    vgrad(s, [0, 0, W, H], [40, 9, 21], [70, 14, 33], toneLit);
    const fr = new Rect(24, 4, W - 48, 398);
    draw.rect(s, [16, 4, 9], fr.move(4, 5), 0, 6); draw.rect(s, [112, 68, 40], fr, 0, 6); draw.rect(s, [150, 98, 60], fr, 2, 6);
    const br = fr.inflate(-22, -22);
    vgrad(s, br.arr(), C.CLUB_COL_BOARD_TOP, C.CLUB_COL_BOARD_BOTTOM, toneLit);
    const smudge = new Surface(br.w, br.h, { alpha: true });
    for (let i = 0; i < 36; i++) { const w = rng.randint(60, 220), h = rng.randint(14, 46); draw.ellipse(smudge, [255, 255, 255, rng.randint(4, 9)], [rng.randrange(br.w) - Math.floor(w / 2), rng.randrange(br.h) - Math.floor(h / 2), w, h]); }
    s.blit(smudge, br.topleft); draw.rect(s, [70, 40, 24], br, 2);
    const chalk = (x0, y0, x1, y1, col) => {
      const n = Math.max(2, Math.trunc(Math.hypot(x1 - x0, y1 - y0) / 14)), pts = [];
      for (let i = 0; i <= n; i++) pts.push([Math.trunc(x0 + (x1 - x0) * i / n + rng.uniform(-1, 1)), Math.trunc(y0 + (y1 - y0) * i / n + rng.uniform(-1, 1))]);
      draw.lines(s, col, false, pts, 2);
    };
    const c = C.CLUB_COL_CHALK, ir = br.inflate(-18, -18);
    chalk(ir.left + 14, ir.top, ir.right - 14, ir.top, c); chalk(ir.left + 14, ir.bottom, ir.right - 14, ir.bottom, c);
    chalk(ir.left, ir.top + 14, ir.left, ir.bottom - 14, c); chalk(ir.right, ir.top + 14, ir.right, ir.bottom - 14, c);
    for (const [qx, qy, sx, sy] of [[ir.left, ir.top, 1, 1], [ir.right, ir.top, -1, 1], [ir.left, ir.bottom, 1, -1], [ir.right, ir.bottom, -1, -1]]) chalk(qx + sx * 14, qy, qx, qy + sy * 14, C.CLUB_COL_CHALK_PINK);
    for (const [nx, ny, col] of [[ir.right - 58, ir.top + 46, C.CLUB_COL_CHALK_YELLOW], [ir.right - 40, ir.bottom - 40, C.CLUB_COL_CHALK_PINK]]) {
      draw.ellipse(s, col, [nx - 7, ny, 11, 8]); draw.ellipse(s, col, [nx + 11, ny - 4, 11, 8]);
      draw.line(s, col, [nx + 3, ny + 3], [nx + 3, ny - 24], 2); draw.line(s, col, [nx + 21, ny - 1], [nx + 21, ny - 28], 2); draw.line(s, col, [nx + 3, ny - 24], [nx + 21, ny - 28], 3);
    }
    s.fill([92, 54, 32], [fr.left + 60, fr.bottom - 3, fr.w - 120, 7]);
    for (const [tx, col] of [[fr.left + 110, C.CLUB_COL_CHALK], [fr.left + 150, C.CLUB_COL_CHALK_YELLOW], [fr.right - 170, C.CLUB_COL_CHALK_PINK]]) draw.rect(s, col, [tx, fr.bottom - 7, 22, 5], 0, 2);
    return s;
  }
  _make_mixer() {
    const s = new Surface(W, H);
    vgrad(s, [0, 0, W, H], [22, 7, 14], [44, 10, 24], toneLit);
    addGlow(s, transform.smoothscale(radialGlow(48, [40, 14, 24], 1.5), [760, 240]), W / 2, 40);
    const body = new Rect(72, 60, W - 144, 356);
    draw.rect(s, [10, 3, 6], body.move(4, 6), 0, 12); draw.rect(s, C.CLUB_COL_METAL, body, 0, 12);
    draw.rect(s, scaleCol(C.CLUB_COL_METAL, 1.22), [body.x + 4, body.y + 4, body.w - 8, 5], 0, 3); draw.rect(s, C.CLUB_COL_METAL_EDGE, body, 2, 12);
    for (const [sx, sy] of [[body.x + 12, body.y + 12], [body.right - 13, body.y + 12], [body.x + 12, body.bottom - 13], [body.right - 13, body.bottom - 13]]) { draw.circle(s, [150, 144, 160], [sx, sy], 4); draw.line(s, [60, 56, 68], [sx - 2, sy - 2], [sx + 2, sy + 2], 1); }
    const [y0, y1] = C.CLUB_MIXER_TRACK;
    C.CLUB_MIXER_CX.forEach((cx, i) => {
      if (i > 0) { const mid = Math.floor((C.CLUB_MIXER_CX[i - 1] + cx) / 2); s.fill([28, 25, 33], [mid, body.y + 14, 1, body.h - 28]); s.fill([60, 55, 70], [mid + 1, body.y + 14, 1, body.h - 28]); }
      draw.rect(s, [8, 7, 10], [cx - 4, y0 - 6, 8, y1 - y0 + 12], 0, 4); draw.rect(s, [74, 68, 84], [cx - 4, y0 - 6, 8, y1 - y0 + 12], 1, 4);
      for (let k = 0; k < 11; k++) { const yy = Math.trunc(y1 - (y1 - y0) * k / 10), wdt = k % 5 === 0 ? 9 : 5; s.fill([128, 120, 140], [cx - 13 - wdt, yy, wdt, 1]); s.fill([128, 120, 140], [cx + 13, yy, wdt, 1]); }
    });
    this.text_c(s, this.F.g_xs, "TMC  MIXING  CONSOLE", [110, 102, 122], body.right - 96, body.bottom - 22);
    paintVignette(s, 0.7);
    return s;
  }
  _play_base(src, tutorial) {
    const s = this.tone_surface(src, C.CLUB_PLAY_BG_SATURATION, C.CLUB_PLAY_BG_BRIGHTNESS);
    if (C.CLUB_PLAY_LANE_SHADE > 0) {
      const layer = new Surface(W, H, { alpha: true }), top = C.laneHalf(C.VANISHING_Y) + 6, bot = C.laneHalf(H) + 10;
      draw.polygon(layer, [0, 0, 0, C.CLUB_PLAY_LANE_SHADE], [[Math.trunc(W / 2 - top), C.VANISHING_Y - 4], [Math.trunc(W / 2 + top), C.VANISHING_Y - 4], [Math.trunc(W / 2 + bot), H], [Math.trunc(W / 2 - bot), H]]);
      s.blit(layer, [0, 0]);
    }
    if (tutorial) this.shade_rect(s, [0, 10, W, 70], [0, 0, 0, 120]); else this.shade_rect(s, [8, 10, 236, 112], [0, 0, 0, 112], 10);
    return s;
  }
  _make_play() { return this._play_base(this.bg("hall"), false); }
  _make_play_rehearsal() { return this._play_base(this.bg("rehearsal"), true); }

  // ---------- メニュー表・伝票 ----------
  paint_book(s) {
    const R = new Rect(C.CLUB_BOOK_RECT), [PL, PR] = bookPages();
    draw.rect(s, [52, 8, 24], R.inflate(12, 12).move(5, 7), 0, 9); draw.rect(s, C.CLUB_COL_COVER, R.inflate(12, 12), 0, 9); draw.rect(s, [214, 164, 116], R.inflate(12, 12), 1, 9);
    s.blit(this.paper(PL.w, PL.h, 11), PL.topleft); s.blit(this.paper(PR.w, PR.h, 23), PR.topleft);
    for (let d = 0; d < 16; d++) { const col = scaleCol(C.CLUB_COL_PAPER, 0.74 + 0.26 * d / 15); s.fill(col, [PL.right - 1 - d, PL.y, 1, PL.h]); s.fill(col, [PR.x + d, PR.y, 1, PR.h]); }
    for (const P of [PL, PR]) draw.rect(s, [214, 176, 172], P.inflate(-14, -14), 1);
    s.fill(C.CLUB_COL_PAPER_EDGE, [PL.x + 2, PL.y, 1, PL.h]); s.fill(C.CLUB_COL_PAPER_EDGE, [PR.right - 3, PR.y, 1, PR.h]);
    return [PL, PR];
  }
  _rule(s, x, y, w) { s.fill([196, 150, 150], [x, y, w, 1]); s.fill([226, 196, 192], [x, y + 3, w, 1]); }
  paint_closed_book(s) {
    const R = new Rect(C.CLUB_BOOK_RECT), half = Math.floor(R.w / 2), Cr = new Rect(R.x + half, R.y - 6, half + 6, R.h + 12), gold = [226, 184, 104];
    draw.rect(s, [52, 8, 24], Cr.move(5, 7), 0, 9); draw.rect(s, [150, 24, 50], Cr, 0, 9); draw.rect(s, [112, 16, 38], [Cr.x, Cr.y, 14, Cr.h], 0, 6);
    draw.rect(s, gold, Cr.inflate(-22, -22), 2, 5); draw.rect(s, gold, Cr.inflate(-32, -32), 1, 3);
    const name = "Tongue Music Club", font = this.F.m_lg.size(name)[0] <= Cr.w - 60 ? this.F.m_lg : this.F.m_md;
    this.text_c(s, font, name, gold, Cr.centerx + 4, Cr.centery - 44);
    s.fill(gold, [Cr.centerx - 56, Cr.centery + 2, 120, 1]);
    this.text_c(s, this.F.m_md, "M E N U", gold, Cr.centerx + 4, Cr.centery + 16);
    return Cr;
  }
  // songs: [{title, end_time, enabled}], norma: [[key, ja, val]]
  paint_menu_spread(s, songs, start, highs, norma, spread) {
    const F = this.F, [PL, PR] = this.paint_book(s), ink = C.CLUB_COL_INK, sub = C.CLUB_COL_INK_SUB;
    s.blit(this.text(F.m_lg, "本日の演目", ink), [PL.x + 22, PL.y + 14]);
    this._rule(s, PL.x + 18, PL.y + 58, PL.w - 40);
    const t = this.text(F.m_sm, "今日のノルマ", C.CLUB_COL_STAMP); s.blit(t, [PR.x + 22, PR.y + 7]);
    // 修正(1.5.4): 絵と数字が隣の枠にはみ出して重ならないよう、1枠に収まる大きさを選ぶ（大きい順に試す）
    const cell = (PR.w - 36) / 5, gap = 2, iy = PR.y + 27, H0 = C.CLUB_NORMA_ICON_SIZE;
    norma.forEach(([key, ja, val], i) => {
      const col = val >= 4 ? [176, 120, 0] : val === 3 ? C.CLUB_COL_STAMP : ink;
      let isz = 0, icon = null, num = null;
      for (const [sz, font] of [[26, F.g_sm], [24, F.g_xs], [20, F.g_xs]]) {
        isz = Math.min(sz, H0); icon = this.small_icon(key, isz);
        num = this.text(font, icon ? `${val}/3` : `${ja}:${val}/3`, col);
        if ((icon ? isz + gap : 0) + num.w <= cell - 6) break;
      }
      let x0 = Math.trunc(PR.x + 18 + cell * i + (cell - (icon ? isz + gap : 0) - num.w) / 2);
      if (icon) { s.blit(icon, [x0, iy + Math.floor((H0 - isz) / 2)]); x0 += isz + gap; }
      s.blit(num, [x0, iy + Math.floor(H0 / 2) - Math.floor(num.h / 2)]);
    });
    this._rule(s, PR.x + 22, PR.y + 59, PR.w - 40);
    menuSongRects().forEach((r, slot) => {
      const idx = start + slot; if (idx >= songs.length) return;
      const song = songs[idx], en = song.enabled !== false, col = en ? ink : C.CLUB_COL_INK_OFF, sec = Math.trunc((song.end_time || 0) / 1000);
      const left = `${idx + 1}. ${song.title}`, font = F.m_md.size(left)[0] <= r.w - 90 ? F.m_md : F.m_sm;
      this.leader_line(s, font, left, `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`, r.x + 10, r.y + 8, r.w - 20, col);
      const high = highs[slot] || 0;
      s.blit(this.text(F.m_sm, high > 0 ? `最高記録  ${high.toLocaleString("en-US")} 点` : "― まだ演奏していません ―", en ? sub : C.CLUB_COL_INK_OFF), [r.x + 34, r.y + 40]);
      if (slot % C.CLUB_MENU_PER_PAGE !== C.CLUB_MENU_PER_PAGE - 1) s.fill([226, 196, 192], [r.x + 10, r.bottom + 2, r.w - 20, 1]);
      if (!en) { const st = this.stamp("準備中", F.m_md); s.blit(st, [r.right - st.w - 34, r.centery - Math.floor(st.h / 2)]); }
    });
    s.blit(this.text(F.m_xs, `- ${spread * 2 + 1} -`, sub), [PL.x + 14, PL.bottom - 22]);
    const t2 = this.text(F.m_xs, `- ${spread * 2 + 2} -`, sub); s.blit(t2, [PR.right - 14 - t2.w, PR.bottom - 22]);
  }
  // rows: [[難易度名, 選べるか, ハイスコア, 前回, 色]]
  paint_menu_song(s, song, rows) {
    const F = this.F, [PL, PR] = this.paint_book(s), ink = C.CLUB_COL_INK, sub = C.CLUB_COL_INK_SUB;
    this.text_c(s, F.m_sm, "― 本日の一曲 ―", sub, PL.centerx, PL.y + 30);
    const title = song.title, font = F.m_lg.size(title)[0] <= PL.w - 48 ? F.m_lg : F.m_md;
    this.text_c(s, font, title, ink, PL.centerx, PL.y + 84);
    this._rule(s, PL.centerx - 70, PL.y + 136, 140);
    const sec = Math.trunc((song.end_time || 0) / 1000);
    this.text_c(s, F.m_md, `演奏時間  ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`, ink, PL.centerx, PL.y + 154);
    const nx = PL.centerx - 12, ny = PL.y + 232, col = C.CLUB_COL_STAMP;
    draw.ellipse(s, col, [nx - 12, ny, 17, 12]); draw.ellipse(s, col, [nx + 18, ny - 6, 17, 12]);
    draw.line(s, col, [nx + 3, ny + 5], [nx + 3, ny - 36], 3); draw.line(s, col, [nx + 33, ny - 1], [nx + 33, ny - 42], 3); draw.line(s, col, [nx + 3, ny - 36], [nx + 33, ny - 42], 5);
    this.text_c(s, F.m_sm, "右のページから コースをお選びください", sub, PL.centerx, PL.bottom - 40);
    s.blit(this.text(F.m_lg, "コース", ink), [PR.x + 22, PR.y + 14]);
    const t = this.text(F.m_sm, "― お好みの難しさで ―", sub); s.blit(t, [PR.right - 26 - t.w, PR.y + 30]);
    this._rule(s, PR.x + 22, PR.y + 58, PR.w - 40);
    const rects = menuDiffRects();
    rows.forEach(([name, en, high, last, colr], i) => {
      const r = rects[i], c = en ? colr : C.CLUB_COL_INK_OFF;
      this.leader_line(s, F.m_md, name, `HIGH: ${high.toLocaleString("en-US")}`, r.x + 14, r.y + 8, r.w - 28, c, en ? ink : C.CLUB_COL_INK_OFF);
      const tt = this.text(F.m_sm, `前回: ${last.toLocaleString("en-US")}`, en ? sub : C.CLUB_COL_INK_OFF); s.blit(tt, [r.right - 14 - tt.w, r.y + 40]);
      if (i !== rows.length - 1) s.fill([226, 196, 192], [r.x + 10, r.bottom + 2, r.w - 20, 1]);
      if (!en) { const st = this.stamp("準備中", F.m_md); s.blit(st, [r.x + 96, r.centery - Math.floor(st.h / 2) + 6]); }
    });
  }
  receipt_image(dateText, player, songLine, score, high, prev, stageLevel = 0) {
    const F = this.F, [, , w, h] = C.CLUB_RECEIPT_RECT, s = new Surface(w, h, { alpha: true });
    s.blit(this.paper(w, h, 5, [252, 250, 244]), [0, 0]);
    for (let x = 0; x < w; x += 12) { s.x.save(); s.x.globalCompositeOperation = "destination-out"; s.x.beginPath(); s.x.moveTo(x, h); s.x.lineTo(x + 6, h - 8); s.x.lineTo(x + 12, h); s.x.closePath(); s.x.fill(); s.x.restore(); }
    draw.line(s, [214, 206, 198], [0, 0], [0, h - 8], 1); draw.line(s, [214, 206, 198], [w - 1, 0], [w - 1, h - 8], 1);
    const ink = [40, 30, 34], sub = [120, 104, 108];
    const dash = (y) => { for (let x = 16; x < w - 16; x += 8) s.fill([150, 136, 138], [x, y, 4, 1]); };
    const shop = "Tongue Music Club";
    this.text_c(s, F.m_lg.size(shop)[0] <= w - 24 ? F.m_lg : F.m_md, shop, ink, Math.floor(w / 2), 18);
    this.text_c(s, F.m_sm, "― 出演料 明細書 ―", ink, Math.floor(w / 2), 54);
    dash(80);
    s.blit(this.text(F.m_sm, dateText, ink), [18, 90]);
    this.leader_line(s, F.m_sm, "出演者", player, 18, 114, w - 36, ink);
    s.blit(this.text(F.m_sm, "演目", sub), [18, 140]);
    const f = F.m_md.size(songLine)[0] > w - 36 ? F.m_sm : F.m_md, t = this.text(f, songLine, ink); s.blit(t, [w - 18 - t.w, 160]);
    dash(196);
    s.blit(this.text(F.m_md, "出演料", ink), [18, 206]);
    const fee = `￥${score.toLocaleString("en-US")}`, num = (F.m_xl.size(fee)[0] <= w - 36 ? F.m_xl : F.m_lg).render(fee, true, ink);
    s.blit(num, [w - 18 - num.w, 226]);
    const nLv = C.STAGE_LEVEL_SCORES.length;
    if (stageLevel > 0) {
      s.blit(this.text(F.m_sm, "本日のステージ", ink), [18, 288]);
      const starCol = stageLevel >= nLv ? [212, 160, 30] : ink;
      for (let i = 0; i < nLv; i++) {
        const cx = w - 18 - (nLv - i) * 19 + 9, cy = 297, pts = [];
        for (let k = 0; k < 10; k++) { const r = k % 2 === 0 ? 8.5 : 3.6, a = -Math.PI / 2 + k * Math.PI / 5; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        if (i < stageLevel) draw.polygon(s, starCol, pts);
        draw.polygon(s, i < stageLevel ? starCol : [176, 164, 166], pts, 1);
      }
    }
    dash(312);
    this.leader_line(s, F.m_sm, "当店最高額", `￥${high.toLocaleString("en-US")}`, 18, 320, w - 36, ink);
    this.leader_line(s, F.m_sm, "前回", `￥${prev.toLocaleString("en-US")}`, 18, 342, w - 36, ink);
    dash(366);
    this.text_c(s, F.m_sm, "またのご出演をお待ちしております", sub, Math.floor(w / 2), 373);
    return s;
  }
}

// =====================================================
// 画面の切り替え（移動演出）
// =====================================================
function fitRect(rect) {
  let [x, y, w, h] = rect.map(Number); const cx = x + w / 2, cy = y + h / 2;
  if (w * H < h * W) w = h * W / H; else h = w * H / W;
  w = Math.min(W, Math.max(32, w)); h = Math.min(H, Math.max(20, h));
  return [Math.max(0, Math.min(W - w, cx - w / 2)), Math.max(0, Math.min(H - h, cy - h / 2)), w, h];
}
export class TransitionManager {
  constructor() {
    this.from_surf = new Surface(W, H); this.to_surf = new Surface(W, H);
    this.active = false; this.kind = "fade"; this.target = null; this.on_done = null; this.focus = [0, 0, W, H]; this.p = 1; this.sec = 0.5; this.to_ready = false;
  }
  start(kind, target, onDone = null, focus = null) {
    const base = kind.split("_")[0];
    this.kind = kind; this.target = target; this.on_done = onDone;
    this.sec = Math.max(0.05, C.CLUB_TRANS_SEC[base] ?? 0.6);
    focus = focus || [W * 0.3, H * 0.3, W * 0.4, H * 0.4];
    this.focus = base === "zoom" ? fitRect(focus) : focus.map((v) => Math.trunc(v));
    this.p = 0; this.to_ready = false; this.active = true;
  }
  skip() { if (this.active) this.p = 1; }
  update(dt) { this.p = Math.min(1, this.p + Math.max(0, Math.min(dt, 0.05)) / this.sec); return this.p >= 1; }
  finish() { this.active = false; const cb = this.on_done; this.on_done = null; return [this.target, cb]; }
  _view(e) {
    const [fx, fy, fw, fh] = this.focus;
    const w = Math.max(8, Math.trunc(W + (fw - W) * e)), h = Math.max(8, Math.trunc(H + (fh - H) * e));
    return [Math.max(0, Math.min(W - w, Math.trunc(fx * e))), Math.max(0, Math.min(H - h, Math.trunc(fy * e))), w, h];
  }
  _scaled(screen, src, view) { const [x, y, w, h] = view, r = src.r; screen.x.drawImage(src.c, x * r, y * r, w * r, h * r, 0, 0, W, H); }
  draw(screen) {
    const p = this.p, kind = this.kind, base = kind.split("_")[0];
    if (base === "pan") {
      const e = C.ease(p), dx = { pan_right: -1, pan_left: 1 }[kind] || 0, dy = { pan_down: -1, pan_up: 1 }[kind] || 0;
      const ox = Math.trunc(dx * W * e), oy = Math.trunc(dy * H * e);
      screen.blit(this.from_surf, [ox, oy]); screen.blit(this.to_surf, [ox - dx * W, oy - dy * H]);
    } else if (kind === "zoom_in") {
      this._scaled(screen, this.from_surf, this._view(C.ease(p)));
      const a = (p - C.CLUB_ZOOM_FADE_START) / Math.max(0.05, 1 - C.CLUB_ZOOM_FADE_START);
      if (a > 0.01) screen.blit(this.to_surf, [0, 0], null, null, Math.min(1, a));
    } else if (kind === "zoom_out") {
      this._scaled(screen, this.to_surf, this._view(1 - C.ease(p)));
      const a = 1 - p / Math.max(0.05, 1 - C.CLUB_ZOOM_FADE_START);
      if (a > 0.01) screen.blit(this.from_surf, [0, 0], null, null, Math.min(1, a));
    } else if (kind === "curtain_down") {
      screen.blit(this.from_surf, [0, 0]); screen.blit(this.to_surf, [0, Math.trunc(-H + H * C.easeOut(p))]);
    } else if (base === "page") this._draw_page(screen, kind === "page_fwd");
    else { screen.blit(this.from_surf, [0, 0]); if (p > 0.01) screen.blit(this.to_surf, [0, 0], null, null, Math.min(1, p)); }
  }
  _draw_page(screen, fwd) {
    const [bx, by, bw, bh] = this.focus, half = Math.floor(bw / 2), spine = bx + half;
    const left = new Rect(bx, by, half, bh), right = new Rect(spine, by, bw - half, bh);
    const p = C.ease(this.p), first = p < 0.5, k = first ? 1 - p * 2 : (p - 0.5) * 2;
    screen.blit(first ? this.from_surf : this.to_surf, [0, 0]);
    let under, keep, turnSrc, turn;
    if (fwd) { under = [this.to_surf, right]; keep = [this.from_surf, left]; [turnSrc, turn] = first ? [this.from_surf, right] : [this.to_surf, left]; }
    else { under = [this.to_surf, left]; keep = [this.from_surf, right]; [turnSrc, turn] = first ? [this.from_surf, left] : [this.to_surf, right]; }
    screen.blit(under[0], under[1].topleft, under[1]); screen.blit(keep[0], keep[1].topleft, keep[1]);
    const w = Math.trunc(turn.w * k);
    if (w >= 2) {
      const onRight = turn.x >= spine, x = onRight ? spine : spine - w, r = turnSrc.r, ctx = screen.x;
      ctx.drawImage(turnSrc.c, turn.x * r, turn.y * r, turn.w * r, turn.h * r, x, by, w, bh);
      const shade = 0.62 + 0.38 * k;   // 立ち上がったページは少し暗く見える
      ctx.save(); ctx.fillStyle = `rgba(0,0,0,${1 - shade})`; ctx.fillRect(x, by, w, bh); ctx.restore();
      const ex = onRight ? x + w - 1 : x;
      draw.line(screen, [70, 40, 44], [ex, by], [ex, by + bh - 1], 2);
    }
  }
}
