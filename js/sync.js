// ==========================================
// sync.js — 記録の送受信（PC版の tongue_sync.py と同じ仕組み）
//   ・ノルマ1回・1プレイ・測定と判定テスト を「出来事」として送信待ちに保存し、Apps Script へ送る
//   ・今日のノルマの合計（PC＋スマホ）、日ごとの合計（カレンダー）、曲・難易度ごとの得点トップ3 を読みに行く
//   ・通信できなくてもゲームは止めない（送信待ちは IndexedDB に残り、あとで送り直す）
// ==========================================
import { dbGet, dbSet } from "./storage.js";

const DIRS = ["up", "down", "left", "right", "front"];
const GOAL = 3;

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class Sync {
  constructor(cfg, device, appVersion, todayFn, nowFn) {
    this.url = (cfg && cfg.url || "").trim(); this.key = (cfg && cfg.key || "").trim();
    this.enabled = !!(this.url && this.key);
    this.device = device; this.appVersion = appVersion;
    this.todayStr = todayFn; this.nowStr = nowFn;
    this.uid = ""; this.queue = []; this.recent = [];
    this.today = null; this.history = null; this.ranking = null;
    this.profile = null;   // ランキングへの参加（サーバーの値）：{chosen, ranking, display_name, at}
    this.online = null; this.lastError = "";
    this.flushing = false; this.lastFlush = 0;
    this.busy = false;   // true の間（プレイ中・測定中）は通信しない
    this.lastTodayReq = 0; this.lastRankReq = 0; this.lastHistReq = 0; this.lastProfReq = 0;
    if (this.enabled) {
      setInterval(() => this.tick(), 30000);
      window.addEventListener("online", () => { this.online = null; this.flush(); this.refresh(true); });
    }
  }

  async setUser(uid) {
    this.uid = uid; this.localProf = null;
    this.queue = (await dbGet("queue:" + uid)) || [];
    this.today = await dbGet("todaycache:" + uid);
    this.history = await dbGet("historycache:" + uid);
    this.ranking = await dbGet("rankingcache");
    this.profile = await dbGet("profilecache:" + uid);
    this.recent = []; this.profileFresh = false;
    this.refresh(true);
    this.flush();
  }

  // ---------- 出来事を足す ----------
  async add(ev) {
    ev.event_id = ev.event_id || uuid();
    this.queue.push(ev);
    await dbSet("queue:" + this.uid, this.queue).catch(() => {});
    this.flush();
    return ev.event_id;
  }
  addNorma(dir, date) { return this.add({ type: "norma", user_id: this.uid, date: date || this.todayStr(), dir, counted_at: this.nowStr() }); }
  addPlay(row) { return this.add({ ...row, type: "play" }); }
  addCalib(row) { return this.add({ ...row, type: "calib" }); }
  // ランキングへの参加・不参加とユーザー名（PC版とスマホ版のどちらで選んでも、新しいほうが残る）
  setProfile(on, name) {
    const ev = { type: "profile", user_id: this.uid, ranking: on ? 1 : 0, display_name: name || "", at: this.nowStr() };
    this.localProf = ev;   // 修正(1.5.0): 送信の直後に古い値を読み込んでも、選び直しを求めない
    return this.add(ev);
  }
  // 今の選択：送信待ちの選択があればそれ、なければサーバーの値。{chosen, ranking, name} か、分からなければ null
  myProfile() {
    const q = this.queue.filter((ev) => ev.type === "profile" && ev.user_id === this.uid);
    const sv = this.profile && this.profile.user_id === this.uid ? this.profile : null;
    if (q.length) {
      const e = q[q.length - 1];
      return { chosen: true, ranking: Number(e.ranking) === 1, name: e.display_name || (sv ? sv.display_name : "") };
    }
    const loc = this.localProf && this.localProf.user_id === this.uid ? this.localProf : null;
    if (loc && (!sv || !Number(sv.chosen) || String(sv.at || "") < loc.at)) return { chosen: true, ranking: Number(loc.ranking) === 1, name: loc.display_name || (sv ? sv.display_name : "") };
    if (!sv) return null;
    return { chosen: !!Number(sv.chosen), ranking: !!Number(sv.ranking), name: sv.display_name || "" };
  }
  // まだ選んでいない（サーバーで確かめられたときだけ true。通信できないときは聞かない）
  needsChoice() {
    if (!this.enabled || !this.uid) return false;
    const p = this.myProfile();
    return !!(p && !p.chosen && this.profileFresh);
  }

  // ---------- 画面に出す値 ----------
  // 今日の合計 = サーバーの値 ＋ まだ反映されていない自分の分。通信を使わない設定なら localCounts をそのまま返す
  combinedToday(localCounts) {
    const today = this.todayStr();
    if (!this.enabled) { const o = {}; for (const k of DIRS) o[k] = (localCounts && localCounts[k]) || 0; return o; }
    const c = { up: 0, down: 0, left: 0, right: 0, front: 0 };
    let fetchedAt = 0;
    if (this.today && this.today.date === today && this.today.user_id === this.uid) {
      for (const k of DIRS) c[k] = Number(this.today.counts[k] || 0);
      fetchedAt = this.today.fetchedAt || 0;
    }
    for (const ev of this.queue) if (ev.type === "norma" && ev.user_id === this.uid && ev.date === today && ev.dir in c) c[ev.dir]++;
    for (const [ev, acc] of this.recent) if (acc >= fetchedAt && ev.user_id === this.uid && ev.date === today && ev.dir in c) c[ev.dir]++;
    return c;
  }
  isCleared(c) { return DIRS.every((k) => (c[k] || 0) >= GOAL); }
  // 日ごとの記録（カレンダー用）：{ "YYYY-MM-DD": {cleared, plays} }
  historyMap() {
    const m = {};
    if (this.history && this.history.user_id === this.uid) for (const d of this.history.days || []) m[d.date] = d;
    return m;
  }
  // [{rank, name, score}]。読めていなければ null
  top3(song, difficulty) {
    if (!this.ranking) return null;
    const it = (this.ranking.ranking || []).find((r) => r.song === song && r.difficulty === difficulty);
    return it ? it.top : [];
  }
  rankingTime() { return this.ranking ? this.ranking.updated_at || "" : ""; }
  statusText() {
    if (!this.enabled) return "";
    const n = this.queue.length;
    if (this.online === false) return n ? `オフライン（未送信 ${n}件）` : "オフライン";
    return n ? `未送信 ${n}件` : "";
  }

  // ---------- 通信 ----------
  async req(method, params, body) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    try {
      let res;
      if (method === "GET") {
        const u = new URL(this.url);
        for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
        res = await fetch(u.href, { method: "GET", signal: ctl.signal, cache: "no-store" });
      } else {
        // Apps Script は事前確認の通信に答えられないので text/plain で送る（中身は JSON）
        res = await fetch(this.url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, signal: ctl.signal });
      }
      const j = await res.json();
      this.online = true;
      return j;
    } catch (e) {
      this.online = false; this.lastError = String(e);
      throw e;
    } finally { clearTimeout(t); }
  }

  setBusy(on) {
    if (this.busy === on) return;
    this.busy = on;
    if (!on) { this.flush(); this.refresh(true); }   // 終わったら、ためていた分をまとめて送る
  }
  async flush() {
    if (!this.enabled || this.busy || this.flushing || !this.queue.length || !this.uid) return;
    this.flushing = true; this.lastFlush = Date.now();
    try {
      const batch = this.queue.slice(0, 50);
      const res = await this.req("POST", null, { action: "push", key: this.key, device: this.device, app_version: this.appVersion, events: batch });
      if (!res.ok) { this.lastError = String(res.error); return; }
      const acc = new Set(res.accepted || []), bad = new Set((res.rejected || []).map((r) => r.event_id));
      const now = Date.now();
      for (const ev of this.queue) if (acc.has(ev.event_id) && ev.type === "norma") this.recent.push([ev, now]);
      this.queue = this.queue.filter((ev) => !acc.has(ev.event_id) && !bad.has(ev.event_id));
      this.recent = this.recent.filter(([, t]) => now - t < 600000);
      await dbSet("queue:" + this.uid, this.queue).catch(() => {});
      if (acc.size) { this.fetchToday(); this.fetchHistory(); }
      if (batch.some((ev) => (ev.type === "play" || ev.type === "profile") && acc.has(ev.event_id))) this.fetchRanking();
      if (batch.some((ev) => ev.type === "profile" && acc.has(ev.event_id))) this.fetchProfile();
      const badName = (res.rejected || []).find((r) => r.error === "name");
      if (badName) this.lastError = "name";
      if (this.queue.length) setTimeout(() => this.flush(), 500);
    } catch { /* 通信できない：あとで送り直す */ }
    finally { this.flushing = false; }
  }

  async fetchToday() {
    if (!this.enabled || this.busy || !this.uid) return;
    const uid = this.uid, date = this.todayStr(), started = Date.now();
    try {
      const r = await this.req("GET", { action: "today", key: this.key, user_id: uid, date });
      if (r.ok && uid === this.uid) { this.today = { ...r, user_id: uid, fetchedAt: started }; dbSet("todaycache:" + uid, this.today).catch(() => {}); }
    } catch {}
  }
  async fetchHistory() {
    if (!this.enabled || this.busy || !this.uid) return;
    const uid = this.uid;
    try {
      const r = await this.req("GET", { action: "history", key: this.key, user_id: uid });
      if (r.ok && uid === this.uid) { this.history = { ...r, user_id: uid }; dbSet("historycache:" + uid, this.history).catch(() => {}); }
    } catch {}
  }
  async fetchProfile() {
    if (!this.enabled || this.busy || !this.uid) return;
    const uid = this.uid;
    try {
      const r = await this.req("GET", { action: "profile", key: this.key, user_id: uid });
      if (r.ok && uid === this.uid) { this.profile = { ...r, user_id: uid }; this.profileFresh = true; dbSet("profilecache:" + uid, this.profile).catch(() => {}); }
    } catch {}
  }
  async fetchRanking() {
    if (!this.enabled || this.busy) return;
    try {
      const r = await this.req("GET", { action: "ranking", key: this.key });
      if (r.ok) { this.ranking = r; dbSet("rankingcache", r).catch(() => {}); }
    } catch {}
  }
  // 何度呼んでもよい（20秒に1回まで）
  refresh(force = false) {
    if (!this.enabled || this.busy) return;
    const now = Date.now();
    if (force || now - this.lastTodayReq > 20000) { this.lastTodayReq = now; this.fetchToday(); }
    if (force || now - this.lastRankReq > 20000) { this.lastRankReq = now; this.fetchRanking(); }
    if (force || now - this.lastHistReq > 60000) { this.lastHistReq = now; this.fetchHistory(); }
    if (force || now - this.lastProfReq > 60000) { this.lastProfReq = now; this.fetchProfile(); }
  }
  tick() { this.flush(); }
}
