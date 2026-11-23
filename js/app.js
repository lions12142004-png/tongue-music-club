// ==========================================
// app.js — 画面・ゲーム・ノルマ・記録（仕様書 節4・6・7・8・9）
//   PC版 1105_1 の main() を移植したもの。判定の計算は vision.js、学習は rf.js / train-worker.js
// ==========================================
import { W, H, COL, FS, Screen, loadImages, rgb } from "./ui.js";
import { VisionEngine, DIRS, FEAT_KEYS, MP_VERSION } from "./vision.js";
import { MockEngine } from "./mock.js";
import { deserializeModel } from "./model.js";
import { dbGet, dbSet, requestPersist } from "./storage.js";
import { AudioEngine } from "./audio.js";
import { Sync } from "./sync.js";
import { SYNC } from "./config.js";
import { initClub, ClubScenes, ClubPlay } from "./club/scenes.js";   // 追加(1.5.0): Tongue Music Club の演出

export const APP_VERSION = "1.5.0";
const MODEL_VERSION = "html2-rfsvm";     // 学習方法を変えたら上げる（保存してある特徴量から自動で学習し直す）
const FEAT_VERSIONS = ["feat21-v1", "html1-feat21"];   // 特徴量の版（変えたら先頭に足す。古い特徴量は読まずに測り直しへ）
const MOCK = new URLSearchParams(location.search).has("mock");

// ---------- PC版と同じ定数 ----------
const DEFAULT_CALIB = {
  face: { roll: 0.0, yaw: 1.0, pitch: 1.0 },
  up: { up: 15, down: 0, left: 0, right: 0, front: 30, lip_ratio_thresh: 0.12 },
  down: { up: 0, down: 12, left: 0, right: 0, front: 30 },
  left: { up: 0, down: 0, left: 10, right: 0, front: 30 },
  right: { up: 0, down: 0, left: 0, right: 10, front: 30 },
  front: { up: 0, down: 0, left: 0, right: 0, front: 50 },
};
const DEFAULT_CONFIG = { speed_mult: 5, offset: 0, bgm_vol: 5, se_vol: 3, exposure_offset: 50 };
const CALIB_SKIP_SEC = 0.5, CALIB_SEC_R1 = 2.5, CIRCLE_SEC = 3.0, CALIB_SEC_R2 = CALIB_SKIP_SEC + CIRCLE_SEC;
const CALIB_PLAN = ["static", "weak", "circle"];   // じっくりコースのみ
const CALIB_STEPS = [
  { key: "face", name: "正面（舌なし）", desc: "軽く口を開け、舌をしまい、カメラの正面を向いた通常の状態で記録してください", min_val: 0 },
  { key: "face_open", name: "口を開けただけ", desc: "舌は出さずに、口を大きく開けた状態で記録してください", min_val: 0 },
  { key: "down", name: "下", desc: "舌を【下】に限界まで突き出した状態で記録してください", min_val: 2 },
  { key: "left", name: "左", desc: "舌を【左】に限界まで突き出した状態で記録してください", min_val: 2 },
  { key: "right", name: "右", desc: "舌を【右】に限界まで突き出した状態で記録してください", min_val: 2 },
  { key: "front", name: "前", desc: "舌を【前】に限界まで突き出した状態で記録してください", min_val: 15 },
  { key: "up", name: "上", desc: "舌を【上】に限界まで突き出した状態で記録してください", min_val: 2 },
];
const INT_KEYS = new Set(["up", "down", "left", "right", "front"]);
// 曲（PC版の SONGS の最初の3曲と同じ名前。名前が同じなら、PC とスマホで同じランキングになる）
// 修正(1.5.0): PC版 1122_2 と同じく、メニュー表に12曲（4曲目からは「準備中」）
const SONGS_READY = 3;
const SONGS = ["エリーゼのために", "仮の曲2", "仮の曲3", "仮の曲4", "仮の曲5", "仮の曲6", "仮の曲7", "仮の曲8", "仮の曲9", "仮の曲10", "仮の曲11", "仮の曲12"]
  .map((title, i) => ({ title, audio: "assets/audio/elise2.m4a", beatmap: "assets/beatmaps/track6.json", end_time: 120000, enabled: i < SONGS_READY }));
const DIFFS = ["EASY", "NORMAL", "HARD"];
const DIFF_ENABLED = { EASY: false, NORMAL: true, HARD: false };   // PC版と同じく NORMAL のみ
const DIFF_COL = { EASY: "#2ECC71", NORMAL: "#4ECDC4", HARD: "#E74C3C" };
const SONG_TUTORIAL = { title: "くるみ割り人形", diff: "NORMAL", audio: "assets/audio/my_track.mp3", beatmap: "assets/beatmaps/track_tyuto.json", end_time: 40000 };
const DIR_JA = { up: "上", down: "下", left: "左", right: "右", front: "前" };
const NORMA_ORDER = ["up", "down", "left", "right", "front"];
const NORMA_GOAL = 3;
// 置き方ガイド：640px幅の画像での顔幅の下限（これより小さいと「近づいて」）。実機で調整して報告する値
const FACE_W_MIN = 120;
// 追加(1.3.1): この画面の間は通信しない（ためておき、ほかの画面に戻ったらまとめて送る）
const SYNC_QUIET_SCENES = new Set(["LOADING", "OPENING", "OVATION", "TRANSITION", "PLAYING", "RESUME_COUNTDOWN", "PAUSE", "PAUSE_RULE", "PAUSE_CONFIRM", "CALIBRATION", "CHECK_DETECTION"]);
// 追加(1.3.2): ノーツを取ったときのずれ（ms、＋＝ノーツが判定線に来る前＝早い）の平均と中央値
function timingStats(a) {
  if (!a || !a.length) return { timing_mean_ms: "", timing_median_ms: "", timing_n: 0 };
  const s = [...a].sort((x, y) => x - y), n = s.length;
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { timing_mean_ms: Math.round(a.reduce((x, y) => x + y, 0) / n), timing_median_ms: Math.round(med), timing_n: n };
}
// 追加(1.4.0): ランキングのユーザー名に使える文字（受け口・PC版と同じ）
const NAME_RE = /^[A-Za-z0-9_\-぀-ゟ゠-ヿ㐀-䶿一-鿿々〆０-９Ａ-Ｚａ-ｚ]{1,8}$/;
const WAKE_SCENES = new Set(["OPENING", "OVATION", "PLACEMENT", "CALIB_INTRO", "CALIBRATION", "CALIB_CONFIRM", "TUTORIAL_INTRO", "TRAINING",
  "PLAYING", "PAUSE", "PAUSE_RULE", "PAUSE_CONFIRM", "RESUME_COUNTDOWN", "CHECK_DETECTION"]);

const VANISHING_Y = 150, JUDGE_Y = 400, LANE_WIDTH_TOP = 20, LANE_WIDTH_BOTTOM = 68;
const laneIndex = (t) => ({ shoulder_L: -3, left: -2, up: -1, front: 0, down: 1, right: 2, shoulder_R: 3 }[t] ?? 0);
function p3d(lane, progress) {
  const p = Math.max(0, Math.min(3, progress)), z = p * p;
  const y = VANISHING_Y + (JUDGE_Y - VANISHING_Y) * z;
  const lw = LANE_WIDTH_TOP + (LANE_WIDTH_BOTTOM - LANE_WIDTH_TOP) * z;
  return [Math.trunc(W / 2 + lane * lw), Math.trunc(y)];
}

// ---------- 小物 ----------
const clone = (o) => JSON.parse(JSON.stringify(o));
const round4 = (v) => Math.round(v * 10000) / 10000;
const pad2 = (n) => String(n).padStart(2, "0");
function localDate(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function jst(d = new Date()) {
  try {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d).replace("T", " ");
  } catch { return `${localDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
}
function addDays(dateStr, n) { const [y, m, d] = dateStr.split("-").map(Number); return localDate(new Date(y, m - 1, d + n)); }
function shuffle(a, k) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b.slice(0, k); }
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

class App {
  constructor() {
    this.cv = document.getElementById("game");
    this.wrap = document.getElementById("wrap");
    this.video = document.getElementById("cam");
    this.scr = new Screen(this.cv, this.wrap);
    this.scr.onResize = () => { this.placeIdForm(); this.placeNameForm(); };
    this.audio = new AudioEngine();
    this.engine = MOCK ? new MockEngine() : new VisionEngine();
    this.engine.onFrame(() => this.onVisionFrame());
    this.scene = "TITLE";
    this.started = false; this.statusMsg = ""; this.errorMsg = "";
    this.user = null; this.userCalib = clone(DEFAULT_CALIB); this.config = { ...DEFAULT_CONFIG };
    this.model = null; this.modelMeta = null;
    this.calibDataset = {}; this.calibRoundData = {};
    this.daily = {}; this.plays = []; this.calibLog = []; this.diag = null;
    this.cameraDisplayOn = false;
    this.popups = [];
    this.titleTaps = []; this.devReturn = "TITLE";
    this.wakeLock = null;
    this.trainProgress = 0;
    this.worker = null; this.workerJobs = new Map(); this.jobSeq = 0;
    this.activeSlider = null;
    this.testState = "IDLE";
    this.ruleReturn = "PAUSE";
    this.placementMode = "first";
    this.firstFlow = false;
    this.selSong = 0; this.rankView = false;
    // 記録の送受信（config.js が空なら通信しない）。動作確認モードでは URL で試験用サーバーを指定できる
    const qp = new URLSearchParams(location.search);
    const syncCfg = (MOCK && qp.get("sync")) ? { url: qp.get("sync"), key: qp.get("key") || "" } : SYNC;
    this.sync = new Sync(syncCfg, "phone", APP_VERSION, () => localDate(), () => jst());
    this.setupInput();
    this.setupIdForm();
    document.addEventListener("visibilitychange", () => this.onVisibility());
    window.addEventListener("orientationchange", () => setTimeout(() => this.onOrientation(), 500));
    window.addEventListener("resize", () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.onOrientation(), 500); });
    loadImages(this.scr, {
      up: "assets/img/up2.png", down: "assets/img/down2.png", left: "assets/img/left2.png", right: "assets/img/right2.png",
      front: "assets/img/front2.png", shoulder_L: "assets/img/shoulder_l2.png", shoulder_R: "assets/img/shoulder_r2.png",
      none: "assets/img/no.png", shoulder_no: "assets/img/shoulder_no.png",
      up_ex: "assets/img/up_ex.png", down_ex: "assets/img/down_ex.png", left_ex: "assets/img/left_ex.png",
      right_ex: "assets/img/right_ex.png", front_ex: "assets/img/front_ex.png", face_ex: "assets/img/face2_ex.png",
      pose: "assets/img/pose.png",
    }).then(() => initClub(this)).catch((e) => { console.error(e); this.initError = "画面の準備に失敗しました。再読み込みしてください"; });
    requestAnimationFrame((t) => this.frame(t));
  }

  // =====================================================
  // 入力
  // =====================================================
  setupInput() {
    this.cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.isPortrait()) return;
      this.audio.unlock();
      const [x, y] = this.scr.toLocal(e.clientX, e.clientY);
      this.pointer = { x, y, down: true };
      // スライダーはドラッグで動かす
      for (const s of this.sliders || []) {
        if (x >= s.x - 10 && x <= s.x + s.w + 10 && y >= s.y - 18 && y <= s.y + s.h + 18) { this.activeSlider = s; this.dragSlider(x); return; }
      }
      const b = this.scr.hit(x, y);
      if (b && b.onTap) b.onTap(x, y);
    });
    this.cv.addEventListener("pointermove", (e) => {
      const [x, y] = this.scr.toLocal(e.clientX, e.clientY);
      if (this.pointer && this.pointer.down) { this.pointer.x = x; this.pointer.y = y; }
      if (this.dragFn) { this.dragFn(x, y); return; }   // 追加(1.5.0): 設定のミキサーのフェーダー
      if (!this.activeSlider) return;
      this.dragSlider(x);
    });
    const up = () => { this.activeSlider = null; this.dragFn = null; this.activeFader = null; if (this.pointer) this.pointer.down = false; };
    this.cv.addEventListener("pointerup", up); this.cv.addEventListener("pointercancel", up);
    document.addEventListener("gesturestart", (e) => e.preventDefault());
  }
  dragSlider(x) {
    const s = this.activeSlider;
    const r = Math.max(0, Math.min(1, (x - s.x) / s.w));
    s.set(Math.round(s.min + r * (s.max - s.min)));
  }

  // 参加者IDの入力欄（Canvas では文字入力ができないので、HTMLの入力欄を重ねる）
  setupIdForm() {
    this.idForm = document.getElementById("idform");
    this.idInput = document.getElementById("idinput");
    this.idForm.addEventListener("submit", (e) => { e.preventDefault(); this.submitId(); });
    // 追加(1.4.0): ランキングのユーザー名の入力欄
    this.nameForm = document.getElementById("nameform");
    this.nameInput = document.getElementById("nameinput");
    this.nameForm.addEventListener("submit", (e) => { e.preventDefault(); this.chooseRanking(true); });
  }
  placeNameForm() {
    if (!this.nameForm) return;
    const r = this.cv.getBoundingClientRect(), s = this.scr.scale;
    Object.assign(this.nameForm.style, { left: (r.left + 250 * s) + "px", top: (r.top + 222 * s) + "px", width: (300 * s) + "px", height: (40 * s) + "px", fontSize: Math.max(14, 22 * s) + "px" });
  }
  showNameForm(show, value = "") {
    if (!this.nameForm) return;
    this.nameForm.style.display = show ? "flex" : "none";
    if (show) { this.placeNameForm(); this.nameInput.value = value; }
    else this.nameInput.blur();
  }
  placeIdForm() {
    if (!this.idForm) return;
    const r = this.cv.getBoundingClientRect(), s = this.scr.scale;
    Object.assign(this.idForm.style, { left: (r.left + 260 * s) + "px", top: (r.top + 145 * s) + "px", width: (280 * s) + "px", height: (44 * s) + "px", fontSize: Math.max(14, 22 * s) + "px" });   // 1.5.0: 受付のタブレットの入力枠に重ねる
  }
  showIdForm(show, value = "") {
    this.idForm.style.display = show ? "flex" : "none";
    if (show) { this.placeIdForm(); this.idInput.value = value; }
    else this.idInput.blur();
  }

  // =====================================================
  // 起動
  // =====================================================
  async start(navigate = true) {
    if (this.busy) return;
    this.busy = true; this.errorMsg = "";
    this.audio.unlock();
    this.tryFullscreen();
    requestPersist();
    try {
      if (!this.engine.ready) await this.engine.init(this.video, (m) => { this.statusMsg = m; });
    } catch (e) {
      this.busy = false;
      const name = e && e.name;
      this.errorMsg = (name === "NotAllowedError" || name === "SecurityError")
        ? "カメラが許可されていません。設定でカメラを許可してから、もう一度画面をタップしてください"
        : (name === "NotFoundError" || name === "OverconstrainedError") ? "カメラが見つかりません"
          : "判定の準備に失敗しました。通信を確認して、もう一度画面をタップしてください";
      console.error(e);
      return;
    }
    this.started = true; this.busy = false; this.statusMsg = "";
    if (!this._seLoading) { this._seLoading = true; this.audio.loadSE("assets/audio/audio_001.mp3"); }
    if (!navigate) return;
    this.goLogin();   // 修正(1.3.1): タイトル → 必ずログイン（前回のIDを入れておく）
  }
  async tryFullscreen() {
    if (isIOS) return;   // iPhone は全画面・向きのロックができない
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape");
    } catch {}
  }
  async goLogin() {
    const last = (await dbGet("lastUser").catch(() => "")) || "";
    this.setScene("LOGIN");
    this.loginMsg = last ? `前回のID「${last}」が入っています。そのままでよければ「決定」` : "半角英数字（12文字まで）で入力してください";
    this.loginMsgCol = "#B4B4B4"; this.showIdForm(true, last);
  }

  async submitId() {
    const id = this.idInput.value.trim();
    if (!/^[A-Za-z0-9]{1,12}$/.test(id)) { this.loginMsg = "エラー：半角英数字（12文字まで）で入力してください"; this.loginMsgCol = COL.red; return; }
    this.showIdForm(false);
    if (!(await this.loadUser(id))) await this.createUser(id);
    await dbSet("lastUser", id);
    this.afterLogin();
  }
  async afterLogin() {
    if (this.user) await this.sync.setUser(this.user.id);
    if (this.needRetrain) {
      this.needRetrain = false;
      this.trainBg = "tablet"; this.setScene("TRAINING"); this.trainMsg = "新しい判定方法（RF＋SVM）で学習し直しています"; this.trainProgress = 0;
      await this.trainAndSave();
    }
    // 修正(1.5.0): PC版と同じく、測定済みなら「ようこそ」→ 客席へ。初めてなら 置き方 → 測定 → チュートリアル → 判定テスト → ご案内 → 曲選択
    if (this.model) { this.rankView = false; this.menuSpread = 0; this.startWelcome(); }
    else { this.firstFlow = true; this.firstGuide = true; this.placementMode = "first"; this.go("PLACEMENT", "zoom_in"); }
  }

  async loadUser(id) {
    const prof = await dbGet("user:" + id);
    if (!prof) return false;
    this.user = prof;
    this.userCalib = clone(prof.calib || DEFAULT_CALIB);
    if (!this.userCalib.face) this.userCalib.face = { roll: 0.0, yaw: 1.0, pitch: 1.0 };
    this.config = { ...DEFAULT_CONFIG, ...(prof.config || {}) };
    const m = await dbGet("model:" + id);
    if (m && m.version === MODEL_VERSION && m.model) { this.model = deserializeModel(m.model); this.modelMeta = m; }
    else { this.model = null; this.modelMeta = null; }
    const cd = await dbGet("calibdata:" + id);
    const cdOk = !!(cd && FEAT_VERSIONS.includes(cd.version));
    this.calibDataset = cdOk ? cd.dataset : {};
    this.calibRoundData = cdOk ? (cd.roundData || {}) : {};
    // 学習方法だけが古いモデル：保存してある特徴量があれば、測り直さずに学習し直す
    this.needRetrain = !this.model && cdOk && Object.keys(this.calibDataset).length >= 2;
    this.daily = (await dbGet("daily:" + id)) || {};
    this.plays = (await dbGet("plays:" + id)) || [];
    this.calibLog = (await dbGet("caliblog:" + id)) || [];
    this.diag = await dbGet("diag:" + id);
    this.applyToEngine();
    return true;
  }
  async createUser(id) {
    const today = localDate();
    this.user = { id, created: jst(), firstUseDate: today, calib: clone(DEFAULT_CALIB), config: { ...DEFAULT_CONFIG }, calibrated: false, scores: {} };
    this.userCalib = clone(DEFAULT_CALIB); this.config = { ...DEFAULT_CONFIG };
    this.model = null; this.modelMeta = null; this.calibDataset = {}; this.calibRoundData = {};
    this.daily = {}; this.plays = []; this.calibLog = []; this.diag = null;
    await this.saveUser();
    this.applyToEngine();
  }
  applyToEngine() {
    this.engine.model = this.model;
    this.engine.userCalib = this.userCalib;
    this.engine.exposure = this.config.exposure_offset;
    this.engine.probHistory = [];
    this.audio.setVolumes(this.config.bgm_vol, this.config.se_vol);
  }
  async saveUser() {
    this.user.calib = clone(this.userCalib);
    this.user.config = { ...this.config };
    await dbSet("user:" + this.user.id, this.user);
  }
  modelVersionStr() { return this.modelMeta ? `${MODEL_VERSION}@${this.modelMeta.savedAt}` : ""; }

  // =====================================================
  // 画面の切り替え・一時停止・向き
  // =====================================================
  setScene(s) {
    this.scene = s;
    if (s !== "RANKING_ASK") this.showNameForm(false);
    this.sync.setBusy(SYNC_QUIET_SCENES.has(s));   // 追加(1.3.1): プレイ中・測定中は通信しない
    this.engine.calibrating = (s === "CALIBRATION" || s === "CALIB_CONFIRM" || s === "CALIB_INTRO");
    this.engine.wantMask = (s === "SETTINGS" || s === "DEV" || s === "CAMERA_ADJUST");
    this.updateWakeLock();
  }
  isPortrait() { return window.innerHeight > window.innerWidth; }
  async updateWakeLock() {
    const need = WAKE_SCENES.has(this.scene) && document.visibilityState === "visible";
    try {
      if (need && !this.wakeLock && navigator.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => { this.wakeLock = null; });
      } else if (!need && this.wakeLock) { await this.wakeLock.release(); this.wakeLock = null; }
    } catch { this.wakeLock = null; }
  }
  // プレイ中なら一時停止、測定の記録中なら取り消す
  interrupt() {
    if (this.scene === "PLAYING" || this.scene === "RESUME_COUNTDOWN") { this.audio.pause(); this.setScene("PAUSE"); }
    if (this.scene === "CALIBRATION" && this.calibPhase !== "idle") this.cancelRecording();
  }
  onVisibility() {
    if (document.visibilityState === "hidden") { this.interrupt(); }
    else {
      this.sync.flush(); this.sync.refresh(true);
      if (this.engine.ready && !this.engine.cameraAlive()) this.engine.startCamera().catch(() => {});
      this.updateWakeLock();
    }
  }
  onOrientation() {
    if (this.isPortrait()) { this.interrupt(); return; }
    // 横向きになったのに映像が縦長なら、カメラを開き直す
    const v = this.video;
    if (this.engine.ready && !MOCK && v.videoWidth && v.videoHeight > v.videoWidth) this.engine.startCamera().catch(() => {});
  }
  popup(text, ms = 1200, color = COL.yellow, size = FS.md, y = 120) { this.popups.push({ text, until: performance.now() + ms, color, size, y }); }

  // =====================================================
  // 毎フレームの描画
  // =====================================================
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const s = this.scr;
    s.begin();
    this.sliders = [];
    if (this.isPortrait()) { this.drawRotate(); return; }
    const fn = this["draw_" + this.scene];
    if (fn) fn.call(this, t);
    if (!["LOGIN", "PAUSE_RULE", "DEV"].includes(this.scene)) this.drawCameraMini();
    const now = performance.now();
    this.popups = this.popups.filter((p) => p.until > now);
    for (const p of this.popups) {
      const w = s.measure(p.text, p.size) + 32;
      s.rrect(W / 2 - w / 2, p.y - 6, w, p.size + 16, 10, "rgba(0,0,0,0.75)");
      s.textC(p.text, p.y, p.size, p.color);
    }
  }

  drawRotate() {
    const s = this.scr;
    s.textC("スマホを横向きにしてください", H / 2 - 30, FS.lg, COL.teal);
    s.textC("プレイ中・測定中は一時停止しています", H / 2 + 20, FS.sm, "#C8C8C8");
  }

  // 左下のカメラ映像の小窓（ON/OFF）
  drawCameraMini() {
    const s = this.scr, cx = 10, cy = H - 85;
    const onR = [cx, cy - 30, 50, 26], offR = [cx + 50, cy - 30, 50, 26];
    s.rect(...onR, this.cameraDisplayOn ? rgb(195, 255, 195) : rgb(200, 200, 200));
    s.rect(...offR, this.cameraDisplayOn ? rgb(200, 200, 200) : rgb(255, 200, 255));
    s.ctx.strokeStyle = rgb(50, 50, 50); s.ctx.lineWidth = 3; s.ctx.strokeRect(cx, cy - 30, 100, 26);
    s.text("ON", cx + 25, cy - 26, 15, rgb(50, 50, 50), "center");
    s.text("OFF", cx + 75, cy - 26, 15, rgb(50, 50, 50), "center");
    s.hotspot(cx, cy - 34, 100, 34, () => { this.cameraDisplayOn = !this.cameraDisplayOn; });
    if (this.cameraDisplayOn && this.engine.ready) {
      if (MOCK) s.rect(cx, cy, 100, 75, "#334"); else s.video(this.video, cx, cy, 100, 75);
      s.ctx.strokeStyle = COL.teal; s.ctx.lineWidth = 2; s.ctx.strokeRect(cx, cy, 100, 75);
    } else {
      s.rect(cx, cy, 100, 75, rgb(40, 40, 40));
      s.ctx.strokeStyle = rgb(100, 100, 100); s.ctx.lineWidth = 2; s.ctx.strokeRect(cx, cy, 100, 75);
    }
  }

  // 5回タップで開発者画面
  titleTap(ret) {
    const now = performance.now();
    this.titleTaps = this.titleTaps.filter((t) => now - t < 3000);
    this.titleTaps.push(now);
    if (this.titleTaps.length >= 5) { this.titleTaps = []; this.devReturn = ret; this.setScene("DEV"); }
  }

  // =====================================================
  // タイトル
  // =====================================================
  draw_TITLE() {
    const s = this.scr;
    s.textC("舌ゲーム", 40, FS.xl, COL.teal);
    s.hotspot(250, 30, 300, 70, () => this.titleTap("TITLE"));
    if (!this.busy) s.button(290, 125, 220, 60, "はじめる", () => this.start(), { bg: COL.teal });
    else { s.rrect(290, 125, 220, 60, 8, rgb(80, 80, 80)); s.textC("準備中…", 141, FS.md, rgb(200, 200, 200)); }
    let msg, col = "#AAAAAA";
    if (this.errorMsg) { msg = this.errorMsg; col = COL.red; }
    else if (this.busy) msg = this.statusMsg || "準備中…";
    else msg = "スマホを横向きにしてスタンドに立て、「はじめる」を押してください";
    s.textC(msg, 200, FS.sm, col, 760);
    s.img("pose", W / 2 - 210, 240, 420, 220);
    s.text(`ver ${APP_VERSION}${MOCK ? "（動作確認モード）" : ""}`, W - 10, H - 22, 13, "#555", "right");
  }

  // =====================================================
  // 参加者ID（初回だけ）
  // =====================================================
  draw_LOGIN() {
    const s = this.scr;
    s.textC("参加者IDを入力", 40, FS.lg, COL.teal);
    s.textC(this.loginMsg || "", 90, FS.sm, this.loginMsgCol || "#B4B4B4");
    s.textC("（研究の担当者から伝えられたIDです。PC版と同じIDを使ってください）", 200, FS.sm, "#888", 700);
  }

  // =====================================================
  // 追加(1.4.0): 得点ランキングへの参加（まだ選んでいなければ曲選択の前に。あとから設定で変えられる）
  // =====================================================
  goRankAsk(from) {
    const p = this.sync.myProfile();
    this.rankAskFrom = from; this.rankMsg = ""; this.rankMsgCol = "#B4B4B4";
    this.setScene("RANKING_ASK");
    this.showNameForm(true, p ? p.name : "");
  }
  chooseRanking(on) {
    const name = this.nameInput.value.trim();
    if (on && !NAME_RE.test(name)) {
      this.rankMsg = name ? "ユーザー名は、ひらがな・カタカナ・漢字・英数字と _ - で8文字までにしてください" : "参加する場合は、ユーザー名を入れてください";
      this.rankMsgCol = COL.red; return;
    }
    this.sync.setProfile(on, name);
    this.showNameForm(false);
    this.setScene(this.rankAskFrom === "settings" ? "SETTINGS" : "SONG_SELECT");
  }
  draw_RANKING_ASK() {
    const s = this.scr;
    s.textC("得点ランキングへの参加", 18, FS.lg, COL.teal);
    s.textC("曲・難易度ごとの得点の上位3名が、ユーザー名と得点で、ほかの参加者の画面に表示されます。", 76, FS.sm, COL.white, 740);
    s.textC("参加は自由です。参加しなくても、ご自身の得点は記録されます。", 104, FS.sm, COL.white, 740);
    s.textC("あとから「設定」で、いつでも変えられます（PC版とスマホ版で共通です）。", 132, FS.sm, COL.white, 740);
    s.textC("参加する場合のユーザー名", 188, FS.sm + 2, COL.yellow);
    s.textC("ひらがな・カタカナ・漢字・英数字と _ - で8文字まで。本名・あだ名・学籍番号など、ご本人と分かる名前は使わないでください", 280, 14, "#AAA", 780);
    if (this.rankMsg) s.textC(this.rankMsg, 306, FS.sm, this.rankMsgCol);
    s.button(160, 340, 220, 62, "参加する", () => this.chooseRanking(true), { bg: COL.teal });
    s.button(420, 340, 220, 62, "参加しない", () => this.chooseRanking(false), { bg: rgb(90, 90, 90), fg: COL.white });
    if (this.rankAskFrom === "settings") s.button(20, 420, 140, 46, "やめる", () => this.setScene("SETTINGS"), { bg: rgb(60, 60, 60), fg: COL.white, size: FS.sm });
  }

  // =====================================================
  // 置き方ガイド／置き方の確認
  // =====================================================
  drawPlacementBody() {   // 修正(1.5.0): 背景（タブレット）は scenes.js が描く
    const s = this.scr, e = this.engine;
    const first = this.placementMode !== "play";
    s.textC(first ? "置き方ガイド" : "置き方の確認", 12, FS.lg, COL.teal);
    // カメラ映像（鏡のように反転）と目安の線
    const vx = 125, vy = 54, vw = 360, vh = 270;
    if (MOCK) s.rect(vx, vy, vw, vh, "#334"); else s.video(this.video, vx, vy, vw, vh);
    const v = this.video;
    // 映像を枠に合わせて切り出したときの変換（正規化座標 → 画面）
    let map = (x, y) => [vx + (1 - x) * vw, vy + y * vh];
    if (!MOCK && v.videoWidth) {
      const vr = v.videoWidth / v.videoHeight, r = vw / vh;
      let sw = 1, sh = 1, sx = 0, sy = 0;
      if (vr > r) { sw = r / vr; sx = (1 - sw) / 2; } else { sh = vr / r; sy = (1 - sh) / 2; }
      map = (x, y) => [vx + (1 - (x - sx) / sw) * vw, vy + ((y - sy) / sh) * vh];
    }
    const c = s.ctx;
    c.save(); c.beginPath(); c.rect(vx, vy, vw, vh); c.clip();
    c.setLineDash([8, 6]); c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 2;
    c.strokeRect(vx + vw * 0.36, vy + vh * 0.10, vw * 0.28, vh * 0.48);      // 顔を入れる枠
    c.beginPath(); c.moveTo(vx + vw * 0.15, vy + vh * 0.80); c.lineTo(vx + vw * 0.85, vy + vh * 0.80); c.stroke();   // 肩のライン
    c.setLineDash([]);
    const faceOk = e.faceFound && e.faceW >= FACE_W_MIN;
    if (e.faceFound && e.landmarks) {
      const lm = e.landmarks;
      const pts = [234, 454, 10, 152].map((i) => map(lm[i].x, lm[i].y));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      c.strokeStyle = faceOk ? COL.green : COL.red; c.lineWidth = 3;
      c.strokeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }
    if (e.poseLm && e.poseLm.length > 12) {
      const a = map(e.poseLm[11].x, e.poseLm[11].y), b = map(e.poseLm[12].x, e.poseLm[12].y);
      const col = e.shoulder.missing ? COL.red : COL.green;
      s.line(a[0], a[1], b[0], b[1], col, 4); s.circle(a[0], a[1], 7, col); s.circle(b[0], b[1], 7, col);
    }
    c.restore();
    s.text("点線の枠に顔、下の線に肩が来るように置く", vx + vw / 2, vy + vh + 8, 15, "#BBB", "center", vw);

    // 右側：チェック
    const px = 505;
    const warn = e.state.faceWarning;
    const rows = [
      [faceOk, faceOk ? "顔：OK" : !e.faceFound ? "顔：見つかりません" : "顔が小さすぎます（近づいて）"],
      [!e.shoulder.missing, e.shoulder.missing ? "肩が映っていません（離れて）" : "両肩：OK"],
      [e.faceFound && !warn, !e.faceFound ? "顔の向き：—" : warn ? warn : "顔の向き：OK"],
    ];
    rows.forEach(([ok, label], i) => {
      const y = 54 + i * 60;
      s.rrect(px, y, 280, 50, 8, "#1C1C26", ok ? COL.green : COL.red, 2);
      s.text(ok ? "✓" : "✕", px + 12, y + 11, FS.md, ok ? COL.green : COL.red);
      s.text(label, px + 44, y + 14, FS.sm + 2, COL.white, "left", 228);
    });
    let ny = 238;
    s.text("明るい場所で、マスクや前髪など", px, ny, 15, "#AAA"); s.text("顔を隠すものは外してください", px, ny + 20, 15, "#AAA"); ny += 46;
    if (!navigator.wakeLock && !MOCK) { s.text("画面が消えないよう、自動ロックを", px, ny, 15, COL.yellow); s.text("「なし」にしてください", px, ny + 20, 15, COL.yellow); }
    if (first) {
      s.button(px + 100, 408, 180, 58, "次へ", () => this.setScene("CALIB_INTRO"), { bg: COL.green });
      if (this.model) s.button(px - 10, 408, 100, 58, "戻る", () => this.go("SONG_SELECT", "zoom_out"), { bg: rgb(80, 80, 80), fg: COL.white });
    } else {
      s.button(px + 100, 408, 180, 58, "開演する", () => this.startSong({ ...SONGS[this.selSong], diff: this.selDiff || "NORMAL" }, false), { bg: COL.green });
      s.button(px - 10, 408, 100, 58, "戻る", () => this.go("DIFF_SELECT", "fade"), { bg: rgb(80, 80, 80), fg: COL.white });
    }
  }

  // =====================================================
  // 測定（キャリブレーション）
  // =====================================================
  startCalibration() {
    this.calibIdx = 0; this.calibRound = 1;
    this.tempCalib = clone(DEFAULT_CALIB);
    this.calibDatasetNew = {}; this.calibRoundNew = {};
    this.pendingCalib = null; this.pendingFeats = [];
    this.calibMsg = "";
    this.cancelRecording();
    this.setScene("CALIBRATION");
  }
  curCond() { return CALIB_PLAN[this.calibRound - 1]; }
  cancelRecording() {
    this.calibPhase = "idle"; this.calibStartT = 0;
    this.calibSamples = []; this.calibFeatSamples = []; this.lastCalibId = -1;
  }
  startRecording() {
    this.calibMsg = "";
    this.calibPhase = "countdown"; this.countStart = performance.now(); this.lastBeep = -1;
  }
  // 測定の記録（カメラの新しいフレームごと）
  calibOnFrame() {
    if (this.calibPhase !== "recording") return;
    const e = this.engine, step = CALIB_STEPS[this.calibIdx];
    const isFace = step.key.startsWith("face");
    const cond = this.curCond();
    const warn = e.state.faceWarning;
    const now = performance.now() / 1000;
    const pack = e.featPack;
    // 1・2回目（正面で静止）は、舌のステップで顔向き警告が出たら記録をやり直す
    const resetNow = !pack || (cond !== "circle" && !isFace && warn !== "");
    if (resetNow) { this.calibStartT = now; this.calibSamples = []; this.calibFeatSamples = []; this.lastCalibId = -1; this.calibWaiting = true; return; }
    this.calibWaiting = false;
    const elapsed = now - this.calibStartT;
    if (pack.id !== this.lastCalibId) {
      this.lastCalibId = pack.id;
      if (elapsed >= CALIB_SKIP_SEC && !(cond === "circle" && warn !== "")) {
        this.calibSamples.push(pack.raw); this.calibFeatSamples.push(pack.feat);
      }
    }
  }
  calibUpdate() {
    const now = performance.now();
    if (this.calibPhase === "countdown") {
      const el = (now - this.countStart) / 1000;
      const k = Math.floor(el);
      if (k !== this.lastBeep && k < 3) { this.lastBeep = k; this.audio.beep(660, 0.1, 0.4); }
      if (el >= 3) {
        this.audio.beep(1320, 0.15, 0.5);
        this.calibPhase = "recording"; this.calibStartT = now / 1000;
        this.calibSamples = []; this.calibFeatSamples = []; this.lastCalibId = -1;
      }
    } else if (this.calibPhase === "recording") {
      const cond = this.curCond();
      const total = cond === "circle" ? CALIB_SEC_R2 : CALIB_SEC_R1;
      if (now / 1000 - this.calibStartT >= total) {
        this.audio.beep(880, 0.25, 0.5);
        const samples = this.calibSamples, feats = this.calibFeatSamples;
        this.cancelRecording();
        if (cond === "circle" && feats.length < 10) this.calibMsg = "顔を動かしすぎです。もう少し小さく円を描いてください";
        else if (!feats.length) this.calibMsg = "顔が見つかりませんでした。もう一度記録してください";
        else this.recordStepWithTrim(samples, feats);
      }
    }
  }
  // PC版 record_calib_step_with_trim（上下10%を除いた平均）
  recordStepWithTrim(samples, feats) {
    const avg = {};
    for (const axis of ["up", "down", "left", "right", "front", "roll", "yaw", "pitch"]) {
      const vals = samples.filter((s) => axis in s).map((s) => s[axis] ?? 0);
      if (!vals.length) { avg[axis] = (axis === "yaw" || axis === "pitch") ? 1.0 : 0; continue; }
      vals.sort((a, b) => a - b);
      const tc = Math.trunc(vals.length * 0.1);
      const tr = tc > 0 ? vals.slice(tc, vals.length - tc) : vals;
      avg[axis] = tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : 0;
    }
    for (const ax of INT_KEYS) avg[ax] = Math.trunc(avg[ax] ?? 0);
    const key = CALIB_STEPS[this.calibIdx].key;
    if (key === "up") {
      const rv = samples.map((s) => s.lip_ratio ?? 1.0).sort((a, b) => a - b);
      const tc = Math.trunc(rv.length * 0.1);
      const tr = tc > 0 ? rv.slice(tc, rv.length - tc) : rv;
      const m = tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : 0.12;
      avg.lip_ratio_thresh = round4(m * 1.15);
    }
    this.pendingCalib = avg; this.pendingFeats = feats.slice();
    this.setScene("CALIB_CONFIRM");
  }
  // PC版 commit_calib_step
  async commitCalibStep() {
    const step = CALIB_STEPS[this.calibIdx], k = step.key;
    const profile = { ...this.pendingCalib };
    if (!k.startsWith("face") && (profile[k] ?? 0) < step.min_val) profile[k] = step.min_val;
    const label = k.startsWith("face") ? "face" : k;   // face_open も「舌なし」として学習
    (this.calibDatasetNew[label] ||= []).push(...this.pendingFeats);
    (this.calibRoundNew[`${label}|${this.calibRound}`] ||= []).push(...this.pendingFeats);
    // PC版 1119_2：基準値は1回目（正面・普通）だけで決める。2・3回目は学習データにだけ使う
    if (this.calibRound === 1) this.tempCalib[k] = { ...profile };
    if (k === "face" && this.calibRound === CALIB_PLAN.length) { this.userCalib.face = { ...this.tempCalib.face }; this.engine.userCalib = this.userCalib; }
    if (this.calibRound < CALIB_PLAN.length) { this.calibRound++; this.cancelRecording(); this.setScene("CALIBRATION"); return; }
    this.calibRound = 1; this.calibIdx++;
    if (this.calibIdx < CALIB_STEPS.length) { this.cancelRecording(); this.setScene("CALIBRATION"); return; }
    await this.finishCalibration();
  }
  async finishCalibration() {
    this.trainBg = "tablet"; this.setScene("TRAINING"); this.trainMsg = "判定のモデルを作っています"; this.trainProgress = 0;
    this.userCalib = clone(this.tempCalib);
    this.calibDataset = this.calibDatasetNew; this.calibRoundData = this.calibRoundNew;
    this.user.calibrated = true; this.user.calib_course = "full"; this.user.calibAt = jst();
    this.engine.userCalib = this.userCalib;
    await this.saveUser();
    try {
      const diag = await this.runWorker({ type: "diagnose", roundData: this.calibRoundData });
      this.diag = diag.result; await dbSet("diag:" + this.user.id, this.diag);
      if (this.diag) console.log("[診断] 行=正解 / 列=予測", this.diag.labels, this.diag.matrix);
    } catch (e) { console.warn(e); }
    const ok = await this.trainAndSave();
    this.logCalib({ at: jst(), kind: "calibration", test_correct: "", missed_dirs: "", model_version: this.modelVersionStr() });
    await dbSet("caliblog:" + this.user.id, this.calibLog);
    if (!ok) { this.popup("学習に失敗しました。もう一度測定してください", 4000, COL.red); this.setScene(this.model ? "SONG_SELECT" : "CALIB_INTRO"); return; }
    this.tutorialData = { up: [], down: [], left: [], right: [], front: [] };
    this.setScene("TUTORIAL_INTRO");
  }

  // 学習（Web Worker）。使えない端末では画面側で学習する
  runWorker(msg) {
    return new Promise((resolve, reject) => {
      const go = async () => {
        if (!this.worker && this.worker !== false) {
          try {
            this.worker = new Worker(new URL("./train-worker.js", import.meta.url), { type: "module" });
            this.worker.onmessage = (ev) => {
              const job = this.workerJobs.get(ev.data.id); if (!job) return;
              if (ev.data.type === "progress") { this.trainProgress = ev.data.p; return; }
              this.workerJobs.delete(ev.data.id);
              if (ev.data.type === "error") job.reject(new Error(ev.data.error)); else job.resolve(ev.data);
            };
            this.worker.onerror = (er) => { console.warn("worker error", er); for (const j of this.workerJobs.values()) j.reject(er); this.workerJobs.clear(); this.worker = false; };
          } catch { this.worker = false; }
        }
        if (this.worker) {
          const id = ++this.jobSeq;
          this.workerJobs.set(id, { resolve, reject: async (er) => { try { resolve(await fallback()); } catch (e2) { reject(e2); } } });
          this.worker.postMessage({ ...msg, id });
        } else resolve(await fallback());
      };
      const fallback = async () => {
        const mod = await import("./train-worker.js");
        const rf = await import("./rf.js");
        await new Promise((r) => setTimeout(r, 50));
        const t0 = performance.now();
        if (msg.type === "train") { const md = await import("./model.js"); const m = mod.trainFromDataset(msg.dataset); return { model: m ? md.serializeModel(m) : null, ms: performance.now() - t0 }; }
        return { result: rf.diagnoseCalibration(msg.roundData) };
      };
      go().catch(reject);
    });
  }
  async trainAndSave() {
    try {
      this.trainProgress = 0;
      const r = await this.runWorker({ type: "train", dataset: this.calibDataset });
      if (!r.model) return false;
      this.model = deserializeModel(r.model);
      this.modelMeta = { version: MODEL_VERSION, savedAt: jst(), trainMs: Math.round(r.ms), nSamples: r.model.nSamples, nTrees: r.model.rf.trees.length, nSV: r.model.svm.nSV, rfMs: r.model.rfMs, svmMs: r.model.svmMs };
      await dbSet("model:" + this.user.id, { ...this.modelMeta, model: r.model });
      await dbSet("calibdata:" + this.user.id, { version: FEAT_VERSIONS[0], at: jst(), dataset: this.calibDataset, roundData: this.calibRoundData });
      this.engine.model = this.model; this.engine.probHistory = [];
      console.log(`[学習] ${r.model.nSamples}件 ${Math.round(r.ms)}ms（RF ${r.model.rfMs}ms / SVM ${r.model.svmMs}ms、SV ${r.model.svm.nSV}）`);
      return true;
    } catch (e) { console.error(e); return false; }
  }

  draw_CALIB_INTRO() {
    const s = this.scr;
    s.textC("顔・舌のパーソナライズ測定を行います", 26, FS.lg, COL.teal);
    s.textC("最初に、あなたの顔と舌の基本パターンを測定します。", 76, FS.md, COL.white);
    const ins = ["・明るい場所で行ってください", "・肩までカメラに映る姿勢で行ってください", "・カメラに対して正面を向いてください",
      "・マスクや帽子、前髪など、顔を隠すものは外してください", "・照明や太陽の光がカメラに直接映り込むと、うまく判定できない場合があります"];
    const mw = Math.max(...ins.map((t) => s.measure(t, FS.sm)));
    ins.forEach((t, i) => s.text(t, W / 2 - mw / 2, 122 + i * 28, FS.sm, COL.white));
    s.textC("測定は約3分。続けてチュートリアル曲と判定テストを行います（合計 約5〜6分）", 270, FS.sm, COL.yellow);
    s.button(W / 2 - 110, 310, 220, 60, "はじめる", () => this.startCalibration(), { bg: COL.yellow });
    if (this.model) s.button(660, 420, 120, 48, "やめる", () => this.setScene("HOME"), { bg: rgb(80, 80, 80), fg: COL.white });
  }

  drawCalibrationBody() {   // 修正(1.5.0): 背景（タブレット）は scenes.js が描く
    const s = this.scr, e = this.engine;
    this.calibUpdate();
    const step = CALIB_STEPS[this.calibIdx], k = step.key, cond = this.curCond();
    const raw = e.raw;
    s.text(`ステップ ${this.calibIdx + 1}/${CALIB_STEPS.length}`, 16, 14, FS.sm, "#999");
    const head = k.startsWith("face") ? "舌なし状態の測定" : "舌の初期測定";
    s.textC(`${head} (${this.calibRound}/${CALIB_PLAN.length}回目)`, 8, FS.lg, COL.yellow, 520);
    s.textC(step.desc, 50, FS.sm, rgb(230, 230, 230));
    // 説明画像（顔を動かす回は、代わりに点のアニメーション）
    if (cond !== "circle") {
      if (k.startsWith("face")) s.img("face_ex", W / 2 - 90, 74, 180, 180);
      else s.img(k + "_ex", W / 2 - 180, 74, 360, 180);
    }
    const ty = 262;
    if (cond === "weak" && !k.startsWith("face")) {
      s.textC(`${step.name}に「1回目より少し弱めに」出して、正面で静止してください`, ty, FS.md, COL.yellow);
    } else if (cond === "circle") {
      const what = k === "face" ? "舌をしまったまま" : k === "face_open" ? "口を大きく開けたまま" : `舌を${step.name}に普通の強さで出したまま`;
      s.textC(`${what}、中央の点を鼻先で追ってください`, ty, FS.md, COL.yellow);
      s.textC("※顔を小さく1周させます。顔の向きが変わっても判定できるように学習します", ty + 32, FS.sm, rgb(200, 200, 200));
    } else if (k === "face_open") {
      s.textC("舌は出さずに口を大きく開け、正面で静止してください", ty, FS.md, COL.green);
      s.textC("※口を開けただけの状態を「舌なし」として学習し、誤判定を防ぎます", ty + 32, FS.sm, rgb(200, 200, 200));
    } else if (k === "face") {
      const roll = raw.roll ?? 0, yaw = raw.yaw ?? 1;
      const straight = Math.abs(roll) <= 0.06 && yaw >= 0.33 && yaw <= 3.0;
      const msg = straight ? "舌をしまったまま、この状態で記録してください" : Math.abs(roll) > 0.06 ? "顔の傾きをまっすぐにしてください" : yaw < 0.33 ? "もう少し右（正面）を向いてください" : "もう少し左（正面）を向いてください";
      s.textC(msg, ty, FS.md, straight ? COL.green : COL.red);
      s.textC("※この数値パターンが「舌を出していない基準（none）」として学習されます", ty + 32, FS.sm, rgb(200, 200, 200));
    } else {
      s.textC(`${step.name}に出して、正面で静止してください`, ty, FS.md, COL.white);
      const vec = `現在値: [ 下:${raw.down} 左:${raw.left} 右:${raw.right} 前:${raw.front} ]`;
      if (k === "up") s.textC(`(唇の比率: ${(raw.lip_ratio ?? 1).toFixed(3)})  ${vec}`, ty + 32, FS.sm, rgb(255, 230, 109));
      else s.textC(vec, ty + 32, FS.sm, rgb(255, 230, 109));
    }
    if (k === "up") s.text("※上方向は唇の厚み比率・重心位置・各方向数値を組み合わせて学習します", 130, 432, 14, rgb(230, 230, 230), "left", 520);

    // 警告
    let warn = e.state.faceWarning;
    if (cond !== "circle" && k.startsWith("face")) warn = "";
    if (cond === "circle" && warn) warn = "動かしすぎ（この間は記録されません）";
    if (this.calibPhase === "recording" && this.calibWaiting && cond !== "circle") warn = (warn || "顔の向きを直してください") + "（直すと記録が始まります）";
    if (!e.faceFound && this.calibPhase !== "idle") warn = "顔が見つかりません";
    if (warn) s.textC(warn, 318, FS.md, COL.red);
    else if (this.calibMsg) s.textC(this.calibMsg, 318, FS.md, COL.red);

    // 顔を動かす回：鼻先で追う点
    if (cond === "circle") {
      const gcx = W / 2, gcy = 162, gr = 68;
      s.circle(gcx, gcy, gr, null, rgb(70, 70, 80), 3);
      s.circle(gcx, gcy, 5, rgb(90, 90, 100));
      const el = this.calibPhase === "recording" ? performance.now() / 1000 - this.calibStartT : 0;
      const gt = Math.max(0, el - CALIB_SKIP_SEC) / CIRCLE_SEC;
      const ang = -Math.PI / 2 + 2 * Math.PI * Math.min(1, gt);
      if (gt > 0) {
        const c = s.ctx; c.beginPath(); c.arc(gcx, gcy, gr, -Math.PI / 2, ang); c.strokeStyle = rgb(150, 125, 40); c.lineWidth = 4; c.stroke();
      }
      s.circle(gcx + gr * Math.cos(ang), gcy + gr * Math.sin(ang), 14, COL.yellow);
      s.textC(this.calibPhase === "recording" ? "鼻先で追う" : "「記録する」を押すと、カウントの後に点が動き出します", gcy + gr + 10, FS.sm, rgb(200, 200, 200));
    }
    // カウントダウン
    if (this.calibPhase === "countdown") {
      const n = 3 - Math.floor((performance.now() - this.countStart) / 1000);
      s.circle(W / 2, 162, 56, "rgba(0,0,0,0.75)", COL.yellow, 3);
      s.text(String(Math.max(1, n)), W / 2, 162 - 30, FS.xl + 12, COL.yellow, "center");
    }
    // 記録ボタン
    const bx = W / 2 - 160, by = 350, bw = 320, bh = 56;
    s.rrect(bx, by, bw, bh, 8, rgb(80, 80, 80));
    if (this.calibPhase === "recording") {
      const total = cond === "circle" ? CALIB_SEC_R2 : CALIB_SEC_R1;
      const el = performance.now() / 1000 - this.calibStartT;
      s.rrect(bx, by, Math.max(0, Math.min(bw, bw * el / total)), bh, 8, COL.green);
      s.text(`記録中… 残り ${Math.max(0, total - el).toFixed(1)}秒`, W / 2, by + 15, FS.md, COL.white, "center");
    } else if (this.calibPhase === "countdown") {
      s.text("舌を出して待ってください", W / 2, by + 15, FS.md, COL.white, "center");
    } else {
      s.rrect(bx, by, bw, bh, 8, COL.teal);
      s.text("記録する", W / 2, by + 15, FS.md, COL.bg, "center");
      s.hotspot(bx, by, bw, bh, () => this.startRecording());
    }
    s.button(660, 420, 120, 48, "やめる", () => this.quitCalibration(), { bg: rgb(80, 80, 80), fg: COL.white });
  }
  quitCalibration() {
    this.cancelRecording();
    // 測定前の値に戻す（測定済みのモデルがあればそれに戻る）
    this.userCalib = clone(this.user.calib || DEFAULT_CALIB);
    this.engine.userCalib = this.userCalib;
    this.setScene(this.model ? "HOME" : "CALIB_INTRO");
  }

  draw_CALIB_CONFIRM() {
    const s = this.scr, step = CALIB_STEPS[this.calibIdx];
    s.textC(`【${step.name}】 の確認 (${this.calibRound}/${CALIB_PLAN.length}回目)`, 60, FS.lg, COL.teal);
    s.textC(this.calibRound < CALIB_PLAN.length ? `この状態で記録して、${this.calibRound + 1}回目を測定しますか？` : "この状態で記録して、次の方向へ進みますか？", 120, FS.md, COL.white);
    s.textC(this.calibRound === 1 ? "※1回目の値が、この方向の基準値になります" : "※2・3回目は判定の学習にだけ使います（基準値は1回目のまま）", 150, 15, "#AAA");
    const p = this.pendingCalib || {};
    if (step.key.startsWith("face")) s.textC(`正面・舌なし基準データを ${this.pendingFeats.length} フレーム記録しました`, 180, FS.sm, COL.white);
    else s.textC(`取得値: [ 下:${p.down} 左:${p.left} 右:${p.right} 前:${p.front} ] (${this.pendingFeats.length}フレーム)`, 180, FS.sm, COL.white);
    if (step.key === "up" && p.lip_ratio_thresh !== undefined) s.textC(`設定される上唇の専用閾値: ${p.lip_ratio_thresh.toFixed(4)} (測定平均 × 1.15)`, 210, FS.sm, COL.teal);
    s.button(W / 2 - 150, 270, 135, 60, "はい", () => this.commitCalibStep(), { bg: COL.green });
    s.button(W / 2 + 15, 270, 135, 60, "戻る", () => { this.cancelRecording(); this.setScene("CALIBRATION"); }, { bg: COL.red, fg: COL.white });
  }

  draw_TRAINING() {
    const s = this.scr;
    s.textC("しばらくお待ちください…", 170, FS.lg, COL.teal);
    s.rrect(200, 232, 400, 18, 9, rgb(60, 60, 60));
    s.rrect(200, 232, Math.max(18, 400 * this.trainProgress), 18, 9, COL.teal);
    s.textC(this.trainMsg || "", 266, FS.sm, "#BBB");
    s.textC("（端末によっては30秒ほどかかります。画面を閉じないでください）", 292, FS.sm, "#888");
  }

  // =====================================================
  // チュートリアル
  // =====================================================
  draw_TUTORIAL_INTRO() {
    const s = this.scr;
    s.textC("静止状態の測定が完了しました！", 50, FS.lg, COL.teal);
    s.textC("次に、チュートリアルを通じて「プレイ中の自然なブレ」を測定します。", 108, FS.md, COL.white);
    s.textC("・チュートリアル曲（くるみ割り人形 NORMAL）をプレイしてください", 166, FS.sm, COL.white);
    s.textC("※チュートリアル中はスコアやMISSなどの判定は行われません", 196, FS.sm, COL.yellow);
    s.segments([["準備ができたら", COL.white], ["「スタート」", COL.teal], ["を押してください", COL.white]], 244, FS.md);
    s.button(W / 2 - 110, 300, 220, 60, "スタート", () => this.startSong(SONG_TUTORIAL, true), { bg: COL.green });
  }

  // =====================================================
  // プレイ
  // =====================================================
  async startSong(song, tutorial) {
    this.audio.unlock();
    this.setScene("LOADING");
    try {
      const [bm, buf] = await Promise.all([fetch(song.beatmap).then((r) => r.json()), this.audio.load(song.audio)]);
      this.beatmap = bm.map((n) => {
        const note = { time: n.time, type: n.type, active: true };
        if ("duration" in n) { note.duration = n.duration; note.isHolding = false; note.missMs = 0; }
        return note;
      });
      this.song = song; this.tutorial = tutorial;
      this.score = 0; this.combo = 0; this.missCount = 0;
      this.feedback = { text: "", until: 0, x: 400 };
      this.lastElapsed = 0;
      this.normaThisPlay = { up: 0, down: 0, left: 0, right: 0, front: 0 };
      this.justCleared = false;
      if (tutorial) { this.tutorialData = { up: [], down: [], left: [], right: [], front: [] }; this.lastTutorialFeatId = -1; }
      else this.beginPlayLog();
      this.audio.setVolumes(this.config.bgm_vol, this.config.se_vol);
      this.audio.playBuffer(buf, 0);
      this.setScene("PLAYING");
    } catch (e) {
      console.error(e);
      this.popup("曲の読み込みに失敗しました。通信を確認してください", 3000, COL.red);
      this.setScene(tutorial ? "TUTORIAL_INTRO" : "HOME");
    }
  }
  draw_LOADING() { this.scr.textC("読み込み中…", 200, FS.lg, COL.teal); }

  // 記録（1プレイ）
  beginPlayLog() {
    const today = localDate();
    const d = this.todayRec();
    d.plays++;
    this.play = {
      user_id: this.user.id, play_id: `${today.replace(/-/g, "")}-${String(this.plays.length + 1).padStart(3, "0")}`,
      started_at: jst(), ended_at: "", completed: 0, song: this.song.title, difficulty: this.song.diff || "NORMAL", device: "phone", score: 0,
      excellent: 0, nice: 0, perfect: 0, miss: 0, max_count: 0,
      norma_up: 0, norma_down: 0, norma_left: 0, norma_right: 0, norma_front: 0,
      hold_sec_up: 0, hold_sec_down: 0, hold_sec_left: 0, hold_sec_right: 0, hold_sec_front: 0,
      shoulder_hits: 0, face_warning_ratio: 0, shoulder_missing_ratio: 0, avg_fps: 0,
      offset: this.config.offset, speed: this.config.speed_mult,
      user_agent: navigator.userAgent, app_version: APP_VERSION, model_version: this.modelVersionStr(),
      timing_mean_ms: "", timing_median_ms: "", timing_n: 0,
      _frames: 0, _warn: 0, _shMiss: 0, _activeMs: 0, _td: [],
    };
    this.plays.push(this.play);
    this.saveLogs();
  }
  finishPlayLog(completed) {
    const p = this.play; if (!p) return;
    p.ended_at = jst(); p.completed = completed ? 1 : 0;
    p.score = Math.min(1000000, Math.trunc(this.score));
    p.miss = this.missCount;
    p.face_warning_ratio = p._frames ? +(p._warn / p._frames).toFixed(3) : 0;
    p.shoulder_missing_ratio = p._frames ? +(p._shMiss / p._frames).toFixed(3) : 0;
    const sec = Math.max(0.001, p._activeMs / 1000);
    p.avg_fps = +(p._frames / sec).toFixed(1);
    for (const d of NORMA_ORDER) p["hold_sec_" + d] = +p["hold_sec_" + d].toFixed(2);
    Object.assign(p, timingStats(p._td));
    delete p._td;
    this.lastTiming = p.timing_n ? { mean: p.timing_mean_ms, n: p.timing_n } : null;
    if (completed) this.todayRec().completed_plays++;
    const row = {}; for (const [k, v] of Object.entries(p)) if (!k.startsWith("_")) row[k] = v;
    this.sync.addPlay(row);   // 記録を送る（通信できなければ、あとで送り直す）
    this.play = null;
    this.saveLogs();
  }
  logCalib(r) {
    this.calibLog.push(r);
    dbSet("caliblog:" + this.user.id, this.calibLog).catch(() => {});
    this.sync.addCalib({ user_id: this.user.id, ...r });
  }
  // 今日のノルマ（PC とスマホの合計）
  todayCounts() { return this.sync.combinedToday(this.daily[localDate()] || {}); }
  todayCleared() { return this.sync.isCleared(this.todayCounts()); }
  todayRec() {
    const today = localDate();
    if (!this.daily[today]) this.daily[today] = { up: 0, down: 0, left: 0, right: 0, front: 0, cleared: 0, cleared_at: "", plays: 0, completed_plays: 0 };
    return this.daily[today];
  }
  saveLogs() {
    if (!this.user) return;
    const plays = this.plays.map((p) => { const o = {}; for (const [k, v] of Object.entries(p)) if (!k.startsWith("_")) o[k] = v; return o; });
    dbSet("daily:" + this.user.id, this.daily).catch(() => {});
    dbSet("plays:" + this.user.id, plays).catch(() => {});
  }
  addNorma(k) {
    const wasCleared = this.todayCleared();
    const d = this.todayRec();
    d[k] = (d[k] || 0) + 1;              // この端末で数えた回数（CSV 用）
    this.sync.addNorma(k, localDate());   // PC との合計のために送る
    this.normaThisPlay[k]++;
    if (this.play) this.play["norma_" + k]++;
    this.popup(`${DIR_JA[k]} +1`, 1200, COL.yellow, FS.md, 92);
    if (!wasCleared && !d.cleared && this.todayCleared()) {
      d.cleared = 1; d.cleared_at = jst(); this.justCleared = true;
      this.popup("今日のトレーニング クリア！", 2500, COL.yellow, FS.lg, 200);
    }
    this.saveLogs();   // 数えた瞬間に保存（途中でやめても残る）
  }

  // カメラの新しいフレームごと（記録用の集計・チュートリアルの学習データ集め）
  onVisionFrame() {
    if (this.scene === "CALIBRATION") { this.calibOnFrame(); return; }
    if (this.scene !== "PLAYING") return;
    const e = this.engine;
    if (!this.tutorial && this.play) {
      this.play._frames++;
      if (e.state.faceWarning) this.play._warn++;
      if (e.state.shoulderMissing) this.play._shMiss++;
      return;
    }
    if (!this.tutorial) return;
    // PC版：単発ノーツは 150ms前〜500ms後、ロングノーツは開始400ms後から終わりまで
    const pack = e.featPack;
    if (!pack || pack.id === this.lastTutorialFeatId) return;
    const elapsed = this.audio.elapsedMs();
    for (const note of this.beatmap) {
      if (!note.active) continue;
      const nType = note.type;
      if (!(nType in this.tutorialData)) continue;
      const adj = note.time + this.config.offset * 10, td = adj - elapsed;
      let ok = false;
      if ("duration" in note) { const tail = adj + note.duration - elapsed; ok = td < -400 && tail > 0; }
      else ok = td > -500 && td < 150;
      if (!ok) continue;
      this.lastTutorialFeatId = pack.id;
      if (this.acceptTutorialFrame(pack, nType)) this.tutorialData[nType].push(pack.feat);
      break;
    }
  }
  // PC版 accept_tutorial_frame：明らかに舌が出ていないフレームを除く
  acceptTutorialFrame(pack, nType) {
    if (!this.model) return true;
    const p = pack.rawProbs; if (!p) return false;
    return (p[nType] ?? 0) >= 0.15 && (p.face ?? 0) < 0.5;
  }

  draw_PLAYING() { this.drawGame(false); }
  draw_RESUME_COUNTDOWN() { this.drawGame(true); }

  drawGame(countdown) {
    const s = this.scr, e = this.engine, st = e.state;
    const elapsed = this.audio.elapsedMs();
    const dt = Math.max(0, Math.min(250, elapsed - this.lastElapsed));   // PC版 1119_2 と同じく 250ms まで
    this.lastElapsed = elapsed;
    const now = performance.now();
    if (this.play && !countdown && this._lastNow) this.play._activeMs += Math.min(100, now - this._lastNow);
    this._lastNow = now;

    if (!countdown && elapsed >= this.song.end_time) {
      this.audio.stopMusic();
      if (this.tutorial) { this.finishTutorial(); return; }
      this.score = Math.min(1000000, Math.trunc(this.score));
      this.finishPlayLog(true);
      this.updateRecord(this.score);
      this.setScene("RESULT");
      return;
    }
    const approach = 10000 / this.config.speed_mult, thick = 0.02;
    // レーン
    for (let i = -4; i < 4; i++) {
      const [tx, ty] = p3d(i + 0.5, 0), [bx, by] = p3d(i + 0.5, 2.0);
      s.line(tx, ty, bx, by, rgb(50, 50, 50), 2);
    }
    const jp = [p3d(-3.5, 1 - thick), p3d(3.5, 1 - thick), p3d(3.5, 1 + thick), p3d(-3.5, 1 + thick)];
    s.poly(jp, rgb(40, 40, 50), COL.white, 2);
    for (const t of ["shoulder_L", "left", "up", "front", "down", "right", "shoulder_R"]) {
      const [ix, iy] = p3d(laneIndex(t), 1.1);
      s.img(t, ix - 30, iy - 30, 60, 60);
    }

    if (!countdown) {
      if (this.tutorial) this.updateTutorialNotes(elapsed);
      else this.updateNotes(elapsed, dt, st, now);
    }
    // ノーツ
    for (let i = this.beatmap.length - 1; i >= 0; i--) {
      const note = this.beatmap[i];
      if (!note.active) continue;
      const adj = note.time + this.config.offset * 10, td = adj - elapsed;
      const li = laneIndex(note.type);
      const progress = 1.0 - td / approach;
      if ("duration" in note) {
        const tailDiff = adj + note.duration - elapsed, tailP = 1.0 - tailDiff / approach;
        if (progress > -0.1 && tailP < 2.0) {
          const top = Math.max(0, tailP); let bot = Math.max(0, progress);
          if (note.isHolding) bot = Math.min(1.0, bot);
          s.poly([p3d(li - 0.5, top), p3d(li + 0.5, top), p3d(li + 0.5, bot), p3d(li - 0.5, bot)], note.isHolding ? rgb(200, 180, 50) : rgb(50, 150, 140));
        }
      }
      if ((progress > -0.1 && progress < 2.0) || note.isHolding) {
        let top, bot;
        if (note.isHolding) { top = 1.0 - thick; bot = 1.0 + thick; }
        else { top = Math.max(0, progress - thick); bot = Math.max(0, progress + thick); }
        const col = note.type.includes("shoulder") ? rgb(231, 76, 60) : (note.duration || 0) >= 5000 ? rgb(255, 215, 0) : rgb(78, 205, 196);
        s.poly([p3d(li - 0.5, top), p3d(li + 0.5, top), p3d(li + 0.5, bot), p3d(li - 0.5, bot)], col, COL.white, 2);
      }
    }
    // 判定文字
    if (now < this.feedback.until && !this.tutorial) {
      const fb = this.feedback.text;
      s.text(fb, this.feedback.x, JUDGE_Y - 52, FS.md, (fb.includes("Hold") || fb.includes("MAX")) ? COL.yellow : COL.teal, "center");
    }
    // 左上
    if (this.tutorial) {
      s.text("【チュートリアル中】判定はありません", 20, 16, FS.md, COL.yellow);
      s.text("お手本に合わせて舌を出してください", 20, 48, FS.sm, COL.yellow);
    } else {
      s.text(`SCORE: ${Math.min(1000000, Math.trunc(this.score))}`, 20, 16, FS.md, COL.white);
      if (this.combo > 1) s.text(`${this.combo} COMBO!`, 20, 50, FS.md, COL.yellow);
      s.text(`MISS: ${this.missCount}`, 20, this.combo > 1 ? 84 : 50, FS.md, COL.red);
    }
    // 一時停止ボタン
    const pb = [W - 70, H - 70, 60, 60];
    s.rrect(...pb, 10, rgb(100, 100, 100));
    s.rect(pb[0] + 18, pb[1] + 15, 8, 30, COL.white); s.rect(pb[0] + 34, pb[1] + 15, 8, 30, COL.white);
    if (!countdown) s.hotspot(pb[0] - 6, pb[1] - 6, 72, 72, () => { this.audio.pause(); this.setScene("PAUSE"); });
    // 右上「あなたの状況」
    if (!this.tutorial) {
      const px = W - 210, py = 10, pw = 200, ph = 130;
      s.rect(px, py, pw, ph, "#000");
      s.ctx.strokeStyle = COL.white; s.ctx.lineWidth = 2; s.ctx.strokeRect(px, py, pw, ph);
      s.text("あなたの状況", px + pw / 2, py + 6, FS.md - 2, COL.white, "center");
      s.line(px, py + 36, px + pw, py + 36, COL.white); s.line(px + pw / 2, py + 36, px + pw / 2, py + ph, COL.white);
      s.imgC(st.tongueDir in DIR_JA ? st.tongueDir : "none", px + pw / 4, py + 83, 80, 80);
      const sk = st.shoulderAngle === -20 ? "shoulder_L" : st.shoulderAngle === 20 ? "shoulder_R" : "shoulder_no";
      s.imgC(sk, px + pw * 3 / 4, py + 83, 80, 80);
      let wy = py + ph + 8;
      for (const w of [st.faceWarning, st.shoulderMissing ? "肩が映っていません" : ""]) {
        if (!w) continue;
        const ww = s.measure(w, FS.md);
        s.text(w, Math.min(px + pw / 2 - ww / 2, W - 10 - ww), wy, FS.md, COL.red);
        wy += 30;
      }
    }
    if (countdown) {
      const el = now - this.countdownStart, remain = 3 - Math.floor(el / 1000);
      if (remain <= 0) { this.audio.resume(); this.lastElapsed = this.audio.elapsedMs(); this.setScene("PLAYING"); }
      else {
        s.rect(0, 0, W, H, "rgba(0,0,0,0.6)");
        s.textC("READY...", H / 2 - 80, FS.lg, COL.white);
        s.textC(String(remain), H / 2 - 10, FS.xl, COL.yellow);
      }
    }
  }

  // PC版：チュートリアル中のノーツ（判定なし・効果音だけ）
  updateTutorialNotes(elapsed) {
    for (const note of this.beatmap) {
      if (!note.active) continue;
      const adj = note.time + this.config.offset * 10, td = adj - elapsed;
      if ("duration" in note) {
        const tail = adj + note.duration - elapsed;
        if (td <= 0 && !note.playedSe) { this.audio.playSE(); note.playedSe = true; }
        if (td < 100 && tail > 0) note.isHolding = true;
        if (tail <= 0) { note.active = false; note.isHolding = false; }
      } else {
        if (td <= 0 && !note.playedSe) { this.audio.playSE(); note.playedSe = true; }
        if (td <= -500) note.active = false;
      }
    }
  }

  // PC版：通常プレイの判定と得点（60fps前提の数え方は時間基準に直した）
  updateNotes(elapsed, dt, st, now) {
    const setFb = (text, frames) => { this.feedback.text = text; this.feedback.until = now + frames / 60 * 1000; };
    const maxP = 1000000.0 / Math.max(1, this.beatmap.length);
    for (const note of this.beatmap) {
      if (!note.active) continue;
      const adj = note.time + this.config.offset * 10, td = adj - elapsed;
      const li = laneIndex(note.type), nType = note.type;
      let ok = false;
      if (nType === st.tongueDir) ok = true;
      else if (nType === "shoulder_L" && st.shoulderAngle === -20) ok = true;
      else if (nType === "shoulder_R" && st.shoulderAngle === 20) ok = true;

      if ("duration" in note) {
        const tail = adj + note.duration - elapsed;
        if (!note.isHolding) {
          if (td > -400 && td < 200 && ok) {
            note.isHolding = true; note.earned = 0; note.missMs = 0;
            if (this.play) this.play._td.push(td);   // 追加(1.3.2): 取ったときのずれ（＋＝早い）
            this.feedback.x = p3d(li, 1.0)[0]; setFb("Hold", 10); this.audio.playSE();
          } else if (td <= -400) {
            note.active = false; this.missCount++; this.combo = 0; setFb("MISS", 30);
          }
        } else {
          // 1. 正解していた時間 ÷ ノーツの長さ × 満点（MAXパワーでない間は ×0.8）
          if (ok) {
            note.missMs = 0;
            let add = maxP * dt / note.duration * (st.isFullPower ? 1 : 0.8);
            const cur = note.earned || 0;
            if (cur + add > maxP) add = maxP - cur;
            this.score += add; note.earned = cur + add;
            setFb(st.isFullPower ? "MAX Hold!!" : "Hold", 5);
            if (this.play && nType in DIR_JA) this.play["hold_sec_" + nType] += dt / 1000;
          } else note.missMs += dt;
          // 2. 終端
          if (tail < 0) {
            note.active = false; note.isHolding = false;
            const fin = note.earned || 0;
            if (fin >= maxP * 0.3) {
              this.combo++;
              if (fin >= maxP * 0.8) { const bonus = maxP - fin; if (bonus > 0) { this.score += bonus; note.earned += bonus; } }
              setFb("Perfect!", 30); this.audio.playSE();
              if (this.play) { this.play.perfect++; if (nType.startsWith("shoulder")) this.play.shoulder_hits++; }
              // ノルマ（長さ5秒以上のロングノーツ）
              if ((note.duration || 0) >= 5000) {
                let tk = null;
                if (["up", "down", "front"].includes(nType)) tk = nType;
                else if (nType === "right" && st.shoulderAngle === -20) tk = "right";
                else if (nType === "left" && st.shoulderAngle === 20) tk = "left";
                if (tk) this.addNorma(tk);
              }
            } else { this.missCount++; this.combo = 0; setFb("MISS", 30); }
          } else if (note.missMs > 1000) {   // 3. 不正解が1秒続いたらホールド切れ
            note.active = false; note.isHolding = false; this.missCount++; this.combo = 0; setFb("MISS", 30);
          }
        }
      } else {
        if (td > -400 && td < 200) {
          if (ok) {
            note.active = false; this.combo++;
            this.feedback.x = p3d(li, 1.0)[0]; this.audio.playSE();
            if (this.play) this.play._td.push(td);   // 追加(1.3.2): 取ったときのずれ（＋＝早い）
            if (Math.abs(td) <= 100) {
              this.score += st.isFullPower ? maxP : maxP * 0.8;
              setFb(st.isFullPower ? "Excellent!! (MAX)" : "Excellent!!!", 30);
              if (this.play) this.play.excellent++;
            } else {
              this.score += st.isFullPower ? maxP * 0.7 : maxP * 0.5;
              setFb(st.isFullPower ? "Nice! (MAX)" : "Nice!", 30);
              if (this.play) this.play.nice++;
            }
            if (this.play) { if (st.isFullPower) this.play.max_count++; if (nType.startsWith("shoulder")) this.play.shoulder_hits++; }
          }
        } else if (td <= -400) {
          note.active = false; this.missCount++; this.combo = 0;
          this.feedback.x = p3d(li, 1.0)[0]; setFb("MISS", 30);
        }
      }
    }
  }

  async finishTutorial() {
    this.tutorial = false;
    this.setScene("TRAINING"); this.trainMsg = "チュートリアルの動きを学習しています"; this.trainProgress = 0;
    for (const k of Object.keys(this.tutorialData)) {
      if (k in this.calibDataset) {
        let dyn = this.tutorialData[k];
        if (dyn.length > 200) dyn = shuffle(dyn, 200);
        this.calibDataset[k].push(...dyn);
      }
    }
    const ok = await this.trainAndSave();
    if (!ok) this.popup("学習に失敗しました（測定のときのモデルを使います）", 4000, COL.red);
    this.testState = "IDLE";
    this.setScene("CHECK_DETECTION");
  }

  updateRecord(score) {
    const key = `${this.song.title}____${this.song.diff}`;
    this.user.scores ||= {};
    const rec = this.user.scores[key] || { high: 0, last: 0 };
    this.prevScore = rec.last; this.isNewRecord = score > rec.high;
    this.user.scores[key] = { high: Math.max(rec.high, score), last: score };
    this.saveUser();
  }
  getRecord(title = this.song && this.song.title, diff = (this.song && this.song.diff) || "NORMAL") {
    return (this.user && this.user.scores && this.user.scores[`${title}____${diff}`]) || { high: 0, last: 0 };
  }

  // =====================================================
  // 曲選択（左：曲、右：コース（難易度）／みんなのランキング）
  // =====================================================
  draw_SONG_SELECT() {
    const s = this.scr;
    this.sync.refresh();
    if (this.sync.needsChoice()) { this.goRankAsk("first"); return; }   // 追加(1.4.0): ランキングへの参加をまだ選んでいなければ、先に聞く
    s.text(`PLAYER: ${this.user ? this.user.id : ""}`, 20, 10, FS.sm, COL.yellow);
    s.textC("曲を選ぶ", 8, FS.lg, COL.teal, 300);
    const st = this.sync.statusText();
    if (st) s.text(st, W - 20, 12, 14, rgb(232, 176, 192), "right");
    // 曲
    SONGS.forEach((song, i) => {
      const y = 56 + i * 82, sel = i === this.selSong;
      s.rrect(20, y, 250, 72, 10, sel ? "rgba(78,205,196,0.16)" : "#1C1C26", sel ? COL.teal : "#555", sel ? 3 : 1);
      s.text(song.title, 34, y + 10, FS.md, COL.white, "left", 222);
      const best = Math.max(...DIFFS.map((d) => this.getRecord(song.title, d).high));
      s.text(`HIGH: ${best.toLocaleString()}`, 34, y + 42, 15, "#AAA");
      s.hotspot(20, y, 250, 72, () => { this.selSong = i; });
    });
    s.text("曲の中身はどれも同じ譜面です", 24, 306, 14, "#777");
    // 右：選んだ曲
    const song = SONGS[this.selSong];
    const px = 290, pw = 490;
    s.rrect(px, 50, pw, 352, 12, "#16161E", "#444", 1);
    s.text(song.title, px + 18, 66, FS.md, COL.white, "left", pw - 250);
    // タブ：コース／みんなのランキング
    const tab = (x, label, on, fn) => {
      s.rrect(x, 62, 98, 34, 8, on ? COL.teal : "#2A2A36", on ? null : "#555", 1);
      s.text(label, x + 49, 70, 15, on ? COL.bg : "#CCC", "center", 90);
      s.hotspot(x, 58, 98, 42, fn);
    };
    tab(px + pw - 214, "コース", !this.rankView, () => { this.rankView = false; });
    tab(px + pw - 110, "ランキング", this.rankView, () => { this.rankView = true; this.sync.refresh(true); });
    s.line(px + 14, 106, px + pw - 14, 106, "#444", 1);
    DIFFS.forEach((d, j) => {
      const ry = 114 + j * 94, en = DIFF_ENABLED[d];
      if (j) s.line(px + 14, ry - 6, px + pw - 14, ry - 6, "#333", 1);
      s.text(d, px + 18, ry + 6, FS.md, en || this.rankView ? DIFF_COL[d] : "#555");
      if (!this.rankView) {
        const rec = this.getRecord(song.title, d);
        if (en) {
          s.text(`HIGH: ${rec.high.toLocaleString()}`, px + 150, ry + 8, FS.md - 2, COL.white);
          s.text(`前回: ${rec.last.toLocaleString()}`, px + 150, ry + 40, 15, "#AAA");
          s.button(px + pw - 150, ry + 10, 132, 56, "これで遊ぶ", () => { this.placementMode = "play"; this.setScene("PLACEMENT"); }, { bg: COL.green, size: FS.sm + 2 });
        } else s.text("準備中", px + 150, ry + 14, FS.md, "#555");
      } else {
        const top = this.sync.top3(song.title, d);
        let msg = "";
        if (!this.sync.enabled) msg = "通信の設定がありません";
        else if (top === null) msg = this.sync.online === false ? "ランキングを読み込めませんでした" : "読み込み中…";
        else if (!top.length) msg = "まだ記録がありません";
        if (msg) s.text(msg, px + 150, ry + 22, 15, "#888");
        else for (let k = 0; k < 3; k++) {
          const yy = ry + 2 + k * 26, e = top[k];
          if (!e) { s.text(`${k + 1}位  —`, px + 150, yy, 16, "#555"); continue; }
          const mp = this.sync.myProfile(), me = this.user && (e.name === this.user.id || (mp && mp.ranking && e.name === mp.name));
          s.text(`${e.rank}位  ${e.name}`, px + 150, yy, 16, me ? COL.yellow : COL.white, "left", 190);
          s.text(Number(e.score).toLocaleString(), px + pw - 24, yy, 16, me ? COL.yellow : COL.white, "right");
        }
      }
    });
    if (this.rankView) {
      const t = this.sync.rankingTime();
      if (t) s.text(`${t.slice(5, 16).replace("-", "/")} 時点${this.sync.online === false ? "（オフライン）" : ""}`, px + pw - 18, 384, 13, "#888", "right");
      s.text("曲・難易度ごとのトップ3（参加者IDと得点）", px + 18, 384, 13, "#888");
    }
    s.button(130, 420, 160, 50, "ホームへ", () => this.setScene("HOME"), { bg: rgb(80, 80, 80), fg: COL.white, size: FS.sm + 2 });
  }

  // =====================================================
  // 一時停止
  // =====================================================
  draw_PAUSE() {
    const s = this.scr;
    if (!this.tutorial) s.textC(`SCORE: ${Math.min(1000000, Math.trunc(this.score))}`, 40, FS.xl, COL.white);
    else s.textC("チュートリアル（一時停止中）", 50, FS.lg, COL.yellow);
    s.button(W / 2 - 130, 140, 260, 56, "ゲーム再開", () => { this.countdownStart = performance.now(); this.setScene("RESUME_COUNTDOWN"); }, { bg: COL.green });
    s.button(W / 2 - 130, 210, 260, 56, "ルール説明", () => { this.ruleReturn = "PAUSE"; this.setScene("PAUSE_RULE"); }, { bg: COL.teal });
    s.button(W / 2 - 130, 280, 260, 56, "中断する", () => this.setScene("PAUSE_CONFIRM"), { bg: COL.red, fg: COL.white });
  }
  draw_PAUSE_RULE() {
    const s = this.scr;
    s.textC("ルール説明 ＆ 高得点のコツ", 10, FS.md, COL.teal);
    const L = [
      ["【基本のあそびかた】", COL.yellow], ["音楽に合わせて奥から流れてくる「ノーツ（的）」が判定ラインに重なるタイミングで", COL.white],
      ["指定の方向（上・下・左・右・前）へ舌を出しましょう！ 赤いノーツは肩を下げます", COL.white],
      ["【ノーツの種類】", COL.yellow], ["・通常ノーツ： タイミングよく「パッ」と舌を出す！", COL.white],
      ["・ロングノーツ： 帯が通り過ぎるまで舌を「出し続ける」！", COL.white],
      ["【高得点のヒミツ（スコアの仕組み）】", COL.yellow], ["スコアは「タイミング」と「舌の思い切り度（パワー）」の2つで決まります！", COL.white],
      ["1. タイミング（ラインに重なる瞬間に近いほど高得点！）", COL.teal],
      ["  ・Excellent!! ＝ 完璧！（最高得点） / Nice! ＝ 少しズレた（通常得点）", COL.white],
      ["  ・MISS ＝ 外れた・方向間違い（無得点）", COL.red], ["2. 舌のパワー", COL.teal],
      ["  限界まで思い切り舌を突き出すと【MAX】判定でスコアボーナス獲得！", COL.white],
      ["  ★恥ずかしがらずに、おもいっきり舌を伸ばすのがハイスコアの鍵！", rgb(255, 230, 109)],
      ["【今日のノルマ】 5秒以上の金色のロングノーツを最後まで続けると1回。各方向3回でクリア", COL.yellow],
    ];
    let y = 40;
    L.forEach(([t, c], i) => { if (i && t.startsWith("【")) y += 5; s.text(t, 60, y, FS.sm, c, "left", 690); y += 22; });
    s.button(W / 2 - 100, H - 64, 200, 52, "戻る", () => this.setScene(this.ruleReturn), { bg: rgb(80, 80, 80), fg: COL.white });
  }
  draw_PAUSE_CONFIRM() {
    const s = this.scr;
    s.textC("ほんとうにやめますか？", 120, FS.lg, COL.white);
    s.textC(this.tutorial ? "※チュートリアルの学習は行われません" : "※スコアは保存されません（ここまでの今日のノルマは残ります）", 172, FS.sm, COL.red);
    s.button(W / 2 - 140, 240, 120, 56, "YES", () => this.abortPlay(), { bg: COL.red, fg: COL.white });
    s.button(W / 2 + 20, 240, 120, 56, "NO", () => this.setScene("PAUSE"), { bg: rgb(80, 80, 80), fg: COL.white });
  }
  abortPlay() {
    this.audio.stopMusic(); this.audio.paused = false;
    if (!this.tutorial) this.finishPlayLog(false);
    this.tutorial = false;
    this.setScene("HOME");
  }

  // =====================================================
  // 判定テスト
  // =====================================================
  draw_CHECK_DETECTION() {
    const s = this.scr, e = this.engine, st = e.state, raw = e.raw;
    s.textC("判定テスト・確認", 14, FS.lg, COL.teal);
    const ts = this.testState;
    if (ts !== "FINISH") {
      const pw = 460, ph = 220, px = W / 2 - pw / 2, py = ts === "IDLE" ? 62 : 176;
      s.rrect(px, py, pw, ph, 10, rgb(20, 20, 30), COL.teal, 2);
      s.text("現在の入力状況", px + pw / 2, py + 8, FS.md - 2, COL.white, "center");
      const ly = py + 40;
      s.line(px, ly, px + pw, ly, COL.teal); s.line(px + pw / 2, ly, px + pw / 2, py + ph, COL.teal);
      const td = st.tongueDir;
      s.imgC(td in DIR_JA ? td : "none", px + pw / 4, ly + 45, 80, 80);
      s.text(`舌: ${td}`, px + pw / 4, py + ph - 88, FS.md - 2, COL.white, "center");
      s.text(`確信度: ${(st.tongueRatio || 0).toFixed(2)} / パワー: ${(st.tonguePower || 0).toFixed(2)}`, px + pw / 4, py + ph - 56, 14, rgb(200, 200, 200), "center", pw / 2 - 10);
      s.text(`[ 下:${raw.down} 左:${raw.left} 右:${raw.right} 前:${raw.front} ]`, px + pw / 4, py + ph - 32, 14, COL.white, "center", pw / 2 - 10);
      const sk = st.shoulderAngle === -20 ? "shoulder_L" : st.shoulderAngle === 20 ? "shoulder_R" : "shoulder_no";
      s.imgC(sk, px + pw * 3 / 4, ly + 65, 80, 80);
      s.text(`肩: ${sk}`, px + pw * 3 / 4, py + ph - 44, FS.md - 2, COL.white, "center", pw / 2 - 10);
      if (st.faceWarning) s.textC(st.faceWarning, py + ph + 10, FS.md, COL.red);
      // 各方向の確率バー
      const probs = st.probs;
      if (probs) {
        const bx = px + pw + 12, by = py + 10;
        ["face", "up", "down", "left", "right", "front"].forEach((c, j) => {
          const v = probs[c] || 0, yy = by + j * 24;
          s.text(c, bx, yy, 14, rgb(220, 220, 220));
          s.rect(bx + 46, yy + 3, 60, 12, rgb(60, 60, 60));
          s.rect(bx + 46, yy + 3, 60 * v, 12, v >= 0.5 ? COL.green : v >= 0.3 ? COL.yellow : rgb(120, 120, 120));
        });
      }
    }
    if (ts === "IDLE") {
      s.button(W / 2 - 130, 330, 260, 52, "10問テストを開始", () => this.startTest(), { bg: COL.yellow });
      if (!this.model) s.textC("学習モデルがありません。先に測定してください", 296, FS.sm, COL.red);
    } else if (ts === "COUNTDOWN" || ts === "SHOW_RESULT") {
      const target = this.testQuestions[this.testIdx];
      s.textC(`第 ${this.testIdx + 1} 問: 【${DIR_JA[target]}】に出してください`, 64, FS.lg, COL.white);
      if (ts === "COUNTDOWN") {
        const el = performance.now() - this.testStart, remain = 3 - Math.floor(el / 1000);
        if (remain <= 0) {
          if (st.tongueDir === target) { this.testCorrect++; this.testMsg = "〇 正解！"; this.audio.playSE(); }
          else { this.testMsg = "× 不正解..."; if (!this.testMissed.includes(DIR_JA[target])) this.testMissed.push(DIR_JA[target]); }
          this.testState = "SHOW_RESULT"; this.testStart = performance.now();
        } else s.textC(String(remain), 108, FS.xl, COL.yellow);
      } else {
        s.textC(this.testMsg, 108, FS.xl, this.testMsg.includes("〇") ? COL.green : COL.red);
        if (performance.now() - this.testStart > 1000) {
          this.testIdx++;
          if (this.testIdx >= 10) this.finishTest();
          else { this.testState = "COUNTDOWN"; this.testStart = performance.now(); }
        }
      }
    } else if (ts === "FINISH") {
      s.textC("テスト終了！", 100, FS.lg, COL.white);
      s.textC(`正答率: ${this.testCorrect} / 10`, 150, FS.xl, COL.white);
      s.textC("ミスした方向: " + (this.testMissed.length ? this.testMissed.join(", ") : "なし"), 220, FS.md, COL.white);
      if (this.testCorrect <= 7) {
        s.textC("測定のやり直しをおすすめします", 262, FS.md, COL.red);
        s.button(W / 2 - 150, 310, 300, 56, "測定をやり直す", () => { this.testState = "IDLE"; this.placementMode = "recalib"; this.setScene("PLACEMENT"); }, { bg: COL.red, fg: COL.white });
      } else if (this.firstFlow) {
        s.textC("準備完了です！ ホームから毎日トレーニングしましょう", 266, FS.md, COL.green);
      }
    }
    if (ts === "IDLE" || ts === "FINISH") {
      const hl = ts === "FINISH" && this.testCorrect >= 8;
      s.button(W - 190, H - 62, 170, 50, "ホームへ", () => { this.firstFlow = false; this.testState = "IDLE"; this.setScene("HOME"); },
        { bg: hl ? COL.green : rgb(80, 80, 80), fg: hl ? COL.bg : COL.white });
    }
  }
  startTest() {
    const fixed = ["up", "down", "left", "right", "front"];
    this.testQuestions = fixed.concat(Array.from({ length: 5 }, () => fixed[Math.floor(Math.random() * 5)]));
    this.testIdx = 0; this.testCorrect = 0; this.testMissed = [];
    this.testState = "COUNTDOWN"; this.testStart = performance.now();
  }
  finishTest() {
    this.testState = "FINISH";
    this.logCalib({ at: jst(), kind: "test", test_correct: this.testCorrect, missed_dirs: this.testMissed.join("・"), model_version: this.modelVersionStr() });
    dbSet("caliblog:" + this.user.id, this.calibLog).catch(() => {});
  }

  // =====================================================
  // ホーム
  // =====================================================
  normaChips(y, chipH = 58, small = false) {
    const s = this.scr, d = this.todayCounts();
    NORMA_ORDER.forEach((k, i) => {
      const v = d[k] || 0, done = v >= NORMA_GOAL;
      const x = 36 + i * 148, w = 136;
      s.rrect(x, y, w, chipH, 8, done ? "rgba(46,204,113,0.18)" : "#1C1C26", done ? COL.green : "#555", 2);
      s.text(DIR_JA[k], x + 14, y + chipH / 2 - (small ? 13 : 17), small ? FS.md : FS.lg, done ? COL.green : COL.white);
      s.text(`${v}/${NORMA_GOAL}`, x + (small ? 50 : 58), y + chipH / 2 - 13, FS.md, done ? COL.green : COL.white);
      if (done) s.text("✓", x + w - 30, y + chipH / 2 - 14, FS.md, COL.green);
    });
  }
  draw_HOME() {
    const s = this.scr;
    s.text(`PLAYER: ${this.user ? this.user.id : ""}`, 20, 10, FS.sm, COL.yellow);
    s.hotspot(10, 0, 220, 34, () => this.titleTap("HOME"));
    if (this.user && this.user.calibAt) s.text(`測定: じっくりコース（${this.user.calibAt.slice(5, 10).replace("-", "/")}）`, W - 20, 10, FS.sm, rgb(110, 110, 110), "right");
    this.sync.refresh();
    const st = this.sync.statusText();
    if (st) s.text(st, W / 2, 12, 14, rgb(232, 176, 192), "center");
    // 今日のノルマ（PC とスマホの合計）
    s.rrect(20, 36, 760, 134, 10, "#16161E", COL.teal, 2);
    s.text("今日のノルマ", 36, 46, FS.md, COL.white);
    if (this.todayCleared()) s.text("今日のトレーニング クリア！", 764, 46, FS.md, COL.yellow, "right");
    else s.text("各方向3回でクリア", 764, 52, FS.sm, "#999", "right");
    this.normaChips(80);
    s.text("※左・右は、反対の肩を下げながら舌を出したときに数えます", 36, 146, 15, "#AAA");
    // トレーニング開始
    s.button(20, 184, 370, 108, "トレーニング開始", () => { this.rankView = false; this.setScene("SONG_SELECT"); },
      { bg: COL.green, size: FS.lg, sub: "曲を選ぶ（1曲 約2分）", subColor: "#0B3D1F" });
    s.text("PC とスマホで遊んだ分は合計して数えます", 24, 302, FS.sm, COL.white);
    s.text("スマホは横向きでスタンドに立て、", 24, 326, 15, "#888");
    s.text("顔と両肩が映るように置いてください", 24, 346, 15, "#888");
    this.drawCalendar(410, 184, 370, 214);
    // 下のボタン
    const by = 420, bh = 50;
    s.button(130, by, 150, bh, "判定テスト", () => { this.testState = "IDLE"; this.setScene("CHECK_DETECTION"); }, { bg: COL.purple, fg: COL.white, size: FS.sm + 2 });
    s.button(290, by, 150, bh, "測り直し", () => { this.placementMode = "recalib"; this.setScene("PLACEMENT"); }, { bg: COL.yellow, size: FS.sm + 2 });
    s.button(450, by, 150, bh, "ルール説明", () => { this.ruleReturn = "HOME"; this.setScene("PAUSE_RULE"); }, { bg: COL.teal, size: FS.sm + 2 });
    s.button(610, by, 170, bh, "設定", () => { this.settingsBackup = { ...this.config }; this.setScene("SETTINGS"); }, { bg: rgb(100, 100, 100), fg: COL.white, size: FS.sm + 2 });
  }
  // 初回利用日から31日分のカレンダー（●クリア、△遊んだが未クリア）
  drawCalendar(x, y, w, h) {
    const s = this.scr;
    s.rrect(x, y, w, h, 10, "#16161E", "#444", 1);
    const start = (this.user && this.user.firstUseDate) || localDate();
    const end = addDays(start, 30);
    s.text(`記録（${start.slice(5).replace("-", "/")}〜${end.slice(5).replace("-", "/")}）`, x + 12, y + 8, 15, COL.white);
    s.text("●クリア △遊んだ", x + w - 12, y + 8, 14, "#AAA", "right");
    const today = localDate();
    const cw = 50, ch = 34, gx = x + 10, gy = y + 34;
    const hist = this.sync.historyMap();
    for (let i = 0; i < 31; i++) {
      const ds = addDays(start, i), r = Math.floor(i / 7), c = i % 7;
      const cx = gx + c * cw, cy = gy + r * ch;
      const loc = this.daily[ds] || {}, srv = hist[ds] || {};
      const rec = { cleared: loc.cleared || srv.cleared || (ds === today && this.todayCleared()), plays: (loc.plays || 0) + (srv.plays || 0) };
      if (ds === today) s.rrect(cx + 1, cy + 1, cw - 4, ch - 4, 5, null, COL.teal, 2);
      s.text(ds.slice(5).replace(/^0/, "").replace("-", "/"), cx + 4, cy + 4, 11, ds > today ? "#555" : "#AAA");
      if (rec && rec.cleared) s.text("●", cx + cw - 22, cy + 13, 16, COL.green);
      else if (rec && rec.plays > 0) s.text("△", cx + cw - 22, cy + 13, 16, COL.yellow);
    }
  }

  // =====================================================
  // リザルト
  // =====================================================
  draw_RESULT() {
    const s = this.scr, rec = this.getRecord();
    s.textC("CLEAR!", 18, FS.xl, COL.red);
    s.textC(`PLAYER: ${this.user.id}  |  ${this.song.title} [${this.song.diff}]`, 78, FS.md, COL.teal);
    s.textC(`今回のスコア: ${this.score}`, 112, FS.lg, COL.white);
    s.textC(`ハイスコア: ${rec.high}   (前回のスコア: ${this.prevScore})`, 154, FS.md, rgb(200, 200, 200));
    if (this.isNewRecord) s.textC("NEW RECORD! 自己ベスト更新！", 188, FS.md, COL.yellow);
    s.text("今日のノルマ", 36, 222, FS.sm, "#BBB");
    this.normaChips(244, 46, true);
    const d = this.todayCounts();
    if (this.justCleared) s.textC("今日のトレーニング クリア！", 300, FS.lg, COL.yellow);
    else if (this.todayCleared()) s.textC("今日のトレーニングはクリア済みです", 304, FS.md, COL.green);
    else {
      const rest = NORMA_ORDER.filter((k) => (d[k] || 0) < NORMA_GOAL).map((k) => `${DIR_JA[k]} ${NORMA_GOAL - (d[k] || 0)}回`);
      s.textC(`クリアまで あと：${rest.join("、")}`, 306, FS.md, COL.white);
    }
    const gains = NORMA_ORDER.filter((k) => this.normaThisPlay[k] > 0).map((k) => `${DIR_JA[k]} +${this.normaThisPlay[k]}`);
    s.textC(gains.length ? `このプレイで：${gains.join("、")}` : "このプレイで増えたノルマはありません", 340, FS.sm, "#AAA");
    if (this.lastTiming) {   // 追加(1.3.2): 取ったときのずれの平均
      const m = this.lastTiming.mean;
      s.text(`タイミング：平均 ${m > 0 ? "+" : ""}${m}ms（${m > 0 ? "早め" : m < 0 ? "遅め" : "ぴったり"}・${this.lastTiming.n}回）`, W - 12, H - 20, 13, "#888", "right");
    }
    s.button(W / 2 - 250, 384, 240, 56, "曲選択へ", () => this.setScene("SONG_SELECT"), { bg: COL.teal });
    s.button(W / 2 + 10, 384, 240, 56, "ホームへ", () => this.setScene("HOME"), { bg: COL.yellow });
  }

  // =====================================================
  // 設定（＋赤色検知の確認、記録の書き出し、ユーザー切替）
  // =====================================================
  draw_SETTINGS() {
    const s = this.scr, cfg = this.config;
    s.textC("設定", 10, FS.lg, COL.teal);
    const items = [
      { key: "speed_mult", label: "ノーツ速度 (1〜10)", min: 1, max: 10, y: 62 },
      { key: "offset", label: "タイミング調整 (-30〜30)", min: -30, max: 30, y: 114 },
      { key: "bgm_vol", label: "BGM音量 (0〜10)", min: 0, max: 10, y: 166 },
      { key: "se_vol", label: "SE音量 (0〜10)", min: 0, max: 10, y: 218 },
    ];
    for (const it of items) {
      s.text(it.label, 30, it.y + 8, FS.md - 2, COL.white);
      const v = cfg[it.key];
      const set = (nv) => {
        cfg[it.key] = Math.max(it.min, Math.min(it.max, nv));
        if (it.key === "se_vol" || it.key === "bgm_vol") { this.audio.setVolumes(cfg.bgm_vol, cfg.se_vol); if (it.key === "se_vol") this.audio.playSE(); }
      };
      s.button(330, it.y, 48, 44, "<", () => set(cfg[it.key] - 1), { bg: rgb(100, 100, 100), fg: COL.white, pad: 4 });
      s.text(it.key === "offset" && v > 0 ? `+${v}` : String(v), 428, it.y + 9, FS.md, COL.yellow, "center");
      s.button(478, it.y, 48, 44, ">", () => set(cfg[it.key] + 1), { bg: rgb(100, 100, 100), fg: COL.white, pad: 4 });
    }
    s.text("※タイミング調整は1目盛り10ms。Bluetoothイヤホンは音が遅れるため、", 30, 266, 14, "#AAA");
    s.text("　スピーカーか有線イヤホンがおすすめです", 30, 284, 14, "#AAA");
    // 赤色検知の厳しさ（スライダー）
    s.text("赤色検知の厳しさ (0〜150)", 30, 314, FS.md - 2, COL.white);
    const sl = { x: 330, y: 322, w: 196, h: 10, min: 0, max: 150, set: (v) => { cfg.exposure_offset = v; this.engine.exposure = v; } };
    this.sliders.push(sl);
    const ratio = cfg.exposure_offset / 150;
    s.rrect(sl.x, sl.y, sl.w, sl.h, 5, rgb(100, 100, 100));
    s.rrect(sl.x, sl.y, Math.max(10, sl.w * ratio), sl.h, 5, COL.teal);
    s.circle(sl.x + sl.w * ratio, sl.y + 5, 11, this.activeSlider === sl ? COL.white : rgb(200, 200, 200));
    s.text(String(cfg.exposure_offset), 540, 314, FS.md, COL.yellow);
    s.text("通常は50のまま。舌を出しても右の白い塊がほとんど出ないときだけ左へ", 30, 350, 14, "#AAA", "left", 520);
    // 追加(1.4.0): 得点ランキングへの参加
    if (this.sync.enabled) {
      const p = this.sync.myProfile();
      const t = !p ? "ランキング：（読み込み中）" : !p.chosen ? "ランキング：まだ選んでいません" : p.ranking ? `ランキング：参加中（${p.name}）` : "ランキング：参加していません";
      s.text(t, 120, 381, FS.sm, COL.white, "left", 205);   // 左下はカメラの小窓があるので 120 から
      s.button(330, 372, 196, 38, "変更する", () => this.goRankAsk("settings"), { bg: rgb(100, 100, 100), fg: COL.white, size: FS.sm, disabled: !p });
    }
    // プレビュー
    const px = 590, pw = 192, ph = 144;
    if (MOCK) s.rect(px, 50, pw, ph, "#334"); else s.video(this.video, px, 50, pw, ph);
    this.engine.drawMask(s.ctx, px, 222, pw, ph);
    s.text("カメラ映像", px + pw / 2, 196, 14, rgb(200, 200, 200), "center");
    s.text("赤色検知（舌）", px + pw / 2, 368, 14, COL.red, "center");
    // 下のボタン
    s.button(130, 420, 200, 50, "記録を書き出す", () => this.exportCSV(), { bg: COL.yellow, size: FS.sm + 2 });
    s.button(340, 420, 170, 50, "ユーザー切替", async () => { await this.saveUser(); this.goLogin(); }, { bg: rgb(80, 80, 80), fg: COL.white, size: FS.sm + 2 });
    s.button(600, 420, 180, 50, "保存して戻る", async () => { await this.saveUser(); this.setScene("HOME"); }, { bg: COL.teal, size: FS.sm + 2 });
  }

  // 記録を CSV（UTF-8、BOM付き）で書き出し、共有メニューで渡す
  exportCSV() {
    const id = this.user.id;
    const esc = (v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const toCsv = (cols, rows) => "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n") + "\r\n";
    const dCols = ["user_id", "date", "up", "down", "left", "right", "front", "cleared", "cleared_at", "plays", "completed_plays"];
    const dRows = Object.keys(this.daily).sort().map((date) => ({ user_id: id, date, ...this.daily[date] }));
    const pCols = ["user_id", "play_id", "started_at", "ended_at", "completed", "song", "difficulty", "device", "score", "excellent", "nice", "perfect", "miss", "max_count",
      "norma_up", "norma_down", "norma_left", "norma_right", "norma_front", "hold_sec_up", "hold_sec_down", "hold_sec_left", "hold_sec_right", "hold_sec_front",
      "shoulder_hits", "face_warning_ratio", "shoulder_missing_ratio", "avg_fps", "offset", "speed", "user_agent", "app_version", "model_version", "timing_mean_ms", "timing_median_ms", "timing_n"];
    const cCols = ["user_id", "at", "kind", "test_correct", "missed_dirs", "model_version"];
    const cRows = this.calibLog.map((r) => ({ user_id: id, ...r }));
    const files = [
      [`daily_${id}.csv`, toCsv(dCols, dRows)],
      [`plays_${id}.csv`, toCsv(pCols, this.plays)],
      [`calib_${id}.csv`, toCsv(cCols, cRows)],
    ].map(([name, text]) => new File([text], name, { type: "text/csv" }));
    if (navigator.canShare && navigator.canShare({ files })) {
      navigator.share({ files, title: `舌ゲームの記録（${id}）` }).catch((e) => { if (e && e.name !== "AbortError") this.downloadFiles(files); });
    } else this.downloadFiles(files);
  }
  downloadFiles(files) {
    files.forEach((f, i) => setTimeout(() => {
      const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }, i * 400));
    this.popup("記録をダウンロードしました", 2500, COL.green);
  }

  // =====================================================
  // 開発者画面（タイトルを5回タップ）
  // =====================================================
  draw_DEV() {
    const s = this.scr, e = this.engine, raw = e.raw, st = e.state;
    s.text("開発者画面", 16, 8, FS.md, COL.teal);
    s.text(`fps ${e.fps.toFixed(1)}  処理 ${e.procMs.toFixed(1)}ms  肩は${e.poseEvery}フレームに1回  ${e.delegate}/${e.sources}  MediaPipe ${MP_VERSION}  顔幅 ${e.faceW.toFixed(0)}px`, 16, 40, 13, "#CCC", "left", 770);
    // 特徴量21個
    FEAT_KEYS.forEach((k, i) => {
      const c = Math.floor(i / 7), r = i % 7;
      const v = raw[k];
      s.text(`${k}: ${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(3)) : v}`, 16 + c * 175, 62 + r * 19, 13, COL.white);
    });
    s.text(`roll ${(+raw.roll).toFixed(3)} yaw ${(+raw.yaw).toFixed(3)} pitch ${(+raw.pitch).toFixed(3)}  警告「${st.faceWarning}」`, 16, 200, 13, "#CCC", "left", 530);
    const sh = e.shoulder;
    s.text(`肩 y11(本人の左) ${sh.yL === null ? "-" : sh.yL.toFixed(3)}  y12(本人の右) ${sh.yR === null ? "-" : sh.yR.toFixed(3)}  angle ${sh.angle}  ${sh.missing ? "映っていない" : "OK"}`, 16, 220, 13, "#CCC", "left", 530);
    s.text(`舌 ${st.tongueDir}  確信度 ${(st.tongueRatio || 0).toFixed(2)}  パワー ${(st.tonguePower || 0).toFixed(2)}  MAX ${st.isFullPower}`, 16, 240, 13, COL.yellow);
    if (st.probs) ["face", "up", "down", "left", "right", "front"].forEach((c, j) => {
      const v = st.probs[c] || 0; s.text(c, 16 + j * 88, 262, 13, "#CCC"); s.rect(16 + j * 88 + 40, 265, 44, 10, "#444"); s.rect(16 + j * 88 + 40, 265, 44 * v, 10, v >= 0.5 ? COL.green : COL.yellow);
    });
    // 混同行列
    if (this.diag) {
      s.text("最後の測定の混同行列（1回目で学習→2回目でテスト、行=正解/列=予測）", 16, 286, 13, COL.teal);
      const lb = this.diag.labels;
      lb.forEach((l, j) => s.text(l.slice(0, 5), 80 + j * 44, 304, 12, "#AAA"));
      this.diag.matrix.forEach((row, i) => { s.text(lb[i], 16, 320 + i * 15, 12, "#AAA"); row.forEach((v, j) => s.text(String(v), 80 + j * 44, 320 + i * 15, 12, i === j ? COL.green : v ? COL.red : "#666")); });
    } else s.text("混同行列：まだ測定していません", 16, 286, 13, "#888");
    if (this.modelMeta) s.text(`モデル(RF:SVM=2:1): ${this.modelMeta.savedAt}  ${this.modelMeta.nSamples}件  木${this.modelMeta.nTrees}本  SV${this.modelMeta.nSV ?? "-"}個  学習 ${this.modelMeta.trainMs}ms（RF ${this.modelMeta.rfMs ?? "-"} / SVM ${this.modelMeta.svmMs ?? "-"}）`, 16, 412, 12, "#AAA", "left", 620);
    s.text(navigator.userAgent, 130, 455, 11, "#666", "left", 520);
    // マスク
    e.drawMask(s.ctx, 560, 62, 224, 168);
    s.text("赤色マスク", 672, 234, 13, COL.red, "center");
    if (!this.started && !this.busy) s.button(580, 260, 190, 48, "カメラを起動", () => this.start(false), { bg: COL.teal, size: FS.sm + 2 });
    s.button(580, 316, 190, 44, `左右反転: ${e.flipInput ? "ON" : "OFF"}`, () => { e.flipInput = !e.flipInput; }, { bg: rgb(90, 90, 90), fg: COL.white, size: FS.sm });
    s.button(660, 420, 120, 48, "戻る", () => this.setScene(this.user && this.model ? "HOME" : "TITLE"), { bg: rgb(80, 80, 80), fg: COL.white });
  }
}

// 追加(1.5.0): Tongue Music Club の画面（scenes.js）から使う値
Object.assign(App.prototype, {
  mockLike() { return MOCK; },
  dbGetSafe(k) { return dbGet(k).catch(() => null); },
  laneIndex, localDate: () => localDate(), addDays,
});
Object.defineProperties(App.prototype, {
  appVersion: { get: () => APP_VERSION }, nameRe: { get: () => NAME_RE }, songs: { get: () => SONGS },
  diffEnabled: { get: () => DIFF_ENABLED }, tutorialSong: { get: () => SONG_TUTORIAL },
  defaultCalib: { get: () => DEFAULT_CALIB }, calibSteps: { get: () => CALIB_STEPS }, calibPlan: { get: () => CALIB_PLAN },
});
// 画面の見た目とプレイの流れを店内演出のものに置き換える（判定・得点・ノルマ・記録の処理は上のまま）
Object.assign(App.prototype, ClubScenes, ClubPlay);

window.app = new App();
