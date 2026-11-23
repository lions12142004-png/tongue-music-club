// 判定モデル：PC版と同じ RF と SVM のアンサンブル（VotingClassifier soft voting、重み RF:SVM = 2:1）
import { trainForest, rfPredictProba, serializeModel as serRf, deserializeModel as desRf } from "./rf.js";
import { trainSvmCalibrated, svmPredictProba, serializeSvm, deserializeSvm } from "./svm.js";

export const ENSEMBLE_WEIGHTS = [2, 1];

export function trainEnsemble(X, y, onProgress = null) {
  const t0 = performance.now();
  const rf = trainForest(X, y, {}, (p) => onProgress && onProgress(p * 0.25));
  const t1 = performance.now();
  const svm = trainSvmCalibrated(X, y, {}, (p) => onProgress && onProgress(0.25 + p * 0.75));
  const t2 = performance.now();
  return { type: "ensemble", classes: rf.classes, nFeatures: rf.nFeatures, nSamples: X.length, rf, svm, weights: ENSEMBLE_WEIGHTS,
    rfMs: Math.round(t1 - t0), svmMs: Math.round(t2 - t1) };
}

// classes の並び（文字列の昇順）で確率を返す
export function predictProba(m, x) {
  if (m.type !== "ensemble") return rfPredictProba(m, x);
  const p1 = rfPredictProba(m.rf, x), p2 = svmPredictProba(m.svm, x);
  const [w1, w2] = m.weights, out = new Float64Array(p1.length);
  for (let c = 0; c < p1.length; c++) out[c] = (w1 * p1[c] + w2 * p2[c]) / (w1 + w2);
  return out;
}

export function serializeModel(m) {
  if (m.type !== "ensemble") return serRf(m);
  return { ...m, rf: serRf(m.rf), svm: serializeSvm(m.svm) };
}
export function deserializeModel(o) {
  if (o.type !== "ensemble") return desRf(o);
  return { ...o, rf: desRf(o.rf), svm: deserializeSvm(o.svm) };
}
