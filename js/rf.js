// ==========================================
// rf.js — 個人学習モデル（仕様書 節6）
//   PC版 rf_clf と同じ設定の RandomForest を JS で実装したもの。
//   木120本・深さ8・葉の最小サンプル3・class_weight="balanced"・max_features=√21・ブートストラップあり・種固定
//   確率 = 各木の葉のクラス割合の平均（scikit-learn の predict_proba と同じ考え方）
// ==========================================

export const RF_DEFAULTS = {
  nEstimators: 120, maxDepth: 8, minSamplesLeaf: 3, classWeight: "balanced",
  bootstrap: true, seed: 42,
};

// 乱数（種固定）
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// PC版 augment_dataset と同じ：×0.8〜1.2 のスケール揺らし＋列ごとのノイズ、コピー2つ
export function augmentDataset(X, y, nCopies = 2, seed = 0) {
  const rng = mulberry32(seed + 12345);
  const n = X.length, d = n ? X[0].length : 0;
  const colScale = new Float64Array(d);
  for (const row of X) for (let j = 0; j < d; j++) colScale[j] += Math.abs(row[j]) / n;
  for (let j = 0; j < d; j++) colScale[j] += 1e-6;
  const Xo = X.slice(), yo = y.slice();
  for (let c = 0; c < nCopies; c++) {
    for (let i = 0; i < n; i++) {
      const sc = 0.8 + 0.4 * rng();
      const r = new Float32Array(d);
      for (let j = 0; j < d; j++) r[j] = X[i][j] * sc + gaussian(rng) * 0.05 * colScale[j];
      Xo.push(r); yo.push(y[i]);
    }
  }
  return { X: Xo, y: yo };
}

// 1本の木を作る
function buildTree(Xf, nFeat, yIdx, nClasses, sampleW, sampleIdx, opts, rng, importances) {
  const maxFeatures = Math.max(1, Math.floor(Math.sqrt(nFeat)));
  const feat = [], thr = [], left = [], right = [], value = [];
  const newNode = () => { feat.push(-2); thr.push(0); left.push(-1); right.push(-1); for (let c = 0; c < nClasses; c++) value.push(0); return feat.length - 1; };
  const featOrder = new Int32Array(nFeat);
  const stack = [{ idx: sampleIdx, depth: 0, node: newNode() }];
  let rootW = 0;
  for (const i of sampleIdx) rootW += sampleW[i];
  const imp = new Float64Array(nFeat);

  while (stack.length) {
    const { idx, depth, node } = stack.pop();
    const n = idx.length;
    const cw = new Float64Array(nClasses);
    let W = 0;
    for (let k = 0; k < n; k++) { const i = idx[k]; cw[yIdx[i]] += sampleW[i]; W += sampleW[i]; }
    for (let c = 0; c < nClasses; c++) value[node * nClasses + c] = cw[c];
    let gini = 1;
    for (let c = 0; c < nClasses; c++) { const p = cw[c] / W; gini -= p * p; }
    if (depth >= opts.maxDepth || n < 2 || n < 2 * opts.minSamplesLeaf || gini <= 1e-12) continue;

    // 特徴量をランダムな順に試す（定数の特徴量は数に入れない＝scikit-learn と同じ）
    for (let j = 0; j < nFeat; j++) featOrder[j] = j;
    let best = null, visited = 0;
    const vals = new Float64Array(n);
    for (let fi = 0; fi < nFeat && visited < maxFeatures; fi++) {
      const r = fi + Math.floor(rng() * (nFeat - fi));
      const f = featOrder[r]; featOrder[r] = featOrder[fi]; featOrder[fi] = f;
      const order = Uint32Array.from(idx);
      for (let k = 0; k < n; k++) vals[k] = Xf[order[k] * nFeat + f];
      const perm = new Uint32Array(n); for (let k = 0; k < n; k++) perm[k] = k;
      perm.sort((a, b) => vals[a] - vals[b]);
      const vmin = vals[perm[0]], vmax = vals[perm[n - 1]];
      if (vmax <= vmin + 1e-7) continue;
      visited++;
      const lw = new Float64Array(nClasses);
      let WL = 0;
      for (let p = 0; p < n - 1; p++) {
        const i = order[perm[p]];
        lw[yIdx[i]] += sampleW[i]; WL += sampleW[i];
        const nl = p + 1, nr = n - nl;
        if (nl < opts.minSamplesLeaf) continue;
        if (nr < opts.minSamplesLeaf) break;
        const a = vals[perm[p]], b = vals[perm[p + 1]];
        if (b <= a + 1e-7) continue;
        const WR = W - WL;
        if (WL <= 0 || WR <= 0) continue;
        let sL = 0, sR = 0;
        for (let c = 0; c < nClasses; c++) { const l = lw[c]; const rr = cw[c] - l; sL += l * l; sR += rr * rr; }
        // 加重 Gini の和が最小 ⇔ sL/WL + sR/WR が最大
        const score = sL / WL + sR / WR;
        if (!best || score > best.score + 1e-12) {
          let t = (a + b) / 2; if (t === b) t = a;
          best = { score, f, t, WL, WR, lw: lw.slice() };
        }
      }
    }
    if (!best) continue;
    const L = [], R = [];
    for (let k = 0; k < n; k++) { const i = idx[k]; (Xf[i * nFeat + best.f] <= best.t ? L : R).push(i); }
    if (!L.length || !R.length) continue;
    // 重要度（加重不純度の減少）
    let gL = 1, gR = 1;
    for (let c = 0; c < nClasses; c++) { const pl = best.lw[c] / best.WL; const pr = (cw[c] - best.lw[c]) / best.WR; gL -= pl * pl; gR -= pr * pr; }
    imp[best.f] += (W * gini - best.WL * gL - best.WR * gR) / rootW;
    feat[node] = best.f; thr[node] = best.t;
    const ln = newNode(), rn = newNode();
    left[node] = ln; right[node] = rn;
    stack.push({ idx: R, depth: depth + 1, node: rn });
    stack.push({ idx: L, depth: depth + 1, node: ln });
  }
  // 葉の値をクラス割合に正規化
  const nNodes = feat.length;
  for (let k = 0; k < nNodes; k++) {
    let s = 0; for (let c = 0; c < nClasses; c++) s += value[k * nClasses + c];
    if (s > 0) for (let c = 0; c < nClasses; c++) value[k * nClasses + c] /= s;
  }
  let impSum = 0; for (let j = 0; j < nFeat; j++) impSum += imp[j];
  if (impSum > 0) for (let j = 0; j < nFeat; j++) importances[j] += imp[j] / impSum;
  return { f: Int16Array.from(feat), t: Float64Array.from(thr), l: Int32Array.from(left), r: Int32Array.from(right), v: Float32Array.from(value) };
}

// X: 特徴量の配列（各要素は長さ nFeat の配列）, y: ラベル（文字列）
export function trainForest(X, y, options = {}, onProgress = null) {
  const opts = { ...RF_DEFAULTS, ...options };
  const classes = Array.from(new Set(y)).sort();          // scikit-learn の classes_ と同じ並び（文字列の昇順）
  const nClasses = classes.length, n = X.length, nFeat = X[0].length;
  const yIdx = new Int32Array(n);
  const counts = new Float64Array(nClasses);
  for (let i = 0; i < n; i++) { yIdx[i] = classes.indexOf(y[i]); counts[yIdx[i]]++; }
  const Xf = new Float32Array(n * nFeat);
  for (let i = 0; i < n; i++) for (let j = 0; j < nFeat; j++) Xf[i * nFeat + j] = X[i][j];
  const classW = new Float64Array(nClasses).fill(1);
  if (opts.classWeight === "balanced") for (let c = 0; c < nClasses; c++) classW[c] = n / (nClasses * counts[c]);
  const rng = mulberry32(opts.seed);
  const trees = [];
  const importances = new Float64Array(nFeat);
  for (let t = 0; t < opts.nEstimators; t++) {
    const w = new Float64Array(n);
    if (opts.bootstrap) { for (let k = 0; k < n; k++) w[Math.floor(rng() * n)] += 1; }
    else w.fill(1);
    const idx = [];
    for (let i = 0; i < n; i++) if (w[i] > 0) { w[i] *= classW[yIdx[i]]; idx.push(i); }
    trees.push(buildTree(Xf, nFeat, yIdx, nClasses, w, idx, opts, rng, importances));
    if (onProgress) onProgress((t + 1) / opts.nEstimators);
  }
  for (let j = 0; j < nFeat; j++) importances[j] /= opts.nEstimators;
  return { classes, nFeatures: nFeat, trees, importances: Array.from(importances), nSamples: n, options: opts };
}

export function rfPredictProba(model, x) {
  const nC = model.classes.length;
  const out = new Float64Array(nC);
  for (const tr of model.trees) {
    let k = 0;
    while (tr.l[k] !== -1) k = (x[tr.f[k]] <= tr.t[k]) ? tr.l[k] : tr.r[k];
    for (let c = 0; c < nC; c++) out[c] += tr.v[k * nC + c];
  }
  for (let c = 0; c < nC; c++) out[c] /= model.trees.length;
  return out;
}

export function rfPredict(model, x) {
  const p = rfPredictProba(model, x);
  let b = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[b]) b = i;
  return model.classes[b];
}

// 保存用（IndexedDB にそのまま入る形）
export function serializeModel(m) {
  return {
    classes: m.classes, nFeatures: m.nFeatures, importances: m.importances, nSamples: m.nSamples,
    options: m.options,
    trees: m.trees.map((t) => ({ f: Array.from(t.f), t: Array.from(t.t), l: Array.from(t.l), r: Array.from(t.r), v: Array.from(t.v) })),
  };
}
export function deserializeModel(o) {
  return {
    ...o,
    trees: o.trees.map((t) => ({ f: Int16Array.from(t.f), t: Float64Array.from(t.t), l: Int32Array.from(t.l), r: Int32Array.from(t.r), v: Float32Array.from(t.v) })),
  };
}

// 診断用：1回目の測定で学習 → 2回目でテストした混同行列（PC版 diagnose_calibration）
export function diagnoseCalibration(roundData) {
  const labels = ["face", "up", "down", "left", "right", "front"];
  const Xtr = [], ytr = [], Xte = [], yte = [];
  for (const l of labels) {
    for (const f of (roundData[`${l}|1`] || [])) { Xtr.push(f); ytr.push(l); }
    for (const f of (roundData[`${l}|2`] || [])) { Xte.push(f); yte.push(l); }
  }
  if (new Set(ytr).size < 2 || !Xte.length) return null;
  const m = trainForest(Xtr, ytr, { nEstimators: 120, maxDepth: 8, minSamplesLeaf: 1, classWeight: null, seed: 42 });
  const cm = labels.map(() => labels.map(() => 0));
  for (let i = 0; i < Xte.length; i++) {
    const p = rfPredict(m, Xte[i]);
    const r = labels.indexOf(yte[i]), c = labels.indexOf(p);
    if (r >= 0 && c >= 0) cm[r][c]++;
  }
  return { labels, matrix: cm, importances: m.importances };
}
