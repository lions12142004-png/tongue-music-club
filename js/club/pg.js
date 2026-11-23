// =====================================================
// pg.js — PC版（pygame）の描き方を Canvas で再現する小さな部品集
//   PC版 1122_2 の演出コード（タイトル・店内・観客・ステージ）を、ほぼ同じ書き方で移すために使う。
//   座標はすべて 800×480 の論理座標。Surface は内部で RES 倍の解像度の canvas を持つ（スマホの高精細画面でぼけないように）
// =====================================================
export const W = 800, H = 480;
// 背景などの解像度（論理 1px あたりの画素数）。画面の実際の密度に合わせ、最大 2
export let RES = 2;
export function setRes(r) { RES = Math.max(1, Math.min(2, r)); }

export const TAU = Math.PI * 2;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (c1, c2, k) => [Math.trunc(c1[0] + (c2[0] - c1[0]) * k), Math.trunc(c1[1] + (c2[1] - c1[1]) * k), Math.trunc(c1[2] + (c2[2] - c1[2]) * k)];
export const scaleCol = (c, k) => [Math.max(0, Math.min(255, Math.trunc(c[0] * k))), Math.max(0, Math.min(255, Math.trunc(c[1] * k))), Math.max(0, Math.min(255, Math.trunc(c[2] * k)))];
export const css = (c) => (c.length > 3 ? `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` : `rgb(${c[0]},${c[1]},${c[2]})`);
export const ri = (v) => Math.round(v);
export const now = () => performance.now();   // pygame.time.get_ticks() の代わり（ミリ秒）

// 乱数（Python の random.Random(seed) と同じ並びにはならないが、種が同じなら毎回同じ並びになる）
export class Rng {
  constructor(seed = null) { this.s = (seed == null ? (Math.random() * 2 ** 32) : (seed * 2654435761)) >>> 0; if (!this.s) this.s = 1; }
  random() { let t = (this.s += 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  uniform(a, b) { return a + (b - a) * this.random(); }
  randint(a, b) { return a + Math.floor(this.random() * (b - a + 1)); }
  randrange(a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.floor(this.random() * (b - a)); }
  choice(arr) { return arr[Math.floor(this.random() * arr.length)]; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ---------- Rect（pygame.Rect の必要な分だけ） ----------
export class Rect {
  constructor(x, y, w, h) {
    if (Array.isArray(x)) [x, y, w, h] = x;
    else if (x instanceof Rect) ({ x, y, w, h } = x);
    this.x = x; this.y = y; this.w = w; this.h = h;
  }
  get left() { return this.x; } get top() { return this.y; } get width() { return this.w; } get height() { return this.h; }
  get right() { return this.x + this.w; } get bottom() { return this.y + this.h; }
  get centerx() { return this.x + Math.trunc(this.w / 2); } get centery() { return this.y + Math.trunc(this.h / 2); }
  get center() { return [this.centerx, this.centery]; }
  set center([cx, cy]) { this.x = cx - Math.trunc(this.w / 2); this.y = cy - Math.trunc(this.h / 2); }
  get topleft() { return [this.x, this.y]; } get size() { return [this.w, this.h]; }
  collidepoint(p, py) { const [x, y] = py === undefined ? p : [p, py]; return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h; }
  inflate(dw, dh) { return new Rect(this.x - Math.trunc(dw / 2), this.y - Math.trunc(dh / 2), this.w + dw, this.h + dh); }
  move(dx, dy) { return new Rect(this.x + dx, this.y + dy, this.w, this.h); }
  copy() { return new Rect(this.x, this.y, this.w, this.h); }
  arr() { return [this.x, this.y, this.w, this.h]; }
}
const R4 = (r) => (r instanceof Rect ? r.arr() : r);

// ---------- Surface ----------
//   alpha=false は pygame の普通の Surface（不透明。作った直後は黒）。alpha=true は SRCALPHA（透明）
export class Surface {
  constructor(w, h, { alpha = false, res = RES } = {}) {
    this.w = Math.max(1, Math.round(w)); this.h = Math.max(1, Math.round(h)); this.r = res; this.hasAlpha = alpha;
    this.c = mkCanvas(this.w * res, this.h * res);
    this.x = this.c.getContext("2d");
    this.x.setTransform(res, 0, 0, res, 0, 0);
    this.x.imageSmoothingEnabled = true; this.x.imageSmoothingQuality = "high";
    if (!alpha) { this.x.fillStyle = "#000"; this.x.fillRect(0, 0, this.w, this.h); }
    this.alpha = 1;
  }
  get_width() { return this.w; } get_height() { return this.h; } get_size() { return [this.w, this.h]; }
  get_rect() { return new Rect(0, 0, this.w, this.h); }
  set_alpha(a) { this.alpha = a == null ? 1 : Math.max(0, Math.min(1, a / 255)); }
  // 塗る。flag: "add"（加算）/ "mult"（掛け算）。alpha のある色を SRCALPHA に塗るときは pygame と同じく置き換える
  fill(col, rect = null, flag = null) {
    const x = this.x, r = rect ? R4(rect) : [0, 0, this.w, this.h];
    if (flag === "mult") { mulRect(this, col, r); return; }
    x.save();
    if (flag === "add") x.globalCompositeOperation = "lighter";
    else if (this.hasAlpha) x.clearRect(r[0], r[1], r[2], r[3]);
    x.fillStyle = css(col); x.fillRect(r[0], r[1], r[2], r[3]);
    x.restore();
  }
  // 貼る。area は src の中の範囲（論理座標）。flag: "add" / "mult"。alpha は 0〜1 の不透明度（src.alpha とも掛ける）
  blit(src, pos, area = null, flag = null, alpha = 1) {
    blitTo(this.x, src, pos, area, flag, alpha);
  }
  copy() { const s = new Surface(this.w, this.h, { alpha: this.hasAlpha, res: this.r }); s.x.save(); s.x.setTransform(1, 0, 0, 1, 0, 0); s.x.globalCompositeOperation = "copy"; s.x.drawImage(this.c, 0, 0); s.x.restore(); return s; }
  set_at([px, py], col) { this.x.fillStyle = css(col); this.x.fillRect(px, py, 1, 1); }
  // 範囲だけ切り出した新しい Surface
  subsurface(rect) {
    const [rx, ry, rw, rh] = R4(rect);
    const s = new Surface(rw, rh, { alpha: true, res: this.r });
    s.x.save(); s.x.setTransform(1, 0, 0, 1, 0, 0); s.x.drawImage(this.c, rx * this.r, ry * this.r, rw * this.r, rh * this.r, 0, 0, rw * this.r, rh * this.r); s.x.restore();
    return s;
  }
}

// 画面（メインの canvas の context）も Surface と同じように扱う
export class ScreenSurf {
  constructor(ctx) { this.x = ctx; this.w = W; this.h = H; this.alpha = 1; this.hasAlpha = false; }
  get_width() { return W; } get_height() { return H; } get_size() { return [W, H]; }
  fill(col, rect = null, flag = null) {
    const x = this.x, r = rect ? R4(rect) : [0, 0, W, H];
    x.save(); if (flag === "add") x.globalCompositeOperation = "lighter"; else if (flag === "mult") x.globalCompositeOperation = "multiply";
    x.fillStyle = css(col); x.fillRect(r[0], r[1], r[2], r[3]); x.restore();
  }
  blit(src, pos, area = null, flag = null, alpha = 1) { blitTo(this.x, src, pos, area, flag, alpha); }
}

function blitTo(ctx, src, pos, area, flag, alpha) {
  const a = alpha * (src.alpha ?? 1);
  if (a <= 0.003) return;
  const img = src.c || src;                       // Surface か、ふつうの画像・canvas
  const sr = src.r || 1;
  const sw = src.w || img.naturalWidth || img.width, sh = src.h || img.naturalHeight || img.height;
  ctx.save();
  if (flag === "add") ctx.globalCompositeOperation = "lighter";
  else if (flag === "mult") ctx.globalCompositeOperation = "multiply";
  if (a < 1) ctx.globalAlpha = a;
  if (area) {
    const [ax, ay, aw, ah] = R4(area);
    if (aw > 0 && ah > 0) ctx.drawImage(img, ax * sr, ay * sr, aw * sr, ah * sr, pos[0], pos[1], aw, ah);
  } else ctx.drawImage(img, pos[0], pos[1], sw, sh);
  ctx.restore();
}

// 掛け算（BLEND_RGB_MULT）。不透明な Surface は合成モードで、透明のある Surface は画素で計算する
function mulRect(s, col, r) {
  if (!s.hasAlpha) {
    s.x.save(); s.x.globalCompositeOperation = "multiply"; s.x.fillStyle = css(col.slice(0, 3)); s.x.fillRect(r[0], r[1], r[2], r[3]); s.x.restore();
    return;
  }
  const k = s.r, X = Math.round(r[0] * k), Y = Math.round(r[1] * k), Wd = Math.round(r[2] * k), Hd = Math.round(r[3] * k);
  if (Wd <= 0 || Hd <= 0) return;
  const id = s.x.getImageData(X, Y, Wd, Hd), d = id.data, m = [col[0] / 255, col[1] / 255, col[2] / 255, col.length > 3 ? col[3] / 255 : 1];
  for (let i = 0; i < d.length; i += 4) { d[i] *= m[0]; d[i + 1] *= m[1]; d[i + 2] *= m[2]; d[i + 3] *= m[3]; }
  s.x.putImageData(id, X, Y);
}

// ---------- pygame.draw ----------
function pathRR(x, X, Y, Wd, Hd, rad) {
  rad = Math.max(0, Math.min(rad, Wd / 2, Hd / 2));
  x.beginPath();
  if (rad <= 0) { x.rect(X, Y, Wd, Hd); return; }
  x.moveTo(X + rad, Y); x.arcTo(X + Wd, Y, X + Wd, Y + Hd, rad); x.arcTo(X + Wd, Y + Hd, X, Y + Hd, rad);
  x.arcTo(X, Y + Hd, X, Y, rad); x.arcTo(X, Y, X + Wd, Y, rad); x.closePath();
}
function paintMode(s, col) {   // SRCALPHA に半透明の色で描くときは pygame と同じく置き換えに近づける（重なりが少ない前提で、ふつうに描く）
  s.x.fillStyle = css(col); s.x.strokeStyle = css(col);
}
export const draw = {
  rect(s, col, rect, width = 0, border_radius = 0) {
    const [X, Y, Wd, Hd] = R4(rect); if (Wd <= 0 || Hd <= 0) return;
    const x = s.x; x.save(); paintMode(s, col);
    if (width > 0) { const h = width / 2; x.lineWidth = width; pathRR(x, X + h, Y + h, Wd - width, Hd - width, Math.max(0, border_radius - h)); x.stroke(); }
    else if (border_radius > 0) { pathRR(x, X, Y, Wd, Hd, border_radius); x.fill(); }
    else x.fillRect(X, Y, Wd, Hd);
    x.restore();
  },
  ellipse(s, col, rect, width = 0) {
    const [X, Y, Wd, Hd] = R4(rect); if (Wd <= 0 || Hd <= 0) return;
    const x = s.x; x.save(); paintMode(s, col); x.beginPath();
    if (width > 0) { x.lineWidth = width; x.ellipse(X + Wd / 2, Y + Hd / 2, Math.max(0.1, (Wd - width) / 2), Math.max(0.1, (Hd - width) / 2), 0, 0, TAU); x.stroke(); }
    else { x.ellipse(X + Wd / 2, Y + Hd / 2, Wd / 2, Hd / 2, 0, 0, TAU); x.fill(); }
    x.restore();
  },
  circle(s, col, c, r, width = 0) {
    if (r <= 0) return;
    const x = s.x; x.save(); paintMode(s, col); x.beginPath();
    if (width > 0) { x.lineWidth = width; x.arc(c[0] + 0.5, c[1] + 0.5, Math.max(0.1, r - width / 2), 0, TAU); x.stroke(); }
    else { x.arc(c[0] + 0.5, c[1] + 0.5, r, 0, TAU); x.fill(); }
    x.restore();
  },
  polygon(s, col, pts, width = 0) {
    if (pts.length < 3) { if (pts.length === 2) draw.line(s, col, pts[0], pts[1], Math.max(1, width)); return; }
    const x = s.x; x.save(); paintMode(s, col); x.beginPath();
    const o = width > 0 && width % 2 ? 0.5 : 0;
    x.moveTo(pts[0][0] + o, pts[0][1] + o); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] + o, pts[i][1] + o); x.closePath();
    if (width > 0) { x.lineWidth = width; x.lineJoin = "round"; x.stroke(); } else { x.fill(); }
    x.restore();
  },
  line(s, col, a, b, width = 1) {
    const x = s.x; x.save(); paintMode(s, col); x.lineWidth = Math.max(1, width); x.lineCap = width > 2 ? "round" : "butt";
    const o = width % 2 ? 0.5 : 0;
    x.beginPath(); x.moveTo(a[0] + o, a[1] + o); x.lineTo(b[0] + o, b[1] + o); x.stroke(); x.restore();
  },
  lines(s, col, closed, pts, width = 1) {
    if (pts.length < 2) return;
    const x = s.x; x.save(); paintMode(s, col); x.lineWidth = Math.max(1, width); x.lineJoin = "round";
    const o = width % 2 ? 0.5 : 0;
    x.beginPath(); x.moveTo(pts[0][0] + o, pts[0][1] + o); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] + o, pts[i][1] + o);
    if (closed) x.closePath(); x.stroke(); x.restore();
  },
  arc(s, col, rect, a0, a1, width = 1) {   // pygame.draw.arc：角度はラジアン、反時計回り（画面の上が +）
    const [X, Y, Wd, Hd] = R4(rect);
    const x = s.x; x.save(); paintMode(s, col); x.lineWidth = width; x.beginPath();
    x.ellipse(X + Wd / 2, Y + Hd / 2, Math.max(0.1, (Wd - width) / 2), Math.max(0.1, (Hd - width) / 2), 0, -a1, -a0); x.stroke(); x.restore();
  },
};

// ---------- transform ----------
export const transform = {
  smoothscale(src, size, res = null) {
    const [w, h] = size;
    const s = new Surface(w, h, { alpha: src.hasAlpha !== false, res: res ?? src.r ?? RES });
    if (s.hasAlpha) s.x.clearRect(0, 0, w, h);
    s.x.drawImage(src.c || src, 0, 0, w, h);
    return s;
  },
  // rotozoom：反時計回りに deg 度回し、外枠を広げた新しい Surface（中心がもとの中心）
  rotozoom(src, deg, scale = 1) {
    const a = deg * Math.PI / 180, cw = src.w * scale, ch = src.h * scale;
    const nw = Math.ceil(Math.abs(cw * Math.cos(a)) + Math.abs(ch * Math.sin(a))), nh = Math.ceil(Math.abs(cw * Math.sin(a)) + Math.abs(ch * Math.cos(a)));
    const s = new Surface(nw, nh, { alpha: true, res: src.r || RES });
    s.x.translate(nw / 2, nh / 2); s.x.rotate(-a); s.x.drawImage(src.c, -cw / 2, -ch / 2, cw, ch);
    return s;
  },
  flip(src, fx, fy) {
    const s = new Surface(src.w, src.h, { alpha: true, res: src.r });
    s.x.translate(fx ? src.w : 0, fy ? src.h : 0); s.x.scale(fx ? -1 : 1, fy ? -1 : 1); s.x.drawImage(src.c, 0, 0, src.w, src.h);
    return s;
  },
};

// ---------- 画素の操作（起動時だけ使う） ----------
// tone：彩度 sat・明るさ bright・色味 tint を変えた写し（ClubArt.tone_surface と同じ計算）
export function toneSurface(src, sat, bright, tint = [1, 1, 1]) {
  const s = src.copy();
  const id = s.x.getImageData(0, 0, s.c.width, s.c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], gray = 0.30 * r + 0.59 * g + 0.11 * b;
    d[i] = (gray + (r - gray) * sat) * bright * tint[0];
    d[i + 1] = (gray + (g - gray) * sat) * bright * tint[1];
    d[i + 2] = (gray + (b - gray) * sat) * bright * tint[2];
  }
  s.x.putImageData(id, 0, 0);
  return s;
}
// ぼかし（縮小してから拡大し直す）
export function softBlur(surf, factor) {
  const [w, h] = surf.get_size();
  const small = transform.smoothscale(surf, [Math.max(1, Math.trunc(w / factor)), Math.max(1, Math.trunc(h / factor))], 1);
  return transform.smoothscale(small, [w, h], surf.r);
}
// 中心が明るく外側へ消えていく丸い光（黒地。加算合成用）
export function radialGlow(radius, color, power = 2.0) {
  radius = Math.max(2, Math.trunc(radius));
  const s = new Surface(radius * 2, radius * 2);
  const step = radius <= 48 ? 1 : 2;
  for (let r = radius; r > 0; r -= step) {
    const k = Math.pow(1 - r / radius, power);
    draw.circle(s, scaleCol(color, k), [radius - 0.5, radius - 0.5], r);
  }
  return s;
}
// 透明でない部分を囲む範囲（get_bounding_rect）
export function boundingRect(s) {
  const k = s.r, id = s.x.getImageData(0, 0, s.c.width, s.c.height), d = id.data, Wd = s.c.width, Hd = s.c.height;
  let x0 = Wd, y0 = Hd, x1 = -1, y1 = -1;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) if (d[(y * Wd + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return new Rect(0, 0, 0, 0);
  return new Rect(Math.floor(x0 / k), Math.floor(y0 / k), Math.ceil((x1 + 1) / k) - Math.floor(x0 / k), Math.ceil((y1 + 1) / k) - Math.floor(y0 / k));
}

// ---------- 文字 ----------
export const GOTHIC = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","YuGothic",Meiryo,sans-serif';
export const MINCHO = '"Hiragino Mincho ProN","Hiragino Mincho Pro","YuMincho","Yu Mincho","Noto Serif JP","Noto Serif CJK JP","Source Han Serif JP","MS PMincho",serif';
const measureCtx = mkCanvas(4, 4).getContext("2d");
export class Font {
  constructor(size, { family = GOTHIC, bold = true, italic = false } = {}) {
    this.sizePx = size; this.family = family; this.bold = bold; this.italic = italic;
    this.css = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${family}`;
    measureCtx.font = this.css;
    const m = measureCtx.measureText("Hgあ");
    this.asc = Math.ceil(m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || size * 0.9);
    this.desc = Math.ceil(m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || size * 0.3);
    this.lineH = this.asc + this.desc;
  }
  size(text) { measureCtx.font = this.css; return [Math.ceil(measureCtx.measureText(text).width), this.lineH]; }
  get_height() { return this.lineH; }
  render(text, aa, color) {
    const [w, h] = this.size(text);
    const s = new Surface(Math.max(1, w + 1), Math.max(1, h), { alpha: true });
    s.x.font = this.css; s.x.textBaseline = "alphabetic"; s.x.fillStyle = css(color);
    s.x.fillText(text, 0, this.asc);
    return s;
  }
}

// 画像（HTMLImageElement）→ Surface
export function fromImage(img, res = RES) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = new Surface(w, h, { alpha: true, res: 1 });
  s.x.clearRect(0, 0, w, h); s.x.drawImage(img, 0, 0);
  return s;
}
export function loadImage(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
