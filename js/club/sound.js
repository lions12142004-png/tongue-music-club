// =====================================================
// sound.js — 演出の音（タイトルの火花・照明、開演ブザー、歓声、画面ごとの BGM）
//   PC版と同じく、ファイルが無い・読めないときは、その音を鳴らさずに進む。
//   ゲームの曲（AudioEngine の playBuffer）とは別に鳴らす。音量は設定の BGM音量・SE音量に合わせる
// =====================================================
import * as C from "./cfg.js";

const SE_FILES = { spark: C.TITLE_SE_SPARK, lights: C.TITLE_SE_LIGHTS_ON, buzzer: C.SE_OPENING_BUZZER, cheer_small: C.SE_CHEER_SMALL, cheer_big: C.SE_CHEER_BIG };

export class ClubSound {
  constructor(audio, getConfig) {
    this.audio = audio; this.getConfig = getConfig;
    this.buf = new Map();        // ファイル名 → AudioBuffer（読めなかったら null）
    this.loading = new Map();
    this.playing = new Map();    // 効果音の名前 → {src, gain}
    this.loops = new Map();
    this.mus = null;             // BGM {name, src, gain, rate, paused}
  }
  get ctx() { return this.audio.ctx; }
  vol(kind) { const c = this.getConfig(); return Math.max(0, Math.min(1, (kind === "bgm" ? c.bgm_vol : c.se_vol) / 10)); }
  // 読み込み（無ければ null）。読み込み中は undefined
  get(file) {
    if (this.buf.has(file)) return this.buf.get(file);
    if (!this.ctx) return undefined;
    if (!this.loading.has(file)) {
      this.loading.set(file, this.audio.load(C.DIR + file).then((b) => this.buf.set(file, b)).catch(() => { this.buf.set(file, null); }));
    }
    return undefined;
  }
  preload() { if (!this.ctx) return; for (const f of Object.values(SE_FILES)) this.get(f); this.get(C.TITLE_BGM); }
  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.ctx.destination); return g; }

  // ---- 効果音 ----
  playSE(name, volMult = 1, maxMs = 0) {
    const b = this.get(SE_FILES[name]); if (!b) return;
    this.stopSE(name, 0);
    const src = this.ctx.createBufferSource(), gain = this._gain(this.vol("se") * volMult);
    src.buffer = b; src.connect(gain);
    const t = this.ctx.currentTime;
    src.start(t);
    if (maxMs > 0) src.stop(t + maxMs / 1000);
    this.playing.set(name, { src, gain });
    src.onended = () => { if (this.playing.get(name)?.src === src) this.playing.delete(name); };
  }
  stopSE(name, fadeMs = 0) {
    const p = this.playing.get(name); if (!p) return;
    this.playing.delete(name); this._fadeStop(p, fadeMs);
  }
  _fadeStop(p, fadeMs) {
    try {
      const t = this.ctx.currentTime;
      if (fadeMs > 0) { p.gain.gain.cancelScheduledValues(t); p.gain.gain.setValueAtTime(p.gain.gain.value, t); p.gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000); p.src.stop(t + fadeMs / 1000 + 0.02); }
      else p.src.stop();
    } catch {}
  }
  // 長い音（minSec 以上）ならループ。鳴らせたら true
  isLoop(name) { const b = this.get(SE_FILES[name]); return !!b && b.duration >= C.TITLE_SPARK_LOOP_MIN_SEC; }
  startLoop(name, volMult, minSec) {
    const b = this.get(SE_FILES[name]); if (!b || b.duration < minSec) return false;
    this.stopLoop(name, 0);
    const src = this.ctx.createBufferSource(), gain = this._gain(this.vol("se") * volMult);
    src.buffer = b; src.loop = true; src.connect(gain); src.start();
    this.loops.set(name, { src, gain });
    return true;
  }
  setLoopVolume(name, volMult) { const p = this.loops.get(name); if (p) p.gain.gain.value = this.vol("se") * volMult; }
  stopLoop(name, fadeMs) { const p = this.loops.get(name); if (!p) return; this.loops.delete(name); this._fadeStop(p, fadeMs); }

  // ---- BGM（同時に1曲） ----
  // 読み込めていなければ読み込みを始めて false（呼び出し側は毎フレーム呼び直す）
  music(name, rate = 1, fadeInMs = 500) {
    if (this.mus && this.mus.name === name) { this.setMusicRate(rate); return true; }
    const b = this.get(name); if (!b) return false;
    this.stopMusic(0);
    const src = this.ctx.createBufferSource(), gain = this._gain(0);
    src.buffer = b; src.loop = true; src.connect(gain); src.start();
    const t = this.ctx.currentTime, v = this.vol("bgm") * rate;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(v, t + Math.max(0.01, fadeInMs / 1000));
    this.mus = { name, src, gain, rate, paused: false };
    return true;
  }
  musicName() { return this.mus ? this.mus.name : null; }
  setMusicRate(rate) {
    if (!this.mus) return;
    this.mus.rate = rate;
    if (!this.mus.paused) { const t = this.ctx.currentTime; this.mus.gain.gain.cancelScheduledValues(t); this.mus.gain.gain.setValueAtTime(this.vol("bgm") * rate, t); }
  }
  refreshVolume() { if (this.mus) this.setMusicRate(this.mus.rate); }
  stopMusic(fadeMs = C.BGM_FADE_MS) { if (!this.mus) return; const m = this.mus; this.mus = null; this._fadeStop(m, fadeMs); }
  pauseMusic(on) {   // 設定画面の「BGM 一時停止」（音量を0にするだけ。曲の位置はそのまま進む）
    if (!this.mus) return;
    this.mus.paused = on;
    const t = this.ctx.currentTime; this.mus.gain.gain.cancelScheduledValues(t); this.mus.gain.gain.setValueAtTime(on ? 0 : this.vol("bgm") * this.mus.rate, t);
  }
  stopAll() { this.stopMusic(0); for (const n of [...this.loops.keys()]) this.stopLoop(n, 0); for (const n of [...this.playing.keys()]) this.stopSE(n, 0); }
}
