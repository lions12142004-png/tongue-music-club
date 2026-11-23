// 音（Web Audio API）。ゲームの時計も再生位置から取る（音とノーツがずれないように）
export class AudioEngine {
  constructor() {
    this.ctx = null; this.bgmGain = null; this.seGain = null;
    this.buffers = new Map();
    this.src = null; this.startAt = 0; this.offset = 0; this.playing = false; this.paused = false;
    this.seBuffer = null;
  }

  // タップの中で呼ぶ（iPhone は操作をきっかけにしないと音が出ない）
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.bgmGain = this.ctx.createGain(); this.bgmGain.connect(this.ctx.destination);
      this.seGain = this.ctx.createGain(); this.seGain.connect(this.ctx.destination);
      // マナーモードでも鳴るように（Safari 16.4 以降）
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
      // 無音を1回鳴らしてロックを外す
      const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setVolumes(bgm, se) {
    if (!this.ctx) return;
    this.bgmGain.gain.value = bgm / 10; this.seGain.gain.value = se / 10;
  }

  async load(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error("音の読み込みに失敗: " + url);
    const arr = await res.arrayBuffer();
    const buf = await new Promise((resolve, reject) => this.ctx.decodeAudioData(arr, resolve, reject));
    this.buffers.set(url, buf);
    return buf;
  }

  async loadSE(url) {
    try { this.seBuffer = await this.load(url); } catch { this.seBuffer = null; }   // 無ければ合成音
  }

  // 効果音（audio_001.mp3 が無いときは短い音を合成）
  playSE() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.seBuffer) {
      const s = this.ctx.createBufferSource(); s.buffer = this.seBuffer; s.connect(this.seGain); s.start(t); return;
    }
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(1320, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(this.seGain); o.start(t); o.stop(t + 0.13);
  }

  // 測定のカウント音・終了音
  beep(freq = 880, dur = 0.12, vol = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }

  // 曲の再生（offsetSec から）
  playBuffer(buf, offsetSec = 0) {
    this.stopMusic();
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.connect(this.bgmGain);
    const when = this.ctx.currentTime + 0.05;
    s.start(when, Math.min(offsetSec, Math.max(0, buf.duration - 0.01)));
    this.src = s; this.curBuf = buf;
    this.startAt = when - offsetSec;   // 「曲の0秒」にあたる ctx の時刻
    this.playing = true; this.paused = false;
  }
  stopMusic() {
    if (this.src) { try { this.src.stop(); } catch {} this.src.disconnect(); this.src = null; }
    this.playing = false;
  }
  // 経過時間（ms）。出力の遅れ（outputLatency）も差し引く
  elapsedMs() {
    if (!this.ctx) return 0;
    if (this.paused) return this.pausedAtMs;
    const lat = (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    return (this.ctx.currentTime - this.startAt - lat) * 1000;
  }
  pause() {
    if (!this.playing || this.paused) return;
    this.pausedAtMs = this.elapsedMs();
    this.pausedPos = this.ctx.currentTime - this.startAt;
    this.stopMusic(); this.paused = true;
  }
  resume() {
    if (!this.paused) return;
    const pos = this.pausedPos;
    this.paused = false;
    if (this.curBuf && pos < this.curBuf.duration) this.playBuffer(this.curBuf, pos);
    else { this.startAt = this.ctx.currentTime - pos; this.playing = true; }
  }
}
