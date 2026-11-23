// 画面の描画まわり：内部座標 800×480 の Canvas を、縦横比を保って画面いっぱいに拡大縮小する
export const W = 800, H = 480;
export const COL = {
  bg: "#111111", teal: "#4ECDC4", yellow: "#F1C40F", red: "#E74C3C", green: "#2ECC71",
  white: "#FFFFFF", gray: "#808080", dark: "#23232D", purple: "#9B59B6", gold: "#FFD700",
};
export const FS = { sm: 16, md: 24, lg: 32, xl: 48 };
const FAMILY = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","YuGothic",Meiryo,sans-serif';
export const font = (size) => `bold ${size}px ${FAMILY}`;
export const rgb = (r, g, b) => `rgb(${r},${g},${b})`;

export class Screen {
  constructor(canvas, wrap) {
    this.cv = canvas; this.wrap = wrap;
    this.ctx = canvas.getContext("2d");
    this.scale = 1; this.buttons = []; this.prevButtons = [];
    this.images = {};
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 300));
  }
  resize() {
    const cs = getComputedStyle(this.wrap);
    const pw = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const ph = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const aw = Math.max(1, this.wrap.clientWidth - pw), ah = Math.max(1, this.wrap.clientHeight - ph);
    this.scale = Math.min(aw / W, ah / H);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cv.style.width = Math.round(W * this.scale) + "px";
    this.cv.style.height = Math.round(H * this.scale) + "px";
    this.cv.width = Math.round(W * this.scale * dpr);
    this.cv.height = Math.round(H * this.scale * dpr);
    this.dpr = dpr;
    if (this.onResize) this.onResize();
  }
  begin() {
    const c = this.ctx;
    c.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);
    c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
    this.prevButtons = this.buttons; this.buttons = [];
  }
  // 画面上の座標 → 内部座標
  toLocal(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    return [(clientX - r.left) / this.scale, (clientY - r.top) / this.scale];
  }
  hit(x, y) {
    for (let i = this.prevButtons.length - 1; i >= 0; i--) {
      const b = this.prevButtons[i];
      const pad = b.pad || 0;
      if (!b.disabled && x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
    }
    return null;
  }

  // ---- 描画の部品 ----
  text(s, x, y, size = FS.sm, color = COL.white, align = "left", maxW = 0) {
    const c = this.ctx;
    let sz = size;
    c.font = font(sz);
    if (maxW > 0) { while (sz > 10 && c.measureText(s).width > maxW) { sz -= 1; c.font = font(sz); } }
    c.fillStyle = color; c.textAlign = align; c.textBaseline = "top";
    c.fillText(s, x, y);
    return c.measureText(s).width;
  }
  textC(s, y, size = FS.sm, color = COL.white, maxW = W - 40) { return this.text(s, W / 2, y, size, color, "center", maxW); }
  measure(s, size) { this.ctx.font = font(size); return this.ctx.measureText(s).width; }
  // 色を変えながら1行に並べる（中央寄せ）
  segments(segs, y, size) {
    const total = segs.reduce((a, [t]) => a + this.measure(t, size), 0);
    let x = W / 2 - total / 2;
    for (const [t, col] of segs) { x += this.text(t, x, y, size, col); }
  }
  rrect(x, y, w, h, r, fill = null, stroke = null, lw = 2) {
    const c = this.ctx;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  rect(x, y, w, h, fill) { this.ctx.fillStyle = fill; this.ctx.fillRect(x, y, w, h); }
  // ボタン（押せる範囲を登録）
  button(x, y, w, h, label, onTap, opt = {}) {
    const bg = opt.disabled ? "#3a3a3a" : (opt.bg || COL.teal);
    const fg = opt.disabled ? "#777" : (opt.fg || COL.bg);
    this.rrect(x, y, w, h, opt.r ?? 8, bg, opt.border || null, 2);
    const size = opt.size || FS.md;
    if (opt.sub) {
      this.text(label, x + w / 2, y + h / 2 - size + 2, size, fg, "center", w - 12);
      this.text(opt.sub, x + w / 2, y + h / 2 + 6, FS.sm, opt.subColor || fg, "center", w - 12);
    } else {
      this.text(label, x + w / 2, y + h / 2 - size * 0.62, size, fg, "center", w - 12);
    }
    this.buttons.push({ x, y, w, h, onTap, disabled: !!opt.disabled, pad: opt.pad || 0 });
  }
  // 見た目なしの押せる範囲
  hotspot(x, y, w, h, onTap) { this.buttons.push({ x, y, w, h, onTap }); }
  img(name, x, y, w, h) {
    const im = this.images[name];
    if (im && im.complete && im.naturalWidth) this.ctx.drawImage(im, x, y, w, h);
  }
  imgC(name, cx, cy, w, h) { this.img(name, cx - w / 2, cy - h / 2, w, h); }
  poly(pts, fill, stroke = null, lw = 2) {
    const c = this.ctx; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  line(x1, y1, x2, y2, color, lw = 2) {
    const c = this.ctx; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = lw; c.stroke();
  }
  circle(x, y, r, fill = null, stroke = null, lw = 2) {
    const c = this.ctx; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  // 鏡のように左右反転して映像を描く
  video(v, x, y, w, h) {
    if (!v || !v.videoWidth) { this.rect(x, y, w, h, "#282828"); return; }
    const c = this.ctx;
    // 枠の縦横比に合わせて中央を切り出す
    const vr = v.videoWidth / v.videoHeight, r = w / h;
    let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
    if (vr > r) { sw = sh * r; sx = (v.videoWidth - sw) / 2; } else { sh = sw / r; sy = (v.videoHeight - sh) / 2; }
    c.save(); c.translate(x + w, y); c.scale(-1, 1); c.drawImage(v, sx, sy, sw, sh, 0, 0, w, h); c.restore();
    return { sx, sy, sw, sh };
  }
}

export async function loadImages(screen, map) {
  await Promise.all(Object.entries(map).map(([k, src]) => new Promise((res) => {
    const im = new Image(); im.onload = () => res(); im.onerror = () => res(); im.src = src; screen.images[k] = im;
  })));
}
