// ==========================================
// vision.js — 判定の処理（仕様書 節5）
//   PC版 1105_1 の vision_worker を移植したもの。
//   「同じ画像ならPC版と同じ特徴量が出る」ことを目標に、数値はすべてPC版のまま。
//   前半 = DOMを使わない計算（Node でもテストできる）、後半 = カメラと MediaPipe を動かす VisionEngine。
// ==========================================
import { predictProba } from "./model.js";

export const FEAT_KEYS = ["up", "down", "left", "right", "front",
  "lip_ratio", "mouth_aspect", "rel_cx", "rel_cy",
  "jaw", "blob_aspect", "blob_w", "blob_h", "nose_cx", "nose_cy",
  "chin_gap", "low_w", "ext_l", "ext_r", "ext_asym", "mass_asym"];
export const FEAT_DIM = FEAT_KEYS.length;
const FEAT_DEFAULTS = { lip_ratio: 1.0, mouth_aspect: 0.2 };
const RATIO_KEYS = new Set(["lip_ratio", "mouth_aspect", "rel_cx", "rel_cy", "nose_cx", "nose_cy", "yaw_off"]);

export const YAW_ALPHA = 0.5;            // 顔の左右向き補正の強さ
const CHEEK_POINTS = [50, 280];          // 頬（肌色の基準）
const LIP_TOP = 13, LIP_BOTTOM = 14, LIP_LEFT = 78, LIP_RIGHT = 308;

export const DIRS = ["up", "down", "left", "right", "front"];
export const MODEL_CLASSES_ALL = ["face", "up", "down", "left", "right", "front"];

export function makeEmptyRaw() {
  return {
    up: 0, down: 0, left: 0, right: 0, front: 0,
    lip_ratio: 1.0, mouth_aspect: 0.2, rel_cx: 0.0, rel_cy: 0.0,
    jaw: 0.0, blob_aspect: 0.0, blob_w: 0.0, blob_h: 0.0, nose_cx: 0.0, nose_cy: 0.0,
    chin_gap: 0.0, low_w: 0.0, yaw_off: 0.0,
    ext_l: 0.0, ext_r: 0.0, ext_asym: 0.0, mass_asym: 0.0,
    roll: 0.0, yaw: 1.0, pitch: 1.0
  };
}

export function extractNumericFeatures(raw) {
  const v = new Float32Array(FEAT_DIM);
  for (let i = 0; i < FEAT_DIM; i++) {
    const k = FEAT_KEYS[i];
    let x = raw[k];
    if (x === undefined || x === null) x = (k in FEAT_DEFAULTS) ? FEAT_DEFAULTS[k] : 0.0;
    x = Number(x);
    v[i] = RATIO_KEYS.has(k) ? x * 100.0 : x;
  }
  return v;
}

// ------------------------------------------
// 判定のチラつき防止（PC版 DirStabilizer と同じ）
// ------------------------------------------
export class DirStabilizer {
  constructor(enter = 0.50, stay = 0.35, confirm = 2, releaseMs = 150) {
    this.enter = enter; this.stay = stay; this.confirm = confirm;
    this.release = releaseMs / 1000.0;
    this.reset();
  }
  reset() { this.cur = "none"; this.cand = null; this.candN = 0; this.lastOk = 0.0; }
  update(d, conf, now) {   // now は秒
    if (d === this.cur && d !== "none") {
      if (conf >= this.stay) this.lastOk = now;
      else if (now - this.lastOk > this.release) this.cur = "none";
      this.candN = 0;
    } else if (d !== "none" && conf >= this.enter) {
      this.candN = (d === this.cand) ? this.candN + 1 : 1;
      this.cand = d;
      if (this.candN >= this.confirm) { this.cur = d; this.lastOk = now; this.candN = 0; }
    } else {
      this.candN = 0;
      if (this.cur !== "none" && now - this.lastOk > this.release) this.cur = "none";
    }
    return this.cur;
  }
}

// ------------------------------------------
// 肩の判定（PC版と同じ）。y は画像の高さを0〜1とした値
// ------------------------------------------
export function computeShoulder(poseLm) {
  if (!poseLm || poseLm.length < 13) return { angle: 0, missing: true, yL: null, yR: null };
  const L = poseLm[11], R = poseLm[12];      // 11 = 本人の左肩, 12 = 本人の右肩
  let angle = 0;
  if (L.y > R.y + 0.05) angle = -20;          // 左肩が下がっている → shoulder_L
  else if (R.y > L.y + 0.05) angle = 20;      // 右肩が下がっている → shoulder_R
  // visibility が入っていない版の MediaPipe もあるので、全部0なら使わない
  const hasVis = poseLm.some((p) => (p.visibility || 0) > 0);
  const vis = (p) => (!hasVis || p.visibility === undefined ? 1 : p.visibility);
  const inFrame = (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  const missing = !(vis(L) >= 0.5 && vis(R) >= 0.5 && inFrame(L) && inFrame(R));
  return { angle, missing, yL: L.y, yR: R.y };
}

// ------------------------------------------
// 顔の向き警告（PC版と同じ）
// ------------------------------------------
export function faceWarningOf(raw, userCalib) {
  const f = (userCalib && userCalib.face) || {};
  const baseYaw = f.yaw ?? 1.0, basePitch = f.pitch ?? 1.0;
  if (raw.yaw < baseYaw * 0.5 || raw.yaw > baseYaw * 2.0) return "顔が横を向いています！";
  if (raw.pitch < basePitch * 0.65) return "もう少しアゴを引いてください";
  if (raw.pitch > basePitch * 1.4) return "もう少し上を向いてください";
  return "";
}

// ------------------------------------------
// OpenCV と同じ尺度の 8ビット Lab（sRGB・D65、L×255/100、a+128）
// ------------------------------------------
//   OpenCV の 8ビット用の整数計算（RGB2Lab_b）をそのまま再現する
const LAB_SHIFT = 12, GAMMA_SHIFT = 3, LAB_SHIFT2 = 15;
const SRGB_TAB_B = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  const x = Math.fround(i * Math.fround(1 / 255));
  const gx = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  SRGB_TAB_B[i] = Math.round(255 * (1 << GAMMA_SHIFT) * gx);
}
const CBRT_TAB_B = new Int32Array(256 * 3 / 2 * (1 << GAMMA_SHIFT));
for (let i = 0; i < CBRT_TAB_B.length; i++) {
  const x = i / (255 * (1 << GAMMA_SHIFT));
  const v = x < 216 / 24389 ? x * (841 / 108) + 16 / 116 : Math.cbrt(x);
  CBRT_TAB_B[i] = Math.round((1 << LAB_SHIFT2) * v);
}
const LAB_C = (() => {
  const m = [0.412453, 0.357580, 0.180423, 0.212671, 0.715160, 0.072169, 0.019334, 0.119193, 0.950227];
  const wp = [0.950456, 1.0, 1.088754];
  const c = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.push(Math.round((1 << LAB_SHIFT) * m[i * 3 + j] / wp[i]));
  return c;
})();
const descale = (x, n) => (x + (1 << (n - 1))) >> n;
const L_SCALE = Math.trunc((116 * 255 + 50) / 100);
const L_SHIFT = -Math.trunc((16 * 255 * (1 << LAB_SHIFT2) + 50) / 100);
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
// a* と L（ともに 8ビット）を返す
export function labAL(r, g, b) {
  const R = SRGB_TAB_B[r], G = SRGB_TAB_B[g], B = SRGB_TAB_B[b];
  const fX = CBRT_TAB_B[descale(R * LAB_C[0] + G * LAB_C[1] + B * LAB_C[2], LAB_SHIFT)];
  const fY = CBRT_TAB_B[descale(R * LAB_C[3] + G * LAB_C[4] + B * LAB_C[5], LAB_SHIFT)];
  const L = descale(L_SCALE * fY + L_SHIFT, LAB_SHIFT2);
  const a = descale(500 * (fX - fY) + 128 * (1 << LAB_SHIFT2), LAB_SHIFT2);
  return [clampByte(a), clampByte(L)];
}

// ------------------------------------------
// 楕円カーネル（cv2.getStructuringElement(MORPH_ELLIPSE) と同じ形）
//   行ごとの横幅 d（中心から左右 d 画素）の配列を返す
// ------------------------------------------
function ellipseRows(k) {
  const r = k >> 1, c = k >> 1;
  const invR2 = r ? 1.0 / (r * r) : 0;
  const rows = [];
  for (let i = 0; i < k; i++) {
    const dy = i - r;
    if (Math.abs(dy) <= r) {
      const dx = Math.round(c * Math.sqrt((r * r - dy * dy) * invR2));
      const j1 = Math.max(c - dx, 0), j2 = Math.min(c + dx + 1, k);
      rows.push({ dy, lo: j1 - c, hi: j2 - 1 - c });
    }
  }
  return rows;
}

// 2値マスク（0/255）の膨張・収縮。範囲外は無視（OpenCV の既定の境界と同じ）
function morph(src, w, h, rows, dilate) {
  const pre = new Int32Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    let acc = 0; const o = y * (w + 1); pre[o] = 0;
    for (let x = 0; x < w; x++) { if (src[y * w + x]) acc++; pre[o + x + 1] = acc; }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let res = dilate ? 0 : 255;
      for (let k = 0; k < rows.length; k++) {
        const yy = y + rows[k].dy;
        if (yy < 0 || yy >= h) continue;
        const x0 = Math.max(0, x + rows[k].lo), x1 = Math.min(w - 1, x + rows[k].hi);
        if (x1 < x0) continue;
        const o = yy * (w + 1);
        const cnt = pre[o + x1 + 1] - pre[o + x0];
        if (dilate) { if (cnt > 0) { res = 255; break; } }
        else if (cnt < x1 - x0 + 1) { res = 0; break; }
      }
      out[y * w + x] = res;
    }
  }
  return out;
}

// 8近傍の連結成分のうち一番大きい塊だけ残す
function keepLargest(mask, w, h) {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let nLab = 0, bestLab = 0, bestArea = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue;
    nLab++;
    let sp = 0, area = 0;
    stack[sp++] = i; lab[i] = nLab;
    while (sp > 0) {
      const p = stack[--sp]; area++;
      const py = (p / w) | 0, px = p - py * w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx; if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !lab[q]) { lab[q] = nLab; stack[sp++] = q; }
        }
      }
    }
    if (area > bestArea) { bestArea = area; bestLab = nLab; }   // 同点なら番号の小さい方（np.argmax と同じ）
  }
  const out = new Uint8Array(w * h);
  if (nLab > 0) for (let i = 0; i < w * h; i++) if (lab[i] === bestLab) out[i] = 255;
  return out;
}

// ヒストグラムから k 番目（0始まり）の値
function kthFromHist(hist, k) {
  let acc = 0;
  for (let v = 0; v < hist.length; v++) { acc += hist[v]; if (acc > k) return v; }
  return hist.length - 1;
}
// np.percentile（linear）と同じ
function pctFromHist(hist, n, p) {
  const rank = (n - 1) * p / 100;
  const lo = Math.floor(rank), frac = rank - lo;
  const vlo = kthFromHist(hist, lo);
  const vhi = frac > 0 ? kthFromHist(hist, lo + 1) : vlo;
  return vlo + (vhi - vlo) * frac;
}
function medianOf(arr) {
  if (!arr.length) return NaN;
  const s = Array.from(arr).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const pyInt = Math.trunc;   // Python の int()（0方向への切り捨て）
// OpenCV の cvRound（偶数への丸め）
function cvRound(v) {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return (f % 2 === 0) ? f : f + 1;
}

// ------------------------------------------
// ① 顔の点だけで決まる値（回転・口の範囲・基準枠など）
//   lm: 正規化座標の点の配列、w,h: 画像の大きさ（幅640）
// ------------------------------------------
export function computeGeometry(lm, w, h) {
  const g = { w, h };
  // 顔の傾き補正：目尻(33, 263)の角度で、鼻(1)を中心に画像を水平にする
  const dx = (lm[263].x - lm[33].x) * w;
  const dy = (lm[263].y - lm[33].y) * h;
  const rollDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const ncx = lm[1].x * w, ncy = lm[1].y * h;
  const th = rollDeg * Math.PI / 180, ca = Math.cos(th), sb = Math.sin(th);
  // cv2.getRotationMatrix2D((ncx, ncy), rollDeg, 1.0)
  const M = [ca, sb, (1 - ca) * ncx - sb * ncy, -sb, ca, sb * ncx + (1 - ca) * ncy];
  g.M = M;
  const P = (i) => {
    const x = lm[i].x * w, y = lm[i].y * h;
    return [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
  };
  g.P = P;

  // 顔の向き（回転前の正規化座標）
  g.roll = lm[33].y - lm[263].y;
  const leftDist = lm[1].x - lm[234].x, rightDist = lm[454].x - lm[1].x;
  g.yaw = rightDist > 0 ? leftDist / rightDist : 1.0;
  const topDist = lm[1].y - lm[10].y, bottomDist = lm[152].y - lm[1].y;
  g.pitch = bottomDist > 0 ? topDist / bottomDist : 1.0;

  const p234 = P(234), p454 = P(454), p1 = P(1), p152 = P(152);
  const faceW = Math.max(1.0, p454[0] - p234[0]);
  const faceMidX = (p234[0] + p454[0]) / 2.0;
  const s = 200.0 / faceW;
  const noseX = p1[0], noseY = p1[1];
  Object.assign(g, { faceW, faceMidX, s, noseX, noseY, chinY: p152[1] });

  const lipLeftX = P(LIP_LEFT)[0], lipRightX = P(LIP_RIGHT)[0];
  const lipTopY = P(LIP_TOP)[1], lipBottomY = P(LIP_BOTTOM)[1];
  const baseMouthW = Math.max(1.0, lipRightX - lipLeftX);
  const baseMouthH = Math.max(0.0, lipBottomY - lipTopY);
  g.lipThicknessRatio = (P(13)[1] - P(0)[1]) / baseMouthW;
  g.mouthAspectRatio = baseMouthH / baseMouthW;
  g.jaw = (p152[1] - noseY) / faceW * 100.0;
  g.yawOff = (noseX - faceMidX) / faceW;
  g.mouthCenterX = (lipLeftX + lipRightX) / 2.0;
  g.mouthCenterY = (lipTopY + lipBottomY) / 2.0;

  // 口の範囲（鼻・顔幅基準）
  const anchorX = faceMidX + YAW_ALPHA * (noseX - faceMidX);
  g.anchorX = anchorX;
  g.xL = pyInt(Math.max(0, anchorX - faceW * 0.38));
  g.xR = pyInt(Math.min(w, anchorX + faceW * 0.38));
  g.yT = pyInt(Math.max(0, noseY + faceW * 0.02));
  g.yB = pyInt(Math.min(h, Math.max(p152[1], noseY + faceW * 0.55)));
  // 基準枠
  g.targetW = faceW * 0.35; g.targetH = faceW * 0.25;
  g.targetX = anchorX - g.targetW / 2;
  g.targetY = noseY + faceW * 0.29 - g.targetH / 2;

  // 頬のパッチ
  const r = Math.max(3, pyInt(faceW * 0.04));
  g.cheeks = [];
  for (const ci of CHEEK_POINTS) {
    const [cx, cy] = P(ci);
    const x0 = pyInt(Math.max(0, cx - r)), x1 = pyInt(Math.min(w, cx + r));
    const y0 = pyInt(Math.max(0, cy - r)), y1 = pyInt(Math.min(h, cy + r));
    g.cheeks.push({ x0, x1, y0, y1 });
  }
  g.roiOk = (g.xR - g.xL > 10 && g.yB - g.yT > 10);

  // 回転後の画像で使う範囲 → 元画像のどこを読めばよいか（逆変換した外接矩形）
  const rects = [];
  if (g.roiOk) rects.push([g.xL, g.yT, g.xR, g.yB]);
  for (const c of g.cheeks) if (c.x1 - c.x0 > 2 && c.y1 - c.y0 > 2) rects.push([c.x0, c.y0, c.x1, c.y1]);
  // 逆行列（回転部分の逆 + 平行移動）
  const det = M[0] * M[4] - M[1] * M[3];
  const i00 = M[4] / det, i01 = -M[1] / det, i10 = -M[3] / det, i11 = M[0] / det;
  const i02 = -(i00 * M[2] + i01 * M[5]), i12 = -(i10 * M[2] + i11 * M[5]);
  g.Mi = [i00, i01, i02, i10, i11, i12];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [a0, b0, a1, b1] of rects) {
    for (const [x, y] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) {
      const sx = i00 * x + i01 * y + i02, sy = i10 * x + i11 * y + i12;
      bx0 = Math.min(bx0, sx); by0 = Math.min(by0, sy); bx1 = Math.max(bx1, sx); by1 = Math.max(by1, sy);
    }
  }
  if (rects.length) {
    const x0 = Math.max(0, Math.floor(bx0) - 2), y0 = Math.max(0, Math.floor(by0) - 2);
    const x1 = Math.min(w, Math.ceil(bx1) + 3), y1 = Math.min(h, Math.ceil(by1) + 3);
    g.srcRect = (x1 > x0 && y1 > y0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  } else g.srcRect = null;
  return g;
}

// 回転後の画像の範囲 (rx, ry, rw, rh) を元画像から双線形補間で作り、各画素の a* と L を返す
//   cv2.warpAffine(INTER_LINEAR・黒縁) → cv2.cvtColor(RGB2LAB) と同じ結果になるように計算する
//   （OpenCV 4.11 以降の warpAffine：単精度の座標と補間 → 四捨五入）
function warpRegionAL(g, src, rx, ry, rw, rh) {
  const f = Math.fround;
  const [i00, i01, i02, i10, i11, i12] = g.Mi;
  const m00 = f(i00), m01 = f(i01), m02 = f(i02), m10 = f(i10), m11 = f(i11), m12 = f(i12);
  const W = g.w, H = g.h, d = src.data, sw = src.width, sh = src.height, ox = src.x, oy = src.y;
  const A = new Uint8Array(rw * rh), Lc = new Uint8Array(rw * rh);
  const rgb = [0, 0, 0];
  const C0 = LAB_C[0], C1 = LAB_C[1], C2 = LAB_C[2], C3 = LAB_C[3], C4 = LAB_C[4], C5 = LAB_C[5];
  for (let j = 0; j < rh; j++) {
    const y = ry + j;
    const ty = f(f(m01 * y) + m02), ty2 = f(f(m11 * y) + m12);
    for (let i = 0; i < rw; i++) {
      const x = rx + i;
      const sx = f(f(m00 * x) + ty), sy = f(f(m10 * x) + ty2);
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const ax = f(sx - x0), ay = f(sy - y0);
      const lx = x0 - ox, ly = y0 - oy;
      const inside = x0 >= 0 && y0 >= 0 && x0 + 1 < W && y0 + 1 < H && lx >= 0 && ly >= 0 && lx + 1 < sw && ly + 1 < sh;
      for (let c = 0; c < 3; c++) {
        let p00, p01, p10, p11;
        if (inside) {
          const o = (ly * sw + lx) * 4 + c;
          p00 = d[o]; p01 = d[o + 4]; p10 = d[o + sw * 4]; p11 = d[o + sw * 4 + 4];
        } else {
          const at = (xx, yy) => {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) return 0;
            const qx = xx - ox, qy = yy - oy;
            if (qx < 0 || qy < 0 || qx >= sw || qy >= sh) return 0;
            return d[(qy * sw + qx) * 4 + c];
          };
          p00 = at(x0, y0); p01 = at(x0 + 1, y0); p10 = at(x0, y0 + 1); p11 = at(x0 + 1, y0 + 1);
        }
        const v0 = f(p00 + f(ax * (p01 - p00))), v1 = f(p10 + f(ax * (p11 - p10)));
        const v = cvRound(f(v0 + f(ay * (v1 - v0))));
        rgb[c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      const R = SRGB_TAB_B[rgb[0]], G = SRGB_TAB_B[rgb[1]], B = SRGB_TAB_B[rgb[2]];
      const fX = CBRT_TAB_B[(R * C0 + G * C1 + B * C2 + 2048) >> 12];
      const fY = CBRT_TAB_B[(R * C3 + G * C4 + B * C5 + 2048) >> 12];
      const L = (L_SCALE * fY + L_SHIFT + 16384) >> 15;
      const a = (500 * (fX - fY) + 4194304 + 16384) >> 15;
      const k = j * rw + i;
      A[k] = a < 0 ? 0 : a > 255 ? 255 : a;
      Lc[k] = L < 0 ? 0 : L > 255 ? 255 : L;
    }
  }
  return { A, L: Lc };
}

// ------------------------------------------
// ② 画素を使って特徴量を計算する（PC版 vision_worker の顔の部分）
//   src: {data(RGBA), width, height, x, y} = 元画像の g.srcRect の部分
//   st: { skinAEma }（フレームをまたいで保つ値）
//   exposure: 赤色検知の厳しさ（0〜150）
// ------------------------------------------
export function computeFaceFeatures(g, src, st, exposure, wantMask = false) {
  const raw = makeEmptyRaw();
  raw.roll = g.roll; raw.yaw = g.yaw; raw.pitch = g.pitch;
  raw.lip_ratio = g.lipThicknessRatio;
  raw.mouth_aspect = g.mouthAspectRatio;
  raw.jaw = g.jaw;
  raw.yaw_off = g.yawOff;
  let maskOut = null;
  if (!g.roiOk || !src) return { raw, mask: null, count: 0 };

  // 頬の肌の赤み（a*）の中央値 → 移動平均
  const skinVals = [];
  for (const c of g.cheeks) {
    if (c.x1 - c.x0 > 2 && c.y1 - c.y0 > 2) {
      const { A } = warpRegionAL(g, src, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      skinVals.push(medianOf(A));
    }
  }
  if (skinVals.length) {
    const cur = medianOf(skinVals);
    st.skinAEma = (st.skinAEma === null || st.skinAEma === undefined) ? cur : st.skinAEma * 0.9 + cur * 0.1;
  }
  const skinA = (st.skinAEma === null || st.skinAEma === undefined) ? 140.0 : st.skinAEma;

  // 赤色の抽出（頬より赤い ＆ 暗すぎない）
  const margin = 6.0 + exposure * 0.12;
  const rw = g.xR - g.xL, rh = g.yB - g.yT;
  const lab = warpRegionAL(g, src, g.xL, g.yT, rw, rh);
  let mask = new Uint8Array(rw * rh);
  const thrA = skinA + margin;
  for (let k = 0; k < rw * rh; k++) if (lab.A[k] > thrA && lab.L[k] > 40) mask[k] = 255;
  // ノイズ除去：開処理1回 → 閉処理2回 → 最大の塊だけ
  const kSize = Math.max(3, pyInt(g.faceW * 0.015) | 1);
  const rows = ellipseRows(kSize);
  mask = morph(mask, rw, rh, rows, false);
  mask = morph(mask, rw, rh, rows, true);
  mask = morph(mask, rw, rh, rows, true);
  mask = morph(mask, rw, rh, rows, true);
  mask = morph(mask, rw, rh, rows, false);
  mask = morph(mask, rw, rh, rows, false);
  mask = keepLargest(mask, rw, rh);
  if (wantMask) maskOut = { xL: g.xL, yT: g.yT, w: rw, h: rh, data: mask };

  // 塊の画素の位置を集計
  const hx = new Int32Array(rw), hy = new Int32Array(rh);
  let count = 0, nRight = 0, nLeft = 0;
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
    if (!mask[j * rw + i]) continue;
    hx[i]++; hy[j]++; count++;
    const X = g.xL + i;
    if (X > g.anchorX) nRight++; else if (X < g.anchorX) nLeft++;
  }
  if (count > 5) {
    const s = g.s, faceW = g.faceW;
    const x3 = g.xL + pctFromHist(hx, count, 3), x97 = g.xL + pctFromHist(hx, count, 97);
    const y3 = g.yT + pctFromHist(hy, count, 3), y97 = g.yT + pctFromHist(hy, count, 97);
    raw.left = pyInt(Math.max(0, x97 - (g.targetX + g.targetW)) * s * 2);   // 画像右側 = 本人の左
    raw.right = pyInt(Math.max(0, g.targetX - x3) * s * 2);
    raw.up = pyInt(Math.max(0, g.targetY - y3) * s * 2);
    raw.down = pyInt(Math.max(0, y97 - (g.targetY + g.targetH)) * s * 2);
    raw.front = Math.max(0, pyInt(Math.sqrt(count) * s) - 2);
    raw.blob_aspect = (y97 - y3 + 1) / (x97 - x3 + 1) * 100.0;
    raw.blob_w = (x97 - x3) * s;
    raw.blob_h = (y97 - y3) * s;
    const extL = (x97 - g.anchorX) / faceW * 100.0;
    const extR = (g.anchorX - x3) / faceW * 100.0;
    raw.ext_l = extL; raw.ext_r = extR; raw.ext_asym = extL - extR;
    raw.mass_asym = (nRight / count - nLeft / count) * 100.0;
    raw.chin_gap = (g.chinY - y97) / faceW * 100.0;
    // 下側1/4の幅
    const thr = y3 + 0.75 * (y97 - y3);
    const hl = new Int32Array(rw); let nLow = 0;
    for (let j = 0; j < rh; j++) {
      if (g.yT + j < thr) continue;
      for (let i = 0; i < rw; i++) if (mask[j * rw + i]) { hl[i]++; nLow++; }
    }
    if (nLow > 3) raw.low_w = (pctFromHist(hl, nLow, 95) - pctFromHist(hl, nLow, 5)) * s;
    const medX = pctFromHist(hx, count, 50), medY = pctFromHist(hy, count, 50);
    raw.rel_cx = (g.xL + medX - g.mouthCenterX) / faceW;
    raw.rel_cy = (g.yT + medY - g.mouthCenterY) / faceW;
    raw.nose_cx = (g.xL + medX - g.anchorX) / faceW;
    raw.nose_cy = (g.yT + medY - g.noseY) / faceW;
  }
  return { raw, mask: maskOut, count };
}

// ------------------------------------------
// ③ 学習モデルの確率 → パワー → DirStabilizer（PC版と同じ）
// ------------------------------------------
export function decideDirection(avgProbs, classes, raw, userCalib, stab, nowSec) {
  let bestIdx = 0;
  for (let i = 1; i < avgProbs.length; i++) if (avgProbs[i] > avgProbs[bestIdx]) bestIdx = i;
  const bestDir = classes[bestIdx], highest = avgProbs[bestIdx];
  const faceBase = (userCalib && typeof userCalib.face === "object") ? userCalib.face : {};
  const axisPower = (d) => {
    const dCal = (userCalib && typeof userCalib[d] === "object") ? userCalib[d] : {};
    const base = Number(faceBase[d] ?? 0);
    const tgt = Number(dCal[d] ?? base + 10);
    return (Number(raw[d] ?? 0) - base) / Math.max(3.0, tgt - base);
  };
  let power = 0.0;
  if (bestDir === "up") {
    const upCal = (userCalib && typeof userCalib.up === "object") ? userCalib.up : {};
    const lipThresh = Number(upCal.lip_ratio_thresh ?? 0.12);
    const lipPower = lipThresh / Math.max(0.01, raw.lip_ratio);
    power = Math.max(lipPower, axisPower("up"));
  } else if (bestDir !== "face") {
    power = axisPower(bestDir);
  }
  power = Math.max(0.0, power);
  // PC版 1119_1：パワーの足切りをなくした（方向は AI の判定とスタビライザだけで決める）
  //   パワーは MAX 判定（isFullPower）にだけ使う
  const cand = bestDir !== "face" ? bestDir : "none";
  const dir = stab.update(cand, highest, nowSec);
  return { dir, ratio: highest, power, isFullPower: dir !== "none" && power >= 1.0 };
}

// ==========================================
// ここから下はブラウザ専用：カメラと MediaPipe を動かして毎フレーム判定する
// ==========================================
export const MP_VERSION = "0.10.14";
const CDN = {
  bundle: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`,
  wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};
const localUrl = (p) => new URL("../" + p, import.meta.url).href;
const LOCAL = {
  bundle: localUrl("vendor/mediapipe/vision_bundle.mjs"),
  wasm: localUrl("vendor/mediapipe/wasm"),
  face: localUrl("vendor/models/face_landmarker.task"),
  pose: localUrl("vendor/models/pose_landmarker_lite.task"),
};
async function exists(url) {
  try { const r = await fetch(url, { method: "HEAD", cache: "no-store" }); return r.ok; }
  catch { try { return !!(await caches.match(url)); } catch { return false; } }   // 通信できないときはキャッシュを見る
}

export class VisionEngine {
  constructor() {
    this.ready = false; this.error = ""; this.status = "";
    this.video = null; this.stream = null;
    this.work = null; this.wctx = null;
    this.face = null; this.pose = null; this.delegate = "";
    this.sources = "";
    // アプリから設定するもの
    this.model = null;          // 学習モデル（rf.js の形式）
    this.userCalib = null;      // 測定の平均値
    this.calibrating = false;   // 測定中は判定しない（PC版 is_calibrating）
    this.exposure = 50;         // 赤色検知の厳しさ
    this.wantMask = false;      // マスクのプレビューを作るか
    this.flipInput = false;     // 端末が反転済みの映像を返す場合の保険（開発者画面）
    this.poseEvery = 3;
    // 判定結果（PC版 player_state / raw_metrics）
    this.state = this.emptyState();
    this.raw = makeEmptyRaw();
    this.featPack = null;       // {id, raw, feat, rawProbs}
    this.featId = 0;
    this.probHistory = [];
    this.stab = new DirStabilizer();
    this.st = { skinAEma: null };
    this.shoulder = { angle: 0, missing: true, yL: null, yR: null };
    this.faceFound = false; this.faceW = 0; this.landmarks = null; this.poseLm = null;
    this.lastMask = null;
    this.frameCount = 0; this.fps = 0; this._fpsT = 0; this._fpsN = 0; this.procMs = 0;
    this.listeners = [];
    this.mock = null;
  }
  emptyState() {
    return { shoulderAngle: 0, tongueDir: "none", tongueRatio: 0, tonguePower: 0, isFullPower: false, faceWarning: "", probs: null, shoulderMissing: true };
  }
  onFrame(fn) { this.listeners.push(fn); }

  async init(video, onStatus = () => {}) {
    this.video = video;
    this.work = document.createElement("canvas");
    this.wctx = this.work.getContext("2d", { willReadFrequently: true });
    onStatus("カメラを準備しています");
    await this.startCamera();
    onStatus("判定の準備をしています（初回は少し時間がかかります）");
    let mod, base = LOCAL;
    try { mod = await import(LOCAL.bundle); this.sources = "local"; }
    catch { mod = await import(CDN.bundle); base = CDN; this.sources = "cdn"; }
    const faceUrl = (base === LOCAL && await exists(LOCAL.face)) ? LOCAL.face : CDN.face;
    const poseUrl = (base === LOCAL && await exists(LOCAL.pose)) ? LOCAL.pose : CDN.pose;
    const fileset = await mod.FilesetResolver.forVisionTasks(base.wasm);
    const make = async (delegate) => {
      const face = await mod.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: faceUrl, delegate },
        runningMode: "VIDEO", numFaces: 1,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      const pose = await mod.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: poseUrl, delegate },
        runningMode: "VIDEO", numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      return { face, pose };
    };
    try { const r = await make("GPU"); this.face = r.face; this.pose = r.pose; this.delegate = "GPU"; }
    catch (e) { const r = await make("CPU"); this.face = r.face; this.pose = r.pose; this.delegate = "CPU"; }
    this.ready = true;
    this.loop();
  }

  async startCamera() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
    const v = this.video;
    v.setAttribute("playsinline", ""); v.muted = true; v.playsInline = true;
    v.srcObject = this.stream;
    await v.play().catch(() => {});
    await new Promise((res) => { if (v.videoWidth) res(); else v.onloadedmetadata = () => res(); });
  }
  cameraAlive() {
    return !!(this.stream && this.stream.getVideoTracks().some((t) => t.readyState === "live"));
  }

  loop() {
    const v = this.video;
    let lastT = -1;
    const step = () => {
      if (v.readyState >= 2 && v.currentTime !== lastT) { lastT = v.currentTime; this.processFrame(); }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step); else requestAnimationFrame(step);
  }

  processFrame() {
    const v = this.video;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return;
    const t0 = performance.now();
    if (vh > vw) {   // 縦向きの映像では判定しない
      this.faceFound = false; this.state = this.emptyState(); this.raw = makeEmptyRaw();
      this.stab.reset(); this.probHistory = [];
      this._tickFps(t0); return;
    }
    const w = 640, h = Math.round(640 * vh / vw);
    if (this.work.width !== w || this.work.height !== h) { this.work.width = w; this.work.height = h; }
    const c = this.wctx;
    if (this.flipInput) { c.save(); c.translate(w, 0); c.scale(-1, 1); c.drawImage(v, 0, 0, w, h); c.restore(); }
    else c.drawImage(v, 0, 0, w, h);
    const ts = performance.now();
    let faceLm = null, poseLm = undefined;
    try {
      const fr = this.face.detectForVideo(this.work, ts);
      faceLm = fr.faceLandmarks && fr.faceLandmarks.length ? fr.faceLandmarks[0] : null;
      if (this.frameCount % this.poseEvery === 0) {
        const pr = this.pose.detectForVideo(this.work, ts);
        poseLm = pr.landmarks && pr.landmarks.length ? pr.landmarks[0] : null;
      }
    } catch (e) { this.error = String(e); }
    this.frameCount++;
    this.step(faceLm, poseLm, w, h, (rect) => c.getImageData(rect.x, rect.y, rect.w, rect.h));
    this.procMs = this.procMs * 0.9 + (performance.now() - t0) * 0.1;
    this._tickFps(t0);
  }

  _tickFps(now) {
    this._fpsN++;
    if (!this._fpsT) this._fpsT = now;
    if (now - this._fpsT >= 1000) {
      this.fps = this._fpsN * 1000 / (now - this._fpsT);
      this._fpsN = 0; this._fpsT = now;
      // 15fps に届かない端末では肩の実行間隔を広げる（最大5フレームに1回）
      if (this.ready && this.fps < 15 && this.poseEvery < 5) this.poseEvery++;
    }
  }

  // faceLm: 顔の点（無ければ null）, poseLm: 肩の点（undefined = 今回は実行していない）
  step(faceLm, poseLm, w, h, getPixels) {
    if (poseLm !== undefined) { this.shoulder = computeShoulder(poseLm); this.poseLm = poseLm; }
    const st = this.emptyState();
    st.shoulderAngle = this.shoulder.angle;
    st.shoulderMissing = this.shoulder.missing;
    let raw = makeEmptyRaw();
    this.landmarks = faceLm;
    this.faceFound = !!faceLm;
    if (faceLm) {
      const g = computeGeometry(faceLm, w, h);
      this.faceW = g.faceW;
      st.faceWarning = faceWarningOf(g, this.userCalib);
      let src = null;
      if (g.srcRect) { const id = getPixels(g.srcRect); src = { data: id.data, width: id.width, height: id.height, x: g.srcRect.x, y: g.srcRect.y }; }
      const res = computeFaceFeatures(g, src, this.st, this.exposure, this.wantMask);
      raw = res.raw;
      if (this.wantMask) this.lastMask = { ...(res.mask || {}), fw: w, fh: h };
      const feat = extractNumericFeatures(raw);
      this.featId++;
      let rawProbs = null;
      if (this.model && !this.calibrating) {
        const r = this._predict(feat, raw);
        Object.assign(st, r.st); rawProbs = r.rawProbs;
      }
      this.featPack = { id: this.featId, raw: { ...raw }, feat, rawProbs };
    } else if (this.wantMask) {
      this.lastMask = null;
    }
    if (this.calibrating || !faceLm) {
      this.stab.reset();
      if (!faceLm) this.probHistory = [];
    }
    this.state = st;
    this.raw = raw;
    for (const fn of this.listeners) fn(this);
  }

  // 学習モデルで確率 → 直近6フレームの平均 → パワー → DirStabilizer
  _predict(feat, raw) {
    const p = predictProba(this.model, feat);
    const rawProbs = {};
    this.model.classes.forEach((cls, i) => { rawProbs[cls] = p[i]; });
    this.probHistory.push(p);
    if (this.probHistory.length > 6) this.probHistory.shift();
    const avg = new Float64Array(p.length);
    for (const q of this.probHistory) for (let i = 0; i < p.length; i++) avg[i] += q[i] / this.probHistory.length;
    const st = { probs: {} };
    this.model.classes.forEach((cls, i) => { st.probs[cls] = avg[i]; });
    const d = decideDirection(avg, this.model.classes, raw, this.userCalib, this.stab, performance.now() / 1000);
    st.tongueRatio = d.ratio; st.tonguePower = d.power; st.tongueDir = d.dir; st.isFullPower = d.isFullPower;
    return { st, rawProbs };
  }

  // 赤色マスクのプレビューを描く（鏡のように左右反転）
  drawMask(ctx, x, y, w, h) {
    ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h);
    const m = this.lastMask;
    if (!m || !m.data) return;
    if (!this._mcv) { this._mcv = document.createElement("canvas"); }
    const cv = this._mcv;
    if (cv.width !== m.fw || cv.height !== m.fh) { cv.width = m.fw; cv.height = m.fh; }
    const mc = cv.getContext("2d");
    mc.fillStyle = "#000"; mc.fillRect(0, 0, cv.width, cv.height);
    const id = mc.createImageData(m.w, m.h);
    for (let i = 0; i < m.w * m.h; i++) { const v = m.data[i]; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    mc.putImageData(id, m.xL, m.yT);
    ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(cv, 0, 0, w, h); ctx.restore();
  }
}

// テスト用（Node での照合に使う）
export const _test = { ellipseRows, morph, keepLargest, warpRegionAL, pctFromHist };
