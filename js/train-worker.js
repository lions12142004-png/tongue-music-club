// 学習は Web Worker で行う（画面を止めないため）。PC版と同じ RF＋SVM のアンサンブル
import { augmentDataset, diagnoseCalibration } from "./rf.js";
import { trainEnsemble, serializeModel } from "./model.js";

export function trainFromDataset(dataset, onProgress = null) {
  // PC版 train_and_save_model と同じ：face/up/down/left/right/front のデータを集め、拡張して学習
  const X = [], y = [];
  for (const label of ["face", "up", "down", "left", "right", "front"]) {
    for (const f of (dataset[label] || [])) { X.push(f); y.push(label); }
  }
  if (new Set(y).size < 2) return null;
  const aug = augmentDataset(X, y, 2, 0);
  return trainEnsemble(aug.X, aug.y, onProgress);
}

if (typeof self !== "undefined" && typeof window === "undefined") {
  self.onmessage = (e) => {
    const { type, id } = e.data;
    try {
      if (type === "train") {
        const t0 = performance.now();
        let last = 0;
        const m = trainFromDataset(e.data.dataset, (p) => {
          if (p - last >= 0.05) { last = p; self.postMessage({ id, type: "progress", p }); }
        });
        self.postMessage({ id, type: "done", model: m ? serializeModel(m) : null, ms: performance.now() - t0 });
      } else if (type === "diagnose") {
        self.postMessage({ id, type: "done", result: diagnoseCalibration(e.data.roundData) });
      }
    } catch (err) {
      self.postMessage({ id, type: "error", error: String(err && err.stack || err) });
    }
  };
}
