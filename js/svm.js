// ==========================================
// svm.js — PC版 svm_clf の移植
//   make_pipeline(StandardScaler(),
//     CalibratedClassifierCV(SVC(kernel="rbf", C=2.0, gamma="scale", class_weight="balanced"), ensemble=False))
//   ・SVC は libsvm と同じ解き方（1対1の SMO、2次の作業集合選択）
//   ・確率は 5分割の交差検証で出した decision_function にシグモイドを当てはめたもの（Platt）
//   ・違い：交差検証の各分割でも gamma は全データで求めた値を使う（標準化後なので差は1%未満）
// ==========================================

const TAU = 1e-12;

// libsvm の Solver（縮小なし）。Qrow(i, out) で Q の i 行目を out に入れる
function smo(n, y, C, Qrow, eps = 1e-3, maxIter = 200000) {
  const alpha = new Float64Array(n), G = new Float64Array(n).fill(-1);
  const Qi = new Float64Array(n), Qj = new Float64Array(n);
  let iter = 0;
  while (iter++ < maxIter) {
    // 作業集合の選択（WSS2）
    let Gmax = -Infinity, ii = -1;
    for (let t = 0; t < n; t++) {
      if (y[t] === 1) { if (alpha[t] < C[t] && -G[t] >= Gmax) { Gmax = -G[t]; ii = t; } }
      else if (alpha[t] > 0 && G[t] >= Gmax) { Gmax = G[t]; ii = t; }
    }
    if (ii === -1) break;
    Qrow(ii, Qi);
    let Gmax2 = -Infinity, jj = -1, objMin = Infinity;
    const yi = y[ii];
    for (let t = 0; t < n; t++) {
      if (y[t] === 1) {
        if (alpha[t] > 0) {
          const gd = Gmax + G[t];
          if (G[t] >= Gmax2) Gmax2 = G[t];
          if (gd > 0) {
            const q = 2 - 2 * yi * Qi[t];
            const obj = -(gd * gd) / (q > 0 ? q : TAU);
            if (obj <= objMin) { jj = t; objMin = obj; }
          }
        }
      } else if (alpha[t] < C[t]) {
        const gd = Gmax - G[t];
        if (-G[t] >= Gmax2) Gmax2 = -G[t];
        if (gd > 0) {
          const q = 2 + 2 * yi * Qi[t];
          const obj = -(gd * gd) / (q > 0 ? q : TAU);
          if (obj <= objMin) { jj = t; objMin = obj; }
        }
      }
    }
    if (Gmax + Gmax2 < eps || jj === -1) break;
    const i = ii, j = jj;
    Qrow(j, Qj);
    const Ci = C[i], Cj = C[j];
    const oi = alpha[i], oj = alpha[j];
    let ai = oi, aj = oj;
    if (y[i] !== y[j]) {
      let q = 2 + 2 * Qi[j]; if (q <= 0) q = TAU;
      const delta = (-G[i] - G[j]) / q, diff = ai - aj;
      ai += delta; aj += delta;
      if (diff > 0) { if (aj < 0) { aj = 0; ai = diff; } } else if (ai < 0) { ai = 0; aj = -diff; }
      if (diff > Ci - Cj) { if (ai > Ci) { ai = Ci; aj = Ci - diff; } } else if (aj > Cj) { aj = Cj; ai = Cj + diff; }
    } else {
      let q = 2 - 2 * Qi[j]; if (q <= 0) q = TAU;
      const delta = (G[i] - G[j]) / q, sum = ai + aj;
      ai -= delta; aj += delta;
      if (sum > Ci) { if (ai > Ci) { ai = Ci; aj = sum - Ci; } } else if (aj < 0) { aj = 0; ai = sum; }
      if (sum > Cj) { if (aj > Cj) { aj = Cj; ai = sum - Cj; } } else if (ai < 0) { ai = 0; aj = sum; }
    }
    alpha[i] = ai; alpha[j] = aj;
    const di = ai - oi, dj = aj - oj;
    for (let t = 0; t < n; t++) G[t] += Qi[t] * di + Qj[t] * dj;
  }
  // rho
  let nFree = 0, sumFree = 0, ub = Infinity, lb = -Infinity;
  for (let t = 0; t < n; t++) {
    const yG = y[t] * G[t];
    if (alpha[t] >= C[t]) { if (y[t] === -1) ub = Math.min(ub, yG); else lb = Math.max(lb, yG); }
    else if (alpha[t] <= 0) { if (y[t] === 1) ub = Math.min(ub, yG); else lb = Math.max(lb, yG); }
    else { nFree++; sumFree += yG; }
  }
  const rho = nFree > 0 ? sumFree / nFree : (ub + lb) / 2;
  return { alpha, rho };
}

// 1対1の判定値 → scikit-learn の decision_function（ovr 形）
function ovrFromOvo(dec, nC) {
  const votes = new Float64Array(nC), conf = new Float64Array(nC);
  let k = 0;
  for (let i = 0; i < nC; i++) for (let j = i + 1; j < nC; j++) {
    const d = dec[k++];
    conf[i] += d; conf[j] -= d;
    if (d >= 0) votes[i]++; else votes[j]++;   // 正なら前のクラス
  }
  const out = new Float64Array(nC);
  for (let c = 0; c < nC; c++) out[c] = votes[c] + conf[c] / (3 * (Math.abs(conf[c]) + 1));
  return out;
}

// Platt のシグモイド（scikit-learn _sigmoid_calibration と同じ目的関数。Newton 法）
function fitSigmoid(F, t01) {
  const n = F.length;
  let p1 = 0; for (let i = 0; i < n; i++) p1 += t01[i];
  const p0 = n - p1;
  const hi = (p1 + 1) / (p1 + 2), lo = 1 / (p0 + 2);
  const T = new Float64Array(n); for (let i = 0; i < n; i++) T[i] = t01[i] ? hi : lo;
  let A = 0, B = Math.log((p0 + 1) / (p1 + 1));
  const fval = (a, b) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const f = F[i] * a + b;
      s += f >= 0 ? T[i] * f + Math.log1p(Math.exp(-f)) : (T[i] - 1) * f + Math.log1p(Math.exp(f));
    }
    return s;
  };
  let fv = fval(A, B);
  for (let it = 0; it < 100; it++) {
    let h11 = 1e-12, h22 = 1e-12, h21 = 0, g1 = 0, g2 = 0;
    for (let i = 0; i < n; i++) {
      const f = F[i] * A + B;
      let p, q;
      if (f >= 0) { const e = Math.exp(-f); p = e / (1 + e); q = 1 / (1 + e); } else { const e = Math.exp(f); p = 1 / (1 + e); q = e / (1 + e); }
      const d2 = p * q;
      h11 += F[i] * F[i] * d2; h22 += d2; h21 += F[i] * d2;
      const d1 = T[i] - p;
      g1 += F[i] * d1; g2 += d1;
    }
    if (Math.abs(g1) < 1e-5 && Math.abs(g2) < 1e-5) break;
    const det = h11 * h22 - h21 * h21;
    const dA = -(h22 * g1 - h21 * g2) / det, dB = -(-h21 * g1 + h11 * g2) / det;
    const gd = g1 * dA + g2 * dB;
    let step = 1;
    while (step >= 1e-10) {
      const nA = A + step * dA, nB = B + step * dB, nf = fval(nA, nB);
      if (nf < fv + 1e-4 * step * gd) { A = nA; B = nB; fv = nf; break; }
      step /= 2;
    }
    if (step < 1e-10) break;
  }
  return [A, B];
}

export function trainSvmCalibrated(X, y, opts = {}, onProgress = null) {
  const C0 = opts.C ?? 2.0, nFolds = opts.cv ?? 5;
  const classes = Array.from(new Set(y)).sort();
  const nC = classes.length, n = X.length, d = X[0].length;
  const yi = Int32Array.from(y, (v) => classes.indexOf(v));
  // 標準化（StandardScaler：平均0・分散1、分散0の列はそのまま）
  const mean = new Float64Array(d), scale = new Float64Array(d);
  for (const r of X) for (let k = 0; k < d; k++) mean[k] += r[k] / n;
  for (const r of X) for (let k = 0; k < d; k++) scale[k] += (r[k] - mean[k]) ** 2 / n;
  for (let k = 0; k < d; k++) { scale[k] = Math.sqrt(scale[k]); if (scale[k] === 0) scale[k] = 1; }
  const Z = new Float64Array(n * d), sq = new Float64Array(n);
  let zs = 0, zs2 = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) {
    const v = (X[i][k] - mean[k]) / scale[k];
    Z[i * d + k] = v; sq[i] += v * v; zs += v; zs2 += v * v;
  }
  const varAll = zs2 / (n * d) - (zs / (n * d)) ** 2;
  const gamma = varAll > 0 ? 1 / (d * varAll) : 1.0;
  const kern = (a, b) => {
    let dot = 0; const oa = a * d, ob = b * d;
    for (let k = 0; k < d; k++) dot += Z[oa + k] * Z[ob + k];
    return Math.exp(-gamma * Math.max(0, sq[a] + sq[b] - 2 * dot));
  };

  // 層化5分割（シャッフルなし：各クラスの中で順番に区切る＝StratifiedKFold と同じ）
  const fold = new Int32Array(n);
  for (let c = 0; c < nC; c++) {
    const idx = []; for (let i = 0; i < n; i++) if (yi[i] === c) idx.push(i);
    const base = Math.floor(idx.length / nFolds), extra = idx.length % nFolds;
    let p = 0;
    for (let f = 0; f < nFolds; f++) { const cnt = base + (f < extra ? 1 : 0); for (let q = 0; q < cnt; q++) fold[idx[p++]] = f; }
  }
  // 交差検証の判定値（ovo）と、最終モデル
  const nPairs = nC * (nC - 1) / 2;
  const cvDec = new Float64Array(n * nPairs);
  const pairs = [];
  let pk = 0;
  const totalSteps = nPairs * (nFolds + 1);
  let done = 0;
  for (let a = 0; a < nC; a++) for (let b = a + 1; b < nC; b++, pk++) {
    const P = []; for (let i = 0; i < n; i++) if (yi[i] === a) P.push(i);
    for (let i = 0; i < n; i++) if (yi[i] === b) P.push(i);
    const m = P.length;
    const K = new Float32Array(m * m);
    for (let s = 0; s < m; s++) { K[s * m + s] = 1; for (let t = s + 1; t < m; t++) { const v = kern(P[s], P[t]); K[s * m + t] = v; K[t * m + s] = v; } }
    const posInP = new Map(P.map((g, s) => [g, s]));
    for (let f = 0; f <= nFolds; f++) {
      // f === nFolds は全データで学習する最終モデル
      const S = [];
      for (let s = 0; s < m; s++) if (f === nFolds || fold[P[s]] !== f) S.push(s);
      // 重み（この学習データ全体のクラス件数から）
      let total = 0; const cnt = new Float64Array(nC);
      for (let i = 0; i < n; i++) if (f === nFolds || fold[i] !== f) { cnt[yi[i]]++; total++; }
      const wA = total / (nC * cnt[a]), wB = total / (nC * cnt[b]);
      const ns = S.length;
      const ys = new Int8Array(ns), Cs = new Float64Array(ns);
      for (let q = 0; q < ns; q++) { const isA = yi[P[S[q]]] === a; ys[q] = isA ? 1 : -1; Cs[q] = C0 * (isA ? wA : wB); }
      const Qrow = (i, out) => { const row = S[i] * m, yv = ys[i]; for (let t = 0; t < ns; t++) out[t] = yv * ys[t] * K[row + S[t]]; };
      const { alpha, rho } = smo(ns, ys, Cs, Qrow);
      const sv = [], coef = [];
      for (let q = 0; q < ns; q++) if (alpha[q] > 0) { sv.push(P[S[q]]); coef.push(alpha[q] * ys[q]); }
      if (f === nFolds) pairs.push({ a, b, sv, coef, rho });
      else {
        // この分割で外したデータ（全クラス）の判定値
        for (let i = 0; i < n; i++) {
          if (fold[i] !== f) continue;
          let s = 0;
          const pi = posInP.get(i);
          if (pi !== undefined) { for (let q = 0; q < sv.length; q++) s += coef[q] * K[pi * m + posInP.get(sv[q])]; }
          else { for (let q = 0; q < sv.length; q++) s += coef[q] * kern(sv[q], i); }
          cvDec[i * nPairs + pk] = s - rho;
        }
      }
      done++; if (onProgress) onProgress(done / totalSteps);
    }
  }
  // シグモイドの当てはめ（クラスごと）
  const F = Array.from({ length: nC }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const o = ovrFromOvo(cvDec.subarray(i * nPairs, (i + 1) * nPairs), nC);
    for (let c = 0; c < nC; c++) F[c][i] = o[c];
  }
  const calib = [];
  for (let c = 0; c < nC; c++) calib.push(fitSigmoid(F[c], Uint8Array.from(yi, (v) => (v === c ? 1 : 0))));
  // サポートベクターをまとめて保存（元の特徴量の空間で、標準化前の値）
  const svIndex = new Map(), svList = [];
  for (const p of pairs) p.sv = p.sv.map((g) => { if (!svIndex.has(g)) { svIndex.set(g, svList.length); svList.push(g); } return svIndex.get(g); });
  const svX = new Float32Array(svList.length * d);
  svList.forEach((g, q) => { for (let k = 0; k < d; k++) svX[q * d + k] = Z[g * d + k]; });
  return {
    classes, nFeatures: d, gamma, mean: Array.from(mean), scale: Array.from(scale), calib,
    nSV: svList.length, svX,
    pairs: pairs.map((p) => ({ a: p.a, b: p.b, sv: Int32Array.from(p.sv), coef: Float64Array.from(p.coef), rho: p.rho })),
  };
}

export function svmPredictProba(m, x) {
  const d = m.nFeatures, nC = m.classes.length;
  const z = new Float64Array(d); let zz = 0;
  for (let k = 0; k < d; k++) { z[k] = (x[k] - m.mean[k]) / m.scale[k]; zz += z[k] * z[k]; }
  const kv = new Float64Array(m.nSV);
  for (let q = 0; q < m.nSV; q++) {
    let dist = 0; const o = q * d;
    for (let k = 0; k < d; k++) { const t = m.svX[o + k] - z[k]; dist += t * t; }
    kv[q] = Math.exp(-m.gamma * dist);
  }
  const dec = new Float64Array(m.pairs.length);
  m.pairs.forEach((p, k) => { let s = 0; for (let q = 0; q < p.sv.length; q++) s += p.coef[q] * kv[p.sv[q]]; dec[k] = s - p.rho; });
  const o = ovrFromOvo(dec, nC);
  const pr = new Float64Array(nC); let sum = 0;
  for (let c = 0; c < nC; c++) { const [A, B] = m.calib[c]; pr[c] = 1 / (1 + Math.exp(A * o[c] + B)); sum += pr[c]; }
  for (let c = 0; c < nC; c++) pr[c] = sum > 0 ? pr[c] / sum : 1 / nC;
  return pr;
}

export function serializeSvm(m) {
  return { ...m, svX: Array.from(m.svX), pairs: m.pairs.map((p) => ({ a: p.a, b: p.b, sv: Array.from(p.sv), coef: Array.from(p.coef), rho: p.rho })) };
}
export function deserializeSvm(o) {
  return { ...o, svX: Float32Array.from(o.svX), pairs: o.pairs.map((p) => ({ a: p.a, b: p.b, sv: Int32Array.from(p.sv), coef: Float64Array.from(p.coef), rho: p.rho })) };
}
