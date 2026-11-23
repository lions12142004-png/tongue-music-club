// 動作確認用のにせのカメラ（URL に ?mock=1 を付けたときだけ使う）
//   キーボード：←↑→↓ / F = 舌の方向（左・上・右・下・前）、Q / E = 左肩 / 右肩、何も押さない = 舌なし
//   window.__mock = { dir: "up", shoulder: 0 } でも切り替えられる
import { VisionEngine, makeEmptyRaw, extractNumericFeatures, computeShoulder } from "./vision.js";

const BASE = {
  none:  { up: 0, down: 2, left: 1, right: 1, front: 8, lip_ratio: 0.16, mouth_aspect: 0.15, blob_w: 20, blob_h: 10, chin_gap: 40 },
  up:    { up: 14, down: 0, left: 2, right: 2, front: 22, lip_ratio: 0.09, mouth_aspect: 0.35, rel_cy: -0.12, nose_cy: 0.12, blob_w: 40, blob_h: 30, chin_gap: 50 },
  down:  { up: 0, down: 14, left: 1, right: 1, front: 30, lip_ratio: 0.15, mouth_aspect: 0.4, rel_cy: 0.12, nose_cy: 0.45, blob_w: 40, blob_h: 60, chin_gap: 8 },
  left:  { up: 0, down: 3, left: 14, right: 0, front: 28, lip_ratio: 0.15, mouth_aspect: 0.3, rel_cx: 0.12, nose_cx: 0.12, ext_l: 30, ext_r: 5, ext_asym: 25, mass_asym: 60, blob_w: 70, blob_h: 25, chin_gap: 30 },
  right: { up: 0, down: 3, left: 0, right: 14, front: 28, lip_ratio: 0.15, mouth_aspect: 0.3, rel_cx: -0.12, nose_cx: -0.12, ext_l: 5, ext_r: 30, ext_asym: -25, mass_asym: -60, blob_w: 70, blob_h: 25, chin_gap: 30 },
  front: { up: 2, down: 4, left: 2, right: 2, front: 45, lip_ratio: 0.14, mouth_aspect: 0.4, blob_w: 60, blob_h: 40, low_w: 50, chin_gap: 25 },
};

export class MockEngine extends VisionEngine {
  async init(video, onStatus = () => {}) {
    this.video = video;
    onStatus("にせのカメラで動作確認中");
    window.__mock = window.__mock || { dir: "none", shoulder: 0 };
    const keys = new Set();
    const map = { ArrowLeft: "left", ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", KeyF: "front" };
    window.addEventListener("keydown", (e) => { keys.add(e.code); upd(); });
    window.addEventListener("keyup", (e) => { keys.delete(e.code); upd(); });
    const upd = () => {
      let d = "none"; for (const [k, v] of Object.entries(map)) if (keys.has(k)) d = v;
      window.__mock.dir = d;
      window.__mock.shoulder = keys.has("KeyQ") ? -20 : keys.has("KeyE") ? 20 : 0;
    };
    this.delegate = "mock"; this.sources = "mock";
    this.ready = true;
    let n = 0;
    setInterval(() => this.mockFrame(n++), 33);
  }
  async startCamera() {}
  cameraAlive() { return true; }
  mockFrame(n) {
    const m = window.__mock;
    const lm = [];
    for (let i = 0; i < 478; i++) lm.push({ x: 0.5, y: 0.45 });
    Object.assign(lm[234], { x: 0.38, y: 0.4 }); Object.assign(lm[454], { x: 0.62, y: 0.4 });
    Object.assign(lm[10], { x: 0.5, y: 0.18 }); Object.assign(lm[152], { x: 0.5, y: 0.66 });
    Object.assign(lm[1], { x: 0.5, y: 0.43 });
    Object.assign(lm[33], { x: 0.44, y: 0.33 }); Object.assign(lm[263], { x: 0.56, y: 0.33 });
    const sh = m.shoulder || 0;
    const pose = [];
    for (let i = 0; i < 33; i++) pose.push({ x: 0.5, y: 0.8, visibility: 1 });
    pose[11] = { x: 0.7, y: 0.82 + (sh === -20 ? 0.08 : 0), visibility: 1 };
    pose[12] = { x: 0.3, y: 0.82 + (sh === 20 ? 0.08 : 0), visibility: 1 };
    this.shoulder = computeShoulder(pose); this.poseLm = pose;
    // 特徴量を合成して、本物と同じ判定（学習モデル → パワー → DirStabilizer）を通す
    this._raw = makeEmptyRaw();
    const b = BASE[m.dir] || BASE.none;
    for (const [k, v] of Object.entries(b)) {
      const noise = (Math.random() - 0.5) * 0.2 * (Math.abs(v) + 1);
      this._raw[k] = ["up", "down", "left", "right", "front"].includes(k) ? Math.max(0, Math.round(v + noise)) : v + noise * 0.05;
    }
    this._raw.yaw = 1.0 + (Math.random() - 0.5) * 0.05; this._raw.pitch = 1.0 + (Math.random() - 0.5) * 0.05;
    this.frameCount++;
    this.stepMock(lm, 640, 480);
    this._tickFps(performance.now());
  }
  stepMock(lm, w, h) {
    // VisionEngine.step の顔の部分を、合成した raw で置き換えたもの
    const raw = this._raw;
    this.faceW = 0.24 * w;
    this.landmarks = lm; this.faceFound = true;
    const st = this.emptyState();
    st.shoulderAngle = this.shoulder.angle; st.shoulderMissing = this.shoulder.missing;
    st.faceWarning = "";
    const feat = extractNumericFeatures(raw);
    this.featId++;
    let rawProbs = null;
    if (this.model && !this.calibrating) {
      const r = this._predict(feat, raw);
      Object.assign(st, r.st); rawProbs = r.rawProbs;
    }
    this.featPack = { id: this.featId, raw: { ...raw }, feat, rawProbs };
    if (this.calibrating) this.stab.reset();
    this.state = st; this.raw = raw;
    for (const fn of this.listeners) fn(this);
  }
}
