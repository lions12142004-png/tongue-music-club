// =====================================================
// scenes.js — 各画面の見た目（PC版 1122_2 の draw_○○ と画面の流れを移したもの）
//   App.prototype に足して使う。判定・得点・ノルマ・記録の処理は app.js のまま（ここでは呼ぶだけ）
// =====================================================
import { W, H, TAU, Rect, Surface, ScreenSurf, draw, transform, mix, scaleCol, clamp01, setRes, loadImage, softBlur } from "./pg.js";
import * as C from "./cfg.js";
import { TitleScene } from "./title.js";
import { ClubArt, TransitionManager, makeFonts, bookPages, menuSongRects, menuDiffRects, menuTurnRects, mixerRects, faderY, faderRatio } from "./art.js";
import { PlayStage, StageShow, p3d } from "./stage.js";
import { ClubSound } from "./sound.js";

const PINK = C.CLUB_COL_PINK, CREAM = C.CLUB_COL_CREAM, GOLD = C.CLUB_COL_GOLD;
const DIRS5 = ["up", "down", "left", "right", "front"], DIR_JA = { up: "上", down: "下", left: "左", right: "右", front: "前" };
const R = (x, y, w, h) => new Rect(x, y, w, h);
// 画面の部品の位置（PC版と同じ）
const BTN = {
  title: R(W / 2 - 110, C.TITLE_BTN_Y, 220, 50),
  user: R(W / 2 - 140, 145, 280, 44), pass: R(W / 2 - 140, 235, 280, 44), login: R(W / 2 - 110, 315, 220, 48), loginBack: R(664, 366, 122, 44),
  settings: R(128, C.CLUB_CARD_ROW_Y, 84, C.CLUB_CARD_H), rule: R(224, C.CLUB_CARD_ROW_Y, 84, C.CLUB_CARD_H),
  calib: R(320, C.CLUB_CARD_ROW_Y, 140, C.CLUB_CARD_H), check: R(472, C.CLUB_CARD_ROW_Y, 120, C.CLUB_CARD_H),
  songBack: R(700, C.CLUB_CARD_ROW_Y, 84, C.CLUB_CARD_H), records: R(604, C.CLUB_CARD_ROW_Y, 84, C.CLUB_CARD_H),   // 修正(1.5.1): 「戻る」をいちばん右に
  diffBack: R(128, C.CLUB_CARD_ROW_Y, 120, C.CLUB_CARD_H), rank: R(260, C.CLUB_CARD_ROW_Y, 190, C.CLUB_CARD_H),
  next: R(W - 170, H - 55, 140, 36), testStart: R(W / 2 - 100, 350, 200, 40), redo: R(W / 2 - 150, 350, 300, 40),
  ret: R(W / 2 - 120, 428, 240, 42), pause: R(W - 70, H - 70, 60, 60),
  resume: R(W / 2 - 120, 150, 240, 50), ruleBtn: R(W / 2 - 120, 220, 240, 50), quit: R(W / 2 - 120, 290, 240, 50),
  yes: R(W / 2 - 130, 250, 100, 50), no: R(W / 2 + 30, 250, 100, 50), ruleBack: R(W / 2 - 100, H - 70, 200, 50),
  pv: R(...C.CLUB_PREVIEW_RECT), setBack: R(W - 178, 426, 156, 40), setRank: R(124, 426, 330, 40), setCam: R(464, 426, 120, 40),
  raPanel: R(90, 46, 620, 388), raInput: R(250, 222, 300, 40), raJoin: R(180, 344, 200, 52), raNo: R(420, 344, 200, 52), raCancel: R(106, 398, 110, 30),
  courseQuick: R(W / 2 - 275, 326, 265, 95), courseFull: R(W / 2 + 10, 326, 265, 95), calibQuit: R(650, 426, 130, 40),
  homeExport: R(W / 2 - 190, 420, 180, 40), homeBack: R(W / 2 + 10, 420, 180, 40),
};
BTN.pvBgm = R(BTN.pv.x, BTN.pv.bottom + 8, BTN.pv.w, 30);
const SETTING_ITEMS = [
  { key: "speed_mult", label: "ノーツ速度 (1〜10)", min: 1, max: 10 },
  { key: "offset", label: "タイミング調整 (-30〜30)", min: -30, max: 30 },
  { key: "bgm_vol", label: "BGM音量 (0〜10)", min: 0, max: 10 },
  { key: "se_vol", label: "SE音量 (0〜10)", min: 0, max: 10 },
];
const BGM_SCENES = {
  LOGIN: [C.BGM_LOGIN, 1], WELCOME: [C.BGM_MENU, 1], SONG_SELECT: [C.BGM_MENU, 1], DIFF_SELECT: [C.BGM_MENU, 1], SETTINGS: [C.BGM_MENU, 1], CAMERA_ADJUST: [C.BGM_CALIB, C.BGM_CALIB_RATE],
  HOME: [C.BGM_MENU, 1], RANKING_ASK: [C.BGM_MENU, 1],
  CALIB_INTRO: [C.BGM_CALIB, C.BGM_CALIB_RATE], CALIBRATION: [C.BGM_CALIB, C.BGM_CALIB_RATE], CALIB_CONFIRM: [C.BGM_CALIB, C.BGM_CALIB_RATE],
  CHECK_DETECTION: [C.BGM_CHECK, C.BGM_CALIB_RATE],
};
const BGM_STOP_SCENES = new Set(["TUTORIAL_INTRO", "OPENING", "LOADING"]);

// =====================================================
// 準備（画像を読み終えてから1回だけ）
// =====================================================
export async function initClub(app) {
  const scr = app.scr;
  setRes(Math.min(1.5, Math.max(1, scr.scale * scr.dpr)));   // スマホのメモリに収まるよう、背景の解像度は最大 1.5 倍
  // 任意のファイル（無ければコードで描いた絵・システムのフォントを使う）
  const [lit, dark] = await Promise.all([loadImage(C.DIR + C.TITLE_BG_LIT_IMG), loadImage(C.DIR + C.TITLE_BG_DARK_IMG)]);
  let neonFamily = null;
  try { const ff = new FontFace("TmcNeon", `url(${C.DIR}${C.TITLE_NEON_FONT})`); await ff.load(); document.fonts.add(ff); neonFamily = "TmcNeon"; } catch {}
  try { await document.fonts.ready; } catch {}
  const sound = new ClubSound(app.audio, () => app.config);
  const im = scr.images, faces = { left: im.left, up: im.up, front: im.front, down: im.down, right: im.right };
  const F = makeFonts();
  const ts = new TitleScene({ btnRect: BTN.title.arr(), sound, faces, bgImgs: { lit, dark }, neonFamily });
  const art = new ClubArt(ts, F); art.icons = im;
  const stage = new PlayStage(ts, art, sound);
  app.club = { screen: new ScreenSurf(scr.ctx), ts, art, stage, sound, F, transition: new TransitionManager(), welcome: null, laneIcons: new Map(), warmT: 0, bgm: { sc: null } };
  app.preview = { ms: 0, beatAt: -9999, paused: false };
  app.menuSpread = 0;
}

// =====================================================
// 画面（App.prototype に足す）
// =====================================================
export const ClubScenes = {
  // ---------- 毎フレーム ----------
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const s = this.scr; s.begin(); this.sliders = [];
    const now = performance.now(), dt = Math.max(0, Math.min(0.1, (now - (this._lastFrame || now)) / 1000));
    this._lastFrame = now; this.frameDt = dt;
    if (this.isPortrait()) { this.drawRotate(); return; }
    if (!this.club) { s.textC(this.initError || "読み込み中…", 200, 32, this.initError ? "#E74C3C" : "#4ECDC4"); return; }
    const cl = this.club;
    cl.screen.x = s.ctx;
    if (this.scene !== this._sceneOwner) { this._sceneOwner = this.scene; this.sceneT = 0; } else this.sceneT += dt;
    this.bgmUpdate();
    if (this.scene === "TITLE" && cl.ts.state !== "POWERUP") {   // タイトルで待っている間に、ほかの画面の背景を少しずつ作っておく
      cl.warmT += dt;
      if (cl.warmT > 0.4) { cl.warmT = 0; if (!cl.art.warm_up()) cl.stage.ensure(); }
    }
    if (this.scene === "TRANSITION") {
      const tr = cl.transition;
      let done = true;
      try {
        if (!tr.to_ready) { this.renderScene(tr.target, tr.to_surf); tr.to_ready = true; }
        done = tr.update(dt); tr.draw(cl.screen);
      } catch (e) { console.warn("[店内演出] 移動演出でエラー。すぐに切り替えます", e); done = true; }
      if (done) { const [target, cb] = tr.finish(); this.setScene(target); if (cb) cb(); }
    } else {
      const fn = this["draw_" + this.scene];
      if (fn) fn.call(this, dt);
      if (this.scene !== "DEV") this.drawCamMonitor();
    }
    this.drawPopups();
  },
  drawPopups() {
    const s = this.scr, now = performance.now();
    this.popups = this.popups.filter((p) => p.until > now);
    for (const p of this.popups) {
      const w = s.measure(p.text, p.size) + 36;
      s.rrect(W / 2 - w / 2, p.y - 7, w, p.size + 18, 12, "rgba(20,6,12,0.86)", "rgb(255,214,64)", 2);
      s.textC(p.text, p.y, p.size, p.color);
    }
  },
  // 画面 name を surf に1枚描く（移動演出の「前」「次」の絵）。この間はボタンを登録しない・処理を進めない
  renderScene(name, surf) {
    const scr = this.scr, S = this.club.screen, saved = [scr.ctx, S.x, scr.buttons];
    scr.ctx = surf.x; S.x = surf.x; scr.buttons = []; this._off = true;
    try {
      surf.fill([17, 17, 17]);
      const painters = {
        TITLE: () => this.club.ts.draw(S), PLAYING: () => this.paintPlayFrame(S),
        OPENING: () => this.club.stage.draw_opening(S, 0, this.song.title, this.song.diff || "NORMAL", (x) => this.paintPlayFrame(x), false),
      };
      const fn = painters[name] || this["draw_" + name];
      if (fn) fn.call(this, 0);
      if (name !== "DEV") this.drawCamMonitor();
    } catch (e) { console.warn("[店内演出] 画面を描けませんでした", name, e); }
    finally { [scr.ctx, S.x, scr.buttons] = saved; this._off = false; }
  },
  // 次の画面へ、移動演出つきで切り替える
  go(target, kind, onDone = null, focus = null, fromPaint = null) {
    this.showIdForm(false); this.showNameForm(false);
    if (!this.club || !C.CLUB_TRANS_ENABLED || !kind) { this.setScene(target); if (onDone) onDone(); return; }
    const tr = this.club.transition;
    try {
      if (fromPaint) fromPaint(tr.from_surf);
      else { tr.from_surf.x.save(); tr.from_surf.x.drawImage(this.cv, 0, 0, W, H); tr.from_surf.x.restore(); }
      tr.start(kind, target, onDone, focus);
      this.scene = "TRANSITION"; this.engine.calibrating = false;
    } catch (e) { console.warn(e); this.setScene(target); if (onDone) onDone(); }
  },
  // 押している間だけ、札を明るくする（マウスの「乗せる」の代わり）
  hov(r) { const p = this.pointer; return !!(p && p.down && r.collidepoint(p.x, p.y)); },
  tap(r, fn) { if (!this._off) this.scr.hotspot(r.x, r.y, r.w, r.h, fn); },
  cardBtn(r, label, fn, font = null, style = "paper") { this.club.art.card(this.club.screen, r, label, this.hov(r), font, style); this.tap(r, fn); },
  appBtn(r, label, col, txt, fn, font = null) { this.club.art.app_button(this.club.screen, r, label, col, txt, this.hov(r), font); this.tap(r, fn); },

  // ---------- 画面ごとの BGM ----------
  bgmUpdate() {
    const snd = this.club.sound; if (!snd.ctx) return;
    let sc = this.scene === "TRANSITION" ? this.club.transition.target : this.scene;
    if (sc === "TITLE") return;                                   // タイトルの BGM は TitleScene が鳴らす
    if (sc === "PAUSE_RULE" && this.ruleReturn === "SONG_SELECT") sc = "SONG_SELECT";
    if (sc === "PLACEMENT") sc = this.placementMode === "play" ? "SONG_SELECT" : "CALIB_INTRO";
    if (BGM_STOP_SCENES.has(sc)) { if (snd.musicName()) { snd.stopMusic(); this.club.ts.bgm_playing = false; } return; }
    const want = BGM_SCENES[sc]; if (!want) return;
    const [name, rate] = want;
    if (snd.musicName() !== name) {
      if (snd.musicName()) { snd.stopMusic(); this.club.ts.bgm_playing = false; this._bgmNextAt = performance.now() + C.BGM_FADE_MS + 100; return; }
      if (performance.now() < (this._bgmNextAt || 0)) return;
      snd.music(name, rate, C.BGM_FADE_MS);
    } else if (this.club.bgm.sc !== sc) { this.club.bgm.sc = sc; snd.setMusicRate(rate); }
  },

  // ---------- 左下：カメラ映像（防犯モニター風）と ON/OFF ----------
  drawCamMonitor() {
    const S = this.club.screen, art = this.club.art, F = this.club.F, camX = 10, camY = H - 85, on = this.cameraDisplayOn;
    const sw = R(camX, camY - 30, 100, 26);
    draw.rect(S, [30, 27, 35], sw, 0, 5); draw.rect(S, [104, 96, 116], sw, 2, 5);
    const tOn = art.text(F.g_sm, "ON", on ? [150, 255, 176] : [100, 94, 108]), tOff = art.text(F.g_sm, "OFF", !on ? [255, 150, 190] : [100, 94, 108]);
    S.blit(tOn, [sw.x + 9, sw.centery - Math.floor(tOn.h / 2)]); S.blit(tOff, [sw.right - 8 - tOff.w, sw.centery - Math.floor(tOff.h / 2)]);
    const kx = sw.centerx - 6 + (on ? -8 : 8);
    draw.circle(S, [14, 12, 18], [sw.centerx - 6, sw.centery + 3], 6); draw.line(S, [186, 182, 196], [sw.centerx - 6, sw.centery + 3], [kx, sw.centery - 4], 4); draw.circle(S, [238, 234, 246], [kx, sw.centery - 5], 4);
    draw.rect(S, [10, 10, 12], [camX - 4, camY - 4, 108, 83], 0, 6); draw.rect(S, [78, 74, 88], [camX - 4, camY - 4, 108, 83], 1, 6);
    if (on && this.engine.ready) {
      if (this.mockLike()) S.fill([51, 51, 68], [camX, camY, 100, 75]); else this.scr.video(this.video, camX, camY, 100, 75);
      if (Math.floor(performance.now() / 600) % 2 === 0) draw.circle(S, [236, 48, 48], [camX + 70, camY + 9], 3);
      S.blit(art.text(F.g_xs, "REC", [255, 255, 255]), [camX + 76, camY + 2]);
    } else {
      S.fill([22, 24, 28], [camX, camY, 100, 75]);
      art.text_c(S, F.g_xs, on ? "NO SIGNAL" : "CAMERA OFF", [112, 116, 126], camX + 50, camY + 31);
    }
    S.blit(art.text(F.g_xs, "CAM 01", [206, 210, 220]), [camX + 4, camY + 2]);
    this.tap(R(camX, camY - 34, 100, 34), () => { this.cameraDisplayOn = !this.cameraDisplayOn; });
  },

  // =====================================================
  // タイトル
  // =====================================================
  draw_TITLE(dt) {
    const ts = this.club.ts, S = this.club.screen;
    if (!this.started) {
      ts.waitMain = this.busy ? "準備中…" : "画面をタップしてください";
      ts.waitSub = this.busy ? (this.statusMsg || "カメラの読み込みを待っています") : "スマホを横向きにしてスタンドに立て、画面をタップすると準備が始まります";
    } else { ts.waitMain = null; ts.waitSub = null; }
    if (!this._off) {
      const snd = this.club.sound;   // 音は最初のタップのあとでないと鳴らせない（iPhone）。鳴らせるようになったら読み込みと火花の音を始める
      if (snd.ctx && !this._sndReady) { this._sndReady = true; snd.preload(); }
      if (snd.ctx && ts.state === "DARK" && ts.active && !ts.spark_loop_on && snd.isLoop("spark")) ts._start_spark_loop();
      ts.update(dt, this.started, this.errorMsg || "");
    }
    ts.draw(S);
    if (this._off) return;
    this.scr.text(`ver ${this.appVersion}${this.mockLike() ? "（動作確認モード）" : ""}`, W - 10, H - 20, 12, "rgba(255,255,255,0.35)", "right");
    // 修正(1.5.3): 看板（上の「Tongue Music Club」のネオン）を3秒以内に5回タップで開発者画面。
    //   画面全体のタップ（準備開始・GAME START）より後から調べられていたため、今まで開けなかった
    this.scr.hotspot(0, 0, W, H, (x, y) => {
      if (x >= 250 && x <= 550 && y >= 20 && y <= 100) { this.titleTap("TITLE"); if (this.scene === "DEV") return; }
      if (!this.started) { if (!this.busy) this.start(false); return; }
      if (ts.handle_click([x, y])) { this.loginMsgReset = true; this.go("LOGIN", "pan_right", () => this.goLogin()); }
    });
  },

  // =====================================================
  // 受付（ログイン）：カウンターの上のタブレット。入力欄は HTML の欄を重ねる
  // =====================================================
  draw_LOGIN() {
    const S = this.club.screen, art = this.club.art, F = this.club.F, sr = art.login_screen_rect();
    S.blit(art.bg("lobby"), [0, 0]);
    art.text_c(S, F.m_lg, "ログイン", PINK, W / 2, sr.y + 6);
    const msg = this.loginMsg || "", col = this.loginMsgCol === "#E74C3C" ? [231, 76, 60] : [180, 180, 180];
    const lines = F.g_sm.size(msg)[0] > sr.w - 20 && msg.includes("。") ? [msg.split("。")[0] + "。", msg.split("。").slice(1).join("。")] : [msg];
    lines.forEach((ln, i) => art.text_c(S, F.g_sm, ln, col, W / 2, (lines.length > 1 ? 80 : 93) + i * 20));
    // 修正(1.5.2): PC版と同じく、ID とパスワード
    S.blit(art.text(F.m_sm, "参加者ID（担当者から伝えられたもの）:", CREAM), [BTN.user.x, BTN.user.y - 24]);
    draw.rect(S, [22, 6, 14], BTN.user, 0, 6); draw.rect(S, PINK, BTN.user, 2, 6);
    S.blit(art.text(F.m_sm, "パスワード（半角英数）:", CREAM), [BTN.pass.x, BTN.pass.y - 24]);
    draw.rect(S, [22, 6, 14], BTN.pass, 0, 6); draw.rect(S, PINK, BTN.pass, 2, 6);
    this.appBtn(BTN.login, "ログイン / 新規登録", C.CLUB_COL_PINK_DEEP, [40, 8, 20], () => this.submitId(), F.m_md);
    art.text_c(S, F.m_xs, "はじめてのときに入れたものがパスワードになります。忘れないでください", [214, 190, 200], W / 2, BTN.login.bottom + 8);
    this.cardBtn(BTN.loginBack, "入口へ戻る", () => this.go("TITLE", "pan_left"), null, "wood");
  },
  async goLogin() {
    const last = (await this.dbGetSafe("lastUser")) || "";
    if (this.scene !== "LOGIN") this.setScene("LOGIN");
    this.loginMsg = last ? `前回のID「${last}」が入っています。パスワードを入れてください` : "IDとパスワードを入れてください";
    this.loginMsgCol = "#B4B4B4"; this.showIdForm(true, last);
  },
  // 受付 → 客席への案内（ようこそ → 横にパン → 閉じたメニュー → 表紙が開く）
  startWelcome() { this.club.welcome = { t: 0, a: null, b: null, c: null, tr: new TransitionManager(), skip: false }; this.setScene("WELCOME"); },
  draw_WELCOME(dt) {
    const cl = this.club, S = cl.screen, art = cl.art, F = cl.F, wl = cl.welcome;
    if (!wl.a) {
      wl.a = new Surface(W, H); wl.a.blit(art.bg("lobby"), [0, 0]);
      const sr = art.login_screen_rect(), name = `${this.user.id} 様`;
      art.text_c(wl.a, F.m_lg, "ようこそ", PINK, sr.centerx, sr.y + 96);
      art.text_c(wl.a, F.m_xl.size(name)[0] <= sr.w - 30 ? F.m_xl : F.m_lg, name, CREAM, sr.centerx, sr.y + 150);
      art.text_c(wl.a, F.m_sm, "― お席へご案内します ―", [232, 176, 192], sr.centerx, sr.y + 232);
      wl.b = new Surface(W, H); wl.b.blit(art.bg("table"), [0, 0]); art.paint_closed_book(wl.b);
      wl.c = new Surface(W, H); this.renderScene("SONG_SELECT", wl.c);
    }
    const t = wl.t, tr = wl.tr;
    if (t < C.CLUB_WELCOME_T_PAN) S.blit(wl.a, [0, 0]);
    else if (t < C.CLUB_WELCOME_T_TABLE) { tr.kind = "pan_left"; tr.from_surf = wl.a; tr.to_surf = wl.b; tr.p = (t - C.CLUB_WELCOME_T_PAN) / (C.CLUB_WELCOME_T_TABLE - C.CLUB_WELCOME_T_PAN); tr.draw(S); }
    else if (t < C.CLUB_WELCOME_T_OPEN) S.blit(wl.b, [0, 0]);
    else { tr.kind = "page_fwd"; tr.from_surf = wl.b; tr.to_surf = wl.c; tr.focus = C.CLUB_BOOK_RECT; tr.p = Math.min(1, (t - C.CLUB_WELCOME_T_OPEN) / (C.CLUB_WELCOME_T_END - C.CLUB_WELCOME_T_OPEN)); tr.draw(S); }
    if (this._off) return;
    wl.t += dt;
    this.scr.hotspot(0, 0, W, H, () => { wl.skip = true; });
    if (t >= C.CLUB_WELCOME_T_END || wl.skip) { cl.welcome = null; this.setScene("SONG_SELECT"); }
  },

  // =====================================================
  // タブレット画面：置き方ガイド・測定
  // =====================================================
  draw_PLACEMENT() {
    const S = this.club.screen; S.blit(this.club.art.bg("tablet"), [0, 0]);
    this.drawPlacementBody();
  },
  draw_CALIB_INTRO() {
    const S = this.club.screen, art = this.club.art, F = this.club.F;
    S.blit(art.bg("tablet"), [0, 0]);
    art.text_c(S, F.m_lg, "顔・舌のパーソナライズ測定を行います", PINK, W / 2, 40);
    art.text_c(S, F.m_md, "最初に、あなたの顔と舌の基本パターンを測定します。", [255, 255, 255], W / 2, 96);
    const ins = ["・明るい場所で行ってください", "・肩までカメラに映る姿勢で行ってください", "・カメラに対して正面を向いてください",
      "・マスクや帽子、前髪など、顔を隠すものは外してください", "・照明や太陽の光がカメラに直接映り込むと、うまく判定できない場合があります"];
    const mw = Math.max(...ins.map((t) => F.m_sm.size(t)[0]));
    ins.forEach((t, i) => S.blit(art.text(F.m_sm, t, [255, 255, 255]), [W / 2 - mw / 2, 140 + i * 28]));
    art.text_c(S, F.m_md, "コースを選んでください", [255, 255, 255], W / 2, 292);
    // 修正(1.5.1): PC版と同じく、サクッとコースとじっくりコース
    for (const [r, mode, name, catchTxt, dur, col] of [
      [BTN.courseQuick, "quick", "サクッとコース", "すぐに遊びたい人におすすめ！", "所要時間 約1分", [78, 205, 196]],
      [BTN.courseFull, "full", "じっくりコース", "判定精度を上げたい人におすすめ！", "所要時間 約3分", [241, 196, 15]]]) {
      const hv = this.hov(r);
      draw.rect(S, hv ? col : [30, 8, 18], r, 0, 12); draw.rect(S, col, r, 2, 12);
      art.text_c(S, F.m_md, name, hv ? [17, 17, 17] : col, r.centerx, r.y + 10);
      art.text_c(S, F.m_sm, catchTxt, hv ? [17, 17, 17] : [226, 214, 220], r.centerx, r.y + 44);
      art.text_c(S, F.m_sm, dur, hv ? [17, 17, 17] : [226, 214, 220], r.centerx, r.y + 68);
      this.tap(r, () => this.startCalibration(mode));
    }
    if (this.user && this.user.calib_course === "quick") art.text_c(S, F.m_xs, "※ 判定が不安定なら、じっくりコースで測り直してください", GOLD, W / 2, 430);
    if (this.model) this.cardBtn(BTN.calibQuit, "曲選択へ戻る", () => this.go("SONG_SELECT", "zoom_out"), null, "wood");
  },
  draw_CALIBRATION() {
    this.club.screen.blit(this.club.art.bg("tablet"), [0, 0]);
    if (this._off) return;
    this.drawCalibrationBody();
  },
  quitCalibration() {
    this.cancelRecording();
    this.userCalib = JSON.parse(JSON.stringify(this.user.calib || this.defaultCalib));
    this.engine.userCalib = this.userCalib;
    if (this.model) this.go("SONG_SELECT", "zoom_out"); else this.setScene("CALIB_INTRO");
  },
  draw_CALIB_CONFIRM() {
    const S = this.club.screen, art = this.club.art, F = this.club.F, step = this.calibSteps[this.calibIdx], n = this.calibPlan.length;
    S.blit(art.bg("tablet"), [0, 0]);
    // 修正(1.5.2): 「○○フレーム記録しました」はやめ、取得値は測定した方向の値だけ。行の数に合わせて上下の真ん中にそろえる
    const p = this.pendingCalib || {}, k = step.key, lines = [];
    lines.push([F.m_lg, n > 1 ? `【${step.name}】 の確認 (${this.calibRound}/${n}回目)` : `【${step.name}】 の確認`, PINK, 0]);
    lines.push([F.m_md, this.calibRound < n ? `この状態で記録して、${this.calibRound + 1}回目を測定しますか？` : "この状態で記録して、次の方向へ進みますか？", [255, 255, 255], 18]);
    if (n > 1) lines.push([F.m_xs, this.calibRound === 1 ? "※1回目の値が、この方向の基準値になります" : "※2・3回目は判定の学習にだけ使います（基準値は1回目のまま）", [200, 186, 196], 8]);
    if (!k.startsWith("face")) lines.push([F.m_md, `取得値（${step.name}）: ${p[k] ?? 0}`, GOLD, 22]);
    if (k === "up" && p.lip_ratio_thresh !== undefined) lines.push([F.g_sm, `設定される上唇の専用閾値: ${p.lip_ratio_thresh.toFixed(4)} (測定平均 × 1.15)`, [78, 205, 196], 10]);
    const total = lines.reduce((a, [f, , , gap]) => a + f.size("あ")[1] + gap, 0);
    let y = Math.round(56 + (262 - 56 - total) / 2);
    for (const [f, t, c, gap] of lines) { y += gap; art.text_c(S, f, t, c, W / 2, y); y += f.size("あ")[1]; }
    this.appBtn(R(W / 2 - 140, 280, 120, 54), "はい", [46, 204, 113], [17, 17, 17], () => this.commitCalibStep());
    this.appBtn(R(W / 2 + 20, 280, 120, 54), "戻る", [231, 76, 60], [255, 255, 255], () => { this.cancelRecording(); this.setScene("CALIBRATION"); });
  },
  draw_TRAINING() {
    const S = this.club.screen, art = this.club.art, F = this.club.F;
    S.blit(art.bg(this.trainBg || "tablet"), [0, 0]);
    const plate = art.cached("wait_plate", 0, () => { const p = new Surface(560, 150, { alpha: true }); draw.rect(p, [0, 0, 0, 150], [0, 0, 560, 150], 0, 12); return p; });
    S.blit(plate, [W / 2 - 280, H / 2 - 82]);
    art.text_c(S, F.m_lg, "しばらくお待ちください…", PINK, W / 2, H / 2 - 66);
    draw.rect(S, [60, 24, 38], [220, H / 2 - 16, 360, 14], 0, 7);
    draw.rect(S, C.CLUB_COL_PINK_DEEP, [220, H / 2 - 16, Math.max(14, 360 * (this.trainProgress || 0)), 14], 0, 7);
    art.text_c(S, F.m_sm, this.trainMsg || "", [232, 214, 222], W / 2, H / 2 + 10);
    art.text_c(S, F.m_xs, "（端末によっては30秒ほどかかります。画面を閉じないでください）", [200, 186, 196], W / 2, H / 2 + 36);
  },
  draw_TUTORIAL_INTRO() {
    const S = this.club.screen, art = this.club.art, F = this.club.F;
    S.blit(art.bg("rehearsal"), [0, 0]);
    S.blit(art.cached("tut_plate", 0, () => { const p = new Surface(690, 268, { alpha: true }); draw.rect(p, [0, 0, 0, 196], [0, 0, 690, 268], 0, 12); return p; }), [55, 102]);
    art.text_c(S, F.m_md, "― 開店前のリハーサル ―", PINK, W / 2, 112);
    art.text_c(S, F.m_lg, "静止状態の測定が完了しました！", [120, 226, 214], W / 2, 144);
    art.text_c(S, F.m_md, "次に、チュートリアルを通じて「プレイ中の自然なブレ」を測定します。", [255, 255, 255], W / 2, 194);
    const ins = ["・チュートリアル曲（くるみ割り人形 NORMAL）をプレイしてください", "※チュートリアル中はスコアやMISSなどの判定は行われません"];
    const mw = Math.max(...ins.map((t) => F.m_sm.size(t)[0]));
    ins.forEach((t, i) => S.blit(art.text(F.m_sm, t, i ? GOLD : [255, 255, 255]), [W / 2 - mw / 2, 240 + i * 30]));
    art.text_c(S, F.m_md, "準備ができたら「スタート」を押してください", [255, 255, 255], W / 2, 314);
    this.appBtn(R(W / 2 - 110, 384, 220, 52), "スタート", [46, 204, 113], [17, 17, 17], () => this.startSong(this.tutorialSong, true), F.m_md);
  },

  // =====================================================
  // 開演（幕が上がる）→ プレイ → 終演（スタンディングオベーション）
  // =====================================================
  draw_OPENING() {
    const cl = this.club, S = cl.screen, t = this.sceneT;
    const done = cl.stage.draw_opening(S, t, this.song.title, this.song.diff || "NORMAL", (x) => this.paintPlayFrame(x), !this._off);
    if (this._off) return;
    this.scr.hotspot(0, 0, W, H, () => { this.openingSkip = true; });
    if (this.loadFailed) { this.loadFailed = false; this.popup("曲の読み込みに失敗しました。通信を確認してください", 3000, "#E74C3C"); this.go(this.tutorial ? "TUTORIAL_INTRO" : "SONG_SELECT", "fade"); return; }
    if ((done || this.openingSkip) && this.songBuf) {
      if (this.openingSkip && !done) cl.stage.stop_buzzer();
      this.openingSkip = false;
      this.beginPlaying();
    }
  },
  draw_OVATION(dt) {
    const cl = this.club;
    cl.stage.update(dt, this.score, this.combo, false);
    this.paintPlayFrame(cl.screen);
    if (this._off) return;
    this.scr.hotspot(0, 0, W, H, () => { this.ovationSkip = true; });
    if (this.sceneT >= C.CLUB_OVATION_SEC || this.ovationSkip) { this.ovationSkip = false; this.go("RESULT", "zoom_out", null, null, (s) => this.renderScene("PLAYING", s)); }
  },
  drawPlayBase(S) {
    this.club.stage.draw_back(S);
    for (let i = -4; i < 4; i++) draw.line(S, C.CLUB_LANE_LINE_COL, p3d(i + 0.5, 0), p3d(i + 0.5, 2.0), 2);
    const th = 0.02, jp = [p3d(-3.5, 1 - th), p3d(3.5, 1 - th), p3d(3.5, 1 + th), p3d(-3.5, 1 + th)];
    draw.polygon(S, [40, 40, 50], jp); draw.polygon(S, [255, 255, 255], jp, 2);
  },
  drawPlayIcons(S) {
    const cl = this.club, Rr = C.CLUB_ICON_BACK_R, SZ = 60;
    for (const [l, name] of [[-3, "shoulder_L"], [-2, "left"], [-1, "up"], [0, "front"], [1, "down"], [2, "right"], [3, "shoulder_R"]]) {
      let icon = cl.laneIcons.get(name);
      if (!icon) {
        const img = this.scr.images[name]; if (!img || !img.naturalWidth) continue;
        icon = new Surface(Rr * 2 + 2, Rr * 2 + 2, { alpha: true });
        draw.circle(icon, C.CLUB_ICON_BACK_COL, [Rr + 1, Rr + 1], Rr); draw.circle(icon, C.CLUB_ICON_BACK_EDGE, [Rr + 1, Rr + 1], Rr, 2);
        icon.x.drawImage(img, Rr + 1 - SZ / 2, Rr + 1 - SZ / 2, SZ, SZ);
        cl.laneIcons.set(name, icon);
      }
      const [ix, iy] = p3d(l, 1.1);
      S.blit(icon, [ix - Math.floor(icon.w / 2), iy - Math.floor(icon.h / 2)]);
    }
  },
  drawPlayHud(S) {
    const cl = this.club, art = cl.art, F = cl.F, st = this.engine.state, im = this.scr.images;
    if (this.tutorial) {
      S.blit(art.text(F.g_md, "【チュートリアル中】 判定はありません", GOLD), [20, 16]);
      S.blit(art.text(F.g_sm, "お手本に合わせて舌を出してください", GOLD), [22, 48]);
      S.blit(art.text(F.m_sm, "― 開店前のリハーサル ―", PINK), [24, 74]);
    } else cl.stage.draw_hud(S, this.combo);
    const pb = BTN.pause;
    draw.rect(S, [58, 14, 30], pb, 0, 10); draw.rect(S, PINK, pb, 2, 10);
    S.fill([255, 255, 255], [pb.x + 18, pb.y + 15, 8, 30]); S.fill([255, 255, 255], [pb.x + 34, pb.y + 15, 8, 30]);
    if (!this.tutorial) {
      const pw = 200, ph = 130, px = W - 210, py = 10;
      S.fill([18, 5, 11], [px, py, pw, ph]); draw.rect(S, PINK, [px, py, pw, ph], 2);
      S.blit(art.text(F.g_md, "あなたの状況", [255, 255, 255]), [px + 35, py + 5]);
      draw.line(S, PINK, [px, py + 35], [px + pw, py + 35], 2); draw.line(S, PINK, [px + pw / 2, py + 35], [px + pw / 2, py + ph], 2);
      const ti = im[st.tongueDir in DIR_JA ? st.tongueDir : "none"];
      if (ti && ti.naturalWidth) S.x.drawImage(ti, px + pw / 4 - 40, py + 75 - 40, 80, 80);
      const sk = st.shoulderAngle === -20 ? "shoulder_L" : st.shoulderAngle === 20 ? "shoulder_R" : "shoulder_no", si = im[sk];
      if (si && si.naturalWidth) S.x.drawImage(si, px + pw * 3 / 4 - 40, py + 75 - 40, 80, 80);
      let wy = py + ph + 10;
      for (const w of [st.faceWarning, st.shoulderMissing ? "肩が映っていません" : ""]) {
        if (!w) continue;
        const ws = art.text(F.g_md, w, [231, 76, 60]);
        S.blit(ws, [Math.min(px + pw / 2 - Math.floor(ws.w / 2), W - 10 - ws.w), wy]); wy += 30;
      }
    }
  },
  paintPlayFrame(S) { this.drawPlayBase(S); this.club.stage.draw_fx(S); this.drawPlayIcons(S); this.drawPlayHud(S); },
  drawCountIn(S, el, remain) {
    const art = this.club.art, F = this.club.F;
    S.blit(art.cached("countin_dim", 0, () => { const p = new Surface(W, H, { alpha: true, res: 1 }); p.fill([0, 0, 0, 150]); return p; }), [0, 0]);
    const p = el / Math.max(1, C.CLUB_COUNTIN_CURTAIN_SEC * 1000);
    if (p < 1) { const edge = Math.trunc(H * (1 - C.ease(p))); if (edge > 0) S.blit(art.bg("curtain"), [0, edge - H]); }
    const beat = (el % 1000) / 1000;
    if (beat < 0.4) { const k = beat / 0.4; draw.circle(S, mix(GOLD, [60, 40, 30], k), [W / 2, H / 2 + 4], Math.trunc(52 + 78 * k), 3); }
    art.text_c(S, F.m_md, "READY...", [255, 255, 255], W / 2, H / 2 - 82);
    art.text_c(S, F.g_xl, C.CLUB_COUNTIN_WORDS[remain] || String(remain), GOLD, W / 2, H / 2 - 30);
  },
  draw_PAUSE() {
    const S = this.club.screen, art = this.club.art, F = this.club.F;
    S.blit(art.bg("curtain"), [0, 0]);
    art.text_c(S, F.m_md, this.tutorial ? "― リハーサル（休憩） ―" : "― インターミッション（休憩） ―", CREAM, W / 2, 22);
    if (!this.tutorial) art.text_c(S, F.g_xl, `SCORE: ${Math.min(1000000, Math.trunc(this.score))}`, [255, 255, 255], W / 2, 60);
    this.appBtn(BTN.resume, "ゲーム再開", [46, 204, 113], [17, 17, 17], () => { this.countdownStart = performance.now(); this.setScene("RESUME_COUNTDOWN"); }, F.m_md);
    this.appBtn(BTN.ruleBtn, "ルール説明（ご案内）", [78, 205, 196], [17, 17, 17], () => { this.ruleReturn = "PAUSE"; this.go("PAUSE_RULE", "fade"); }, F.m_md);
    this.appBtn(BTN.quit, "中断する", [231, 76, 60], [255, 255, 255], () => this.setScene("PAUSE_CONFIRM"), F.m_md);
  },
  draw_PAUSE_CONFIRM() {
    const S = this.club.screen, art = this.club.art, F = this.club.F;
    S.blit(art.bg("curtain"), [0, 0]);
    S.blit(art.cached("confirm_plate", 0, () => { const p = new Surface(620, 232, { alpha: true }); draw.rect(p, [0, 0, 0, 176], [0, 0, 620, 232], 0, 12); return p; }), [W / 2 - 310, 94]);
    art.text_c(S, F.m_lg, "本当に退店しますか？", [255, 255, 255], W / 2, 130);
    art.text_c(S, F.g_sm, this.tutorial ? "※チュートリアルの学習は行われません" : "※スコアは保存されません（ここまでの今日のノルマは残ります）", [255, 120, 110], W / 2, 184);
    this.appBtn(BTN.yes, "YES", [231, 76, 60], [255, 255, 255], () => this.abortPlay());
    this.appBtn(BTN.no, "NO", [96, 84, 96], [255, 255, 255], () => this.setScene("PAUSE"));
  },
  abortPlay() {
    this.audio.stopMusic(); this.audio.paused = false;
    if (!this.tutorial) this.finishPlayLog(false);
    this.tutorial = false;
    this.go("SONG_SELECT", "zoom_out");
  },
  // 黒板（ルール説明）
  draw_PAUSE_RULE() {
    const S = this.club.screen, art = this.club.art, F = this.club.F;
    S.blit(art.cached("rule_board", 0, () => {
      const s = art.bg("board").copy(), dy = C.CLUB_RULE_SHIFT_Y;
      art.text_c(s, F.m_md, "ルール説明 ＆ 高得点のコツ", C.CLUB_COL_CHALK, W / 2, 12 + dy);
      const w = C.CLUB_COL_CHALK, y = C.CLUB_COL_CHALK_YELLOW, b = C.CLUB_COL_CHALK_BLUE, p = C.CLUB_COL_CHALK_PINK;
      for (const [t, c, yy] of [
        ["【基本のあそびかた】", y, 44], ["音楽に合わせて奥から流れてくる「ノーツ（的）」が判定ラインに重なるタイミングで", w, 64],
        ["指定の方向（上・下・左・右・前）へ舌を出しましょう！", w, 82], ["【ノーツの種類】", y, 124],
        ["・通常ノーツ： タイミングよく「パッ」と舌を出す！", w, 144], ["・ロングノーツ： 帯が通り過ぎるまで舌を「出し続ける」！", w, 162],
        ["【高得点のヒミツ（スコアの仕組み）】", y, 186], ["スコアは「タイミング」と「舌の思い切り度（パワー）」の2つで決まります！", w, 206],
        ["1. タイミング（ラインに重なる瞬間に近いほど高得点！）", b, 226], ["  ・Excellent!! ＝ 完璧！（最高得点） / Nice! ＝ 少しズレた（通常得点）", w, 244],
        ["  ・MISS＝ 外れた・方向間違い（無得点）", p, 262], ["2. 舌のパワー", b, 286],
        ["  限界まで思い切り舌を突き出すと【MAX】判定でスコアボーナス獲得！", w, 304], ["  ★恥ずかしがらずに、おもいっきり舌を伸ばすのがハイスコアの鍵！", y, 322],
        ["【今日のノルマ】 5秒以上の金色のロングノーツを最後まで続けると1回。各方向3回でクリア", y, 346],
      ]) s.blit(art.text(F.m_sm, t, c), [112, yy + dy]);
      return s;
    }), [0, 0]);
    this.cardBtn(BTN.ruleBack, this.firstGuideRule ? "曲選択へ進む" : "戻る", () => {
      this.firstGuideRule = false;
      this.go(this.ruleReturn, this.ruleReturn === "SONG_SELECT" ? "pan_right" : "fade");
    }, F.m_md, "chalk");
  },

  // =====================================================
  // サウンドチェック（判定テスト）
  // =====================================================
  drawInputPanel(S, px, py, pw, ph) {
    const art = this.club.art, F = this.club.F, st = this.engine.state, raw = this.engine.raw, im = this.scr.images;
    S.blit(art.panel(pw, ph), [px, py]);
    art.text_c(S, F.g_md, "現在の入力状況", [255, 255, 255], px + pw / 2, py + 10);
    const ly = py + 40;
    draw.line(S, C.CLUB_COL_METAL_EDGE, [px, ly], [px + pw, ly], 2); draw.line(S, C.CLUB_COL_METAL_EDGE, [px + pw / 2, ly], [px + pw / 2, py + ph], 2);
    const td = st.tongueDir, ti = im[td in DIR_JA ? td : "none"];
    if (ti && ti.naturalWidth) S.x.drawImage(ti, px + pw / 4 - 40, ly + 45 - 40, 80, 80);
    art.text_c(S, F.g_md, `舌: ${td}`, [255, 255, 255], px + pw / 4, py + ph - 76);
    art.text_c(S, F.g_xs, `確信度: ${(st.tongueRatio || 0).toFixed(2)} / パワー: ${(st.tonguePower || 0).toFixed(2)}`, [200, 200, 200], px + pw / 4, py + ph - 46);
    art.text_c(S, F.g_xs, `[ 下:${raw.down} 左:${raw.left} 右:${raw.right} 前:${raw.front}]`, [255, 255, 255], px + pw / 4, py + ph - 26);
    const sk = st.shoulderAngle === -20 ? "shoulder_L" : st.shoulderAngle === 20 ? "shoulder_R" : "shoulder_no", si = im[sk];
    if (si && si.naturalWidth) S.x.drawImage(si, px + pw * 3 / 4 - 40, ly + 65 - 40, 80, 80);
    art.text_c(S, F.g_md, `肩: ${sk}`, [255, 255, 255], px + pw * 3 / 4, py + ph - 44);
    if (st.faceWarning) art.text_c(S, F.g_md, st.faceWarning, [231, 76, 60], px + pw / 2, py + ph + 15);
    const probs = st.probs;
    if (probs) {
      const bx = px + pw + 12, by = py + 10;
      S.blit(art.panel(118, 148), [bx - 7, by - 9]);
      ["face", "up", "down", "left", "right", "front"].forEach((c, j) => {
        const v = probs[c] || 0, yy = by + j * 22, col = v >= 0.5 ? [46, 204, 113] : v >= 0.3 ? [241, 196, 15] : [120, 120, 120];
        S.blit(art.text(F.g_xs, c, [220, 220, 220]), [bx, yy + 2]);
        for (let seg = 0; seg < 10; seg++) S.fill(seg < Math.round(v * 10) ? col : [58, 54, 66], [bx + 45 + seg * 6, yy + 3, 5, 12]);
      });
    }
  },
  draw_CHECK_DETECTION() {
    const S = this.club.screen, art = this.club.art, F = this.club.F, ts = this.testState, st = this.engine.state;
    S.blit(art.bg("soundcheck"), [0, 0]);
    art.text_c(S, F.m_lg, "サウンドチェック ― 判定テスト・確認", PINK, W / 2, 22);
    if (ts !== "FINISH") this.drawInputPanel(S, W / 2 - 230, ts === "IDLE" ? 70 : 180, 460, 220);
    if (ts === "IDLE") {
      this.appBtn(BTN.testStart, "10問テストを開始", [241, 196, 15], [17, 17, 17], () => { if (this.model) this.startTest(); else this.popup("学習モデルがありません。先に測定してください", 2500, "#E74C3C"); });
    } else if (!this._off && (ts === "COUNTDOWN" || ts === "SHOW_RESULT")) {
      const target = this.testQuestions[this.testIdx];
      art.text_c(S, F.g_lg, `第 ${this.testIdx + 1} 問: 【${DIR_JA[target]}】に出してください`, [255, 255, 255], W / 2, 85);
      if (ts === "COUNTDOWN") {
        const remain = 3 - Math.floor((performance.now() - this.testStart) / 1000);
        if (remain <= 0) {
          if (st.tongueDir === target) { this.testCorrect++; this.testMsg = "〇 正解！"; this.audio.playSE(); }
          else { this.testMsg = "× 不正解..."; if (!this.testMissed.includes(DIR_JA[target])) this.testMissed.push(DIR_JA[target]); }
          this.testState = "SHOW_RESULT"; this.testStart = performance.now();
        } else art.text_c(S, F.g_xl, String(remain), [241, 196, 15], W / 2, 125);
      } else {
        art.text_c(S, F.g_xl, this.testMsg, this.testMsg.includes("〇") ? [46, 204, 113] : [231, 76, 60], W / 2, 125);
        if (performance.now() - this.testStart > 1000) {
          this.testIdx++;
          if (this.testIdx >= 10) this.finishTest(); else { this.testState = "COUNTDOWN"; this.testStart = performance.now(); }
        }
      }
    } else if (ts === "FINISH") {
      art.text_c(S, F.g_lg, "テスト終了！", [255, 255, 255], W / 2, 120);
      art.text_c(S, F.g_xl, `正答率: ${this.testCorrect} / 10`, [255, 255, 255], W / 2, 176);
      art.text_c(S, F.g_md, "ミスした方向: " + (this.testMissed.length ? this.testMissed.join(", ") : "なし"), [255, 255, 255], W / 2, 250);
      if (this.testCorrect <= 7) {
        art.text_c(S, F.g_md, "測定のやり直しをおすすめします", [231, 76, 60], W / 2, 288);
        this.appBtn(BTN.redo, "測定をやり直す", [231, 76, 60], [255, 255, 255], () => { this.testState = "IDLE"; this.placementMode = "recalib"; this.go("PLACEMENT", "fade"); });
      }
    }
    if (ts === "IDLE" || ts === "FINISH") {
      this.cardBtn(BTN.next, this.firstGuide ? "ご案内へ進む" : "曲選択画面へ", () => {
        this.testState = "IDLE";
        if (this.firstGuide) { this.firstGuide = false; this.firstFlow = false; this.firstGuideRule = true; this.ruleReturn = "SONG_SELECT"; this.go("PAUSE_RULE", "zoom_out"); }
        else this.go("SONG_SELECT", "zoom_out");
      });
    }
  },

  // =====================================================
  // 曲選択：客席のテーブルに置いた、見開きのメニュー表
  // =====================================================
  draw_SONG_SELECT() {
    const cl = this.club, S = cl.screen, art = cl.art, F = cl.F, songs = this.songs;
    if (!this._off) { this.sync.refresh(); if (this.sync.needsChoice()) { this.goRankAsk("first"); return; } }
    const per = C.CLUB_MENU_PER_PAGE * 2, nSpreads = Math.max(1, Math.ceil(songs.length / per));
    const spread = Math.max(0, Math.min(this.menuSpread, nSpreads - 1)), start = spread * per, page = songs.slice(start, start + per);
    const highs = page.map((s) => Math.max(...["EASY", "NORMAL", "HARD"].map((d) => this.getRecord(s.title, d).high)));
    const tc = this.todayCounts(), norma = DIRS5.map((k) => [k, DIR_JA[k], tc[k] || 0]);
    const key = JSON.stringify([spread, nSpreads, page.map((s) => [s.title, s.enabled]), highs, norma, this.user && this.user.id, this.user && this.user.calib_course]);
    S.blit(art.cached("song_select", key, () => {
      const s = art.bg("table").copy();
      art.paint_menu_spread(s, songs, start, highs, norma, spread);
      s.blit(art.text(F.m_sm, `PLAYER: ${this.user ? this.user.id : ""}`, GOLD), [20, 14]);
      art.text_c(s, F.m_sm, "― お好きな曲をお選びください ―", CREAM, W / 2, 14);
      art.text_c(s, F.m_md, `${spread + 1} / ${nSpreads}`, CREAM, W / 2, C.CLUB_BOOK_RECT[1] + C.CLUB_BOOK_RECT[3] + 16);
      const t = art.text(F.m_sm, `測定: ${this.courseNames[(this.user && this.user.calib_course) || "full"] || "じっくりコース"}`, [232, 176, 192]); s.blit(t, [W - t.w - 20, 14]);
      return s;
    }), [0, 0]);
    menuSongRects().forEach((r, slot) => {
      const idx = start + slot; if (idx >= songs.length || !songs[idx].enabled) return;
      if (this.hov(r)) S.blit(this.hoverBand(r.w, r.h), r.topleft);
      this.tap(r, () => { this.selSong = idx; this.rankView = false; this.go("DIFF_SELECT", "page_fwd", null, C.CLUB_BOOK_RECT); });
    });
    if (nSpreads > 1) {
      const [pr, nr] = menuTurnRects();
      for (const [rect, d, lbl, show] of [[pr, -1, "前", spread > 0], [nr, 1, "次", spread < nSpreads - 1]]) {
        if (!show) continue;
        art.card(S, rect, null, this.hov(rect));
        const cx = rect.centerx, cy = rect.y + 20;
        draw.polygon(S, C.CLUB_COL_STAMP, [[cx + d * 8, cy], [cx - d * 6, cy - 9], [cx - d * 6, cy + 9]]);
        art.text_c(S, F.m_sm, lbl, C.CLUB_COL_INK, cx, rect.y + 36);
        this.tap(rect, () => { this.menuSpread = spread + d; this.go("SONG_SELECT", d > 0 ? "page_fwd" : "page_back", null, C.CLUB_BOOK_RECT); });
      }
    }
    this.cardBtn(BTN.settings, "設定", () => { this.settingsBackup = { ...this.config }; this.go("SETTINGS", "pan_up"); });
    this.cardBtn(BTN.rule, "ご案内", () => { this.ruleReturn = "SONG_SELECT"; this.go("PAUSE_RULE", "pan_left"); });
    this.cardBtn(BTN.calib, "測定をやり直す", () => { this.placementMode = "recalib"; this.go("PLACEMENT", "zoom_in"); });
    this.cardBtn(BTN.check, "判定チェック", () => { this.testState = "IDLE"; this.go("CHECK_DETECTION", "zoom_in"); });
    this.cardBtn(BTN.songBack, "戻る", () => this.go("LOGIN", "pan_right", () => this.goLogin()));
    this.cardBtn(BTN.records, "記録", () => this.go("HOME", "fade"));
    const st = this.sync.statusText();
    if (st) S.blit(art.text(F.m_xs, st, [232, 176, 192]), [20, 36]);
  },
  hoverBand(w, h) { return this.club.art.cached(`hover${w}x${h}`, 0, () => { const s = new Surface(w, h, { alpha: true }); draw.rect(s, [255, 110, 160, 44], [0, 0, w, h], 0, 6); return s; }); },

  // 選んだ曲のページ（右ページ：コース ⇔ みんなのランキング）
  draw_DIFF_SELECT() {
    const cl = this.club, S = cl.screen, art = cl.art, F = cl.F, song = this.songs[this.selSong];
    if (!this._off) this.sync.refresh();
    const rows = ["EASY", "NORMAL", "HARD"].map((d) => { const r = this.getRecord(song.title, d); return [d, !!this.diffEnabled[d], r.high, r.last, C.CLUB_DIFF_INK[d] || C.CLUB_COL_INK]; });
    S.blit(art.cached("diff_select", JSON.stringify([song.title, rows, this.user && this.user.id]), () => {
      const s = art.bg("table").copy();
      art.paint_menu_song(s, song, rows);
      s.blit(art.text(F.m_sm, `PLAYER: ${this.user ? this.user.id : ""}`, GOLD), [20, 14]);
      art.text_c(s, F.m_sm, "― 難易度選択 ―", CREAM, W / 2, 14);
      return s;
    }), [0, 0]);
    if (this.rankView) this.drawRankingPage(S, song);
    else menuDiffRects().forEach((r, i) => {
      const [d, en] = rows[i]; if (!en) return;
      if (this.hov(r)) S.blit(this.hoverBand(r.w, r.h), r.topleft);
      this.tap(r, () => { this.selDiff = d; this.placementMode = "play"; this.go("PLACEMENT", "fade"); });
    });
    this.cardBtn(BTN.diffBack, "曲選択へ", () => this.go("SONG_SELECT", "page_back", null, C.CLUB_BOOK_RECT));
    this.cardBtn(BTN.rank, this.rankView ? "コースを選ぶ" : "みんなのランキング", () => { this.rankView = !this.rankView; if (this.rankView) this.sync.refresh(true); });
    const st = this.sync.statusText();
    if (st) S.blit(art.text(F.m_xs, st, [232, 176, 192]), [20, 36]);
  },
  drawRankingPage(S, song) {
    const art = this.club.art, F = this.club.F, PR = bookPages()[1], sy = this.sync, diffs = ["EASY", "NORMAL", "HARD"];
    const tops = diffs.map((d) => [d, sy.top3(song.title, d)]), mp = sy.myProfile() || {}, myName = mp.ranking ? mp.name : null, uid = this.user && this.user.id;
    const key = JSON.stringify([song.title, tops, sy.rankingTime(), sy.online, sy.enabled, uid, myName]);
    S.blit(art.cached("ranking_page", key, () => {
      const s = new Surface(PR.w, PR.h, { alpha: true });
      s.blit(art.paper(PR.w, PR.h, 23), [0, 0]); draw.rect(s, [214, 176, 172], new Rect(0, 0, PR.w, PR.h).inflate(-14, -14), 1);
      s.blit(art.text(F.m_md, "みんなのランキング", C.CLUB_COL_INK), [22, 18]);
      const t = sy.rankingTime(), sub = t ? t.slice(5, 16).replace("-", "/") + " 時点" + (sy.online === false ? "（オフライン）" : "") : "";
      if (sub) { const tsf = art.text(F.m_xs, sub, C.CLUB_COL_INK_SUB); s.blit(tsf, [PR.w - 22 - tsf.w, PR.h - 30]); }
      s.fill([196, 150, 150], [22, 58, PR.w - 40, 1]); s.fill([226, 196, 192], [22, 61, PR.w - 40, 1]);
      const rects = menuDiffRects();
      tops.forEach(([d, top], i) => {
        const r = rects[i], x = r.x - PR.x, y = r.y - PR.y, w = r.w;
        s.blit(art.text(F.m_md, d, C.CLUB_DIFF_INK[d] || C.CLUB_COL_INK), [x + 12, y + 6]);
        const msg = !sy.enabled ? "通信の設定がありません" : top === null ? (sy.online === false ? "読み込めませんでした" : "読み込み中…") : !top.length ? "まだ記録がありません" : null;
        if (msg) s.blit(art.text(F.m_sm, msg, C.CLUB_COL_INK_SUB), [x + 118, y + 26]);
        else for (let j = 0; j < 3; j++) {
          const yy = y + 4 + j * 22, e = top[j];
          if (e) art.leader_line(s, F.m_sm, `${e.rank}位 ${e.name}`, Number(e.score).toLocaleString("en-US"), x + 118, yy, w - 130, (e.name === uid || e.name === myName) ? C.CLUB_COL_STAMP : C.CLUB_COL_INK);
          else s.blit(art.text(F.m_sm, `${j + 1}位 —`, C.CLUB_COL_INK_OFF), [x + 118, yy]);
        }
        if (i < 2) s.fill([226, 196, 192], [x + 10, r.bottom - PR.y + 2, w - 20, 1]);
      });
      return s;
    }), PR.topleft);
  },

  // =====================================================
  // ランキングへの参加（曲選択・設定の上に重ねる）
  // =====================================================
  goRankAsk(from) {
    const p = this.sync.myProfile();
    this.rankAskFrom = from; this.rankMsg = ""; this.rankMsgCol = "#B4B4B4";
    const bgS = new Surface(W, H); this.renderScene(from === "settings" ? "SETTINGS" : "SONG_SELECT", bgS); this._rankBg = bgS;
    this.setScene("RANKING_ASK");
    this.showNameForm(true, p ? p.name : "");
  },
  chooseRanking(on) {
    const name = this.nameInput.value.trim();
    if (on && !this.nameRe.test(name)) {
      this.rankMsg = name ? "ユーザー名は、ひらがな・カタカナ・漢字・英数字と _ - で8文字までです" : "参加する場合は、ユーザー名を入れてください";
      this.rankMsgCol = "#E74C3C"; return;
    }
    this.sync.setProfile(on, name);
    this.showNameForm(false); this._rankBg = null;
    this.setScene(this.rankAskFrom === "settings" ? "SETTINGS" : "SONG_SELECT");
  },
  draw_RANKING_ASK() {
    const S = this.club.screen, art = this.club.art, F = this.club.F, P = BTN.raPanel;
    if (this._rankBg) S.blit(this._rankBg, [0, 0]);
    S.fill([0, 0, 0, 170]);
    draw.rect(S, [28, 20, 26], P, 0, 10); draw.rect(S, C.CLUB_COL_GOLD, P, 2, 10);
    art.text_c(S, F.m_lg, "得点ランキングへの参加", PINK, W / 2, P.y + 14);
    ["曲・難易度ごとの得点の上位3名が、ユーザー名と得点で、", "ほかの参加者の画面に表示されます。参加は自由です。",
      "参加しなくても、ご自身の得点は記録されます。", "あとから「設定」で、いつでも変えられます（PC版とスマホ版で共通）。"]
      .forEach((ln, i) => art.text_c(S, F.m_xs, ln, CREAM, W / 2, P.y + 60 + i * 21));
    art.text_c(S, F.m_sm, "参加する場合のユーザー名", C.CLUB_COL_GOLD, W / 2, BTN.raInput.y - 28);
    art.text_c(S, F.g_xs, "ひらがな・カタカナ・漢字・英数字と _ - で8文字まで", [190, 180, 186], W / 2, BTN.raInput.bottom + 8);
    art.text_c(S, F.g_xs, "本名・あだ名・学籍番号など、ご本人と分かる名前は使わないでください", [190, 180, 186], W / 2, BTN.raInput.bottom + 26);
    if (this.rankMsg) art.text_c(S, F.g_xs, this.rankMsg, this.rankMsgCol === "#E74C3C" ? [255, 110, 110] : [190, 180, 186], W / 2, BTN.raJoin.y - 22);
    this.cardBtn(BTN.raJoin, "参加する", () => this.chooseRanking(true));
    this.cardBtn(BTN.raNo, "参加しない", () => this.chooseRanking(false), null, "wood");
    if (this.rankAskFrom === "settings") this.cardBtn(BTN.raCancel, "やめる", () => { this.showNameForm(false); this._rankBg = null; this.setScene("SETTINGS"); }, F.m_xs, "wood");
  },

  // =====================================================
  // 設定：音響ブースのミキサー卓
  // =====================================================
  draw_SETTINGS(dt) {
    const S = this.club.screen, art = this.club.art, F = this.club.F, cfg = this.config;
    if (!this._off) this.previewTick(dt || 0);
    S.blit(art.bg("mixer"), [0, 0]);
    art.text_c(S, F.m_lg, "設定 ― 音響ブース", PINK, W / 2, 14);
    SETTING_ITEMS.forEach((it, i) => {
      const g = mixerRects(i), cx = g.cx, [name, rng] = it.label.split(" (");
      art.text_c(S, F.m_xs, name, CREAM, cx, 72);
      if (rng) art.text_c(S, F.g_xs, "(" + rng, [176, 166, 186], cx, 93);
      const v = cfg[it.key], vs = it.key === "offset" && v > 0 ? `+${v}` : String(v);
      draw.rect(S, [12, 8, 10], g.led, 0, 4); draw.rect(S, [84, 76, 94], g.led, 1, 4);
      const vt = art.text(F.g_md, vs, C.CLUB_COL_LED); S.blit(vt, [g.led.centerx - Math.floor(vt.w / 2), g.led.centery - Math.floor(vt.h / 2)]);
      const set = (nv) => {
        nv = Math.max(it.min, Math.min(it.max, nv)); if (nv === cfg[it.key]) return;
        cfg[it.key] = nv;
        if (it.key === "se_vol" || it.key === "bgm_vol") { this.audio.setVolumes(cfg.bgm_vol, cfg.se_vol); this.club.sound.refreshVolume(); if (it.key === "se_vol") this.audio.playSE(); }
      };
      for (const [rect, sign, step] of [[g.plus, "＋", 1], [g.minus, "－", -1]]) {
        const hv = this.hov(rect);
        draw.rect(S, hv ? PINK : [74, 66, 84], rect, 0, 6); draw.rect(S, [130, 120, 144], rect, 1, 6);
        const t = art.text(F.g_sm, sign, hv ? [20, 10, 16] : [240, 236, 246]); S.blit(t, [rect.centerx - Math.floor(t.w / 2), rect.centery - Math.floor(t.h / 2)]);
        this.tap(rect.inflate(8, 8), () => set(cfg[it.key] + step));
      }
      const ky = faderY((v - it.min) / (it.max - it.min)), grabbed = this.activeFader === it.key;
      draw.rect(S, C.CLUB_COL_PINK_DEEP, [cx - 2, ky, 4, g.y1 - ky], 0, 2);
      const knob = R(cx - 17, ky - 9, 34, 18);
      draw.rect(S, [8, 6, 10], knob.move(1, 2), 0, 4); draw.rect(S, grabbed ? [255, 255, 255] : [214, 208, 224], knob, 0, 4); draw.rect(S, [96, 88, 108], knob, 1, 4);
      S.fill(grabbed ? C.CLUB_COL_STAMP : [60, 54, 70], [knob.x + 4, knob.centery - 1, knob.w - 8, 2]);
      this.tap(g.grab, (x, y) => {
        this.activeFader = it.key;
        const f = (yy) => set(it.min + Math.round(faderRatio(yy) * (it.max - it.min)));
        f(y); this.dragFn = (xx, yy) => f(yy);
      });
    });
    this.drawSettingsPreview(S);
    this.cardBtn(BTN.setBack, "保存して戻る", async () => {
      if (this.preview.paused) { this.preview.paused = false; this.club.sound.pauseMusic(false); }
      await this.saveUser(); this.go("SONG_SELECT", "pan_down");
    }, null, "wood");
    this.cardBtn(BTN.setCam, "カメラ調整", () => this.go("CAMERA_ADJUST", "zoom_in"), F.m_xs);
    if (this.sync.enabled) {
      const p = this.sync.myProfile();
      const lbl = !p ? "ランキング：（読み込み中）" : !p.chosen ? "ランキング：まだ選んでいません" : p.ranking ? `ランキング：参加中（${p.name}）` : "ランキング：参加していません";
      this.cardBtn(BTN.setRank, lbl + "　▶変更", () => { if (p) this.goRankAsk("settings"); }, F.m_xs);
    }
  },
  previewTick(dt) {
    const pv = this.preview, before = pv.ms;
    pv.ms += Math.max(0, Math.min(dt, 0.1)) * 1000;
    if (Math.floor(pv.ms / C.CLUB_PREVIEW_BEAT_MS) !== Math.floor(before / C.CLUB_PREVIEW_BEAT_MS)) { pv.beatAt = pv.ms; if (pv.paused) this.audio.playSE(); }
  },
  drawSettingsPreview(S) {
    const art = this.club.art, F = this.club.F, Rr = BTN.pv, cfg = this.config, pv = this.preview;
    draw.rect(S, [6, 6, 9], Rr, 0, 8);
    const inner = Rr.inflate(-10, -10), k = C.CLUB_PREVIEW_SCALE, ox = inner.x + Math.floor(inner.w / 2), oy = inner.y + 18;
    const P = (lane, p) => { const [x, y] = p3d(lane, p); return [Math.trunc(ox + (x - W / 2) * k), Math.trunc(oy + (y - C.VANISHING_Y) * k)]; };
    const x = S.x; x.save(); x.beginPath(); x.rect(inner.x, inner.y, inner.w, inner.h); x.clip();
    S.fill([14, 8, 12], inner.arr());
    for (const side of [-0.5, 0.5]) draw.line(S, C.CLUB_LANE_LINE_COL, P(side, 0), P(side, 1.4), 2);
    const appr = 10000 / cfg.speed_mult, off = cfg.offset * 10, el = pv.ms, n0 = Math.floor((el - off) / C.CLUB_PREVIEW_BEAT_MS) - 1;
    for (let n = n0 + Math.floor(appr / C.CLUB_PREVIEW_BEAT_MS) + 2; n > n0 - 1; n--) {
      const p = 1 - ((n * C.CLUB_PREVIEW_BEAT_MS + off) - el) / appr;
      if (!(p >= 0 && p < 1.3)) continue;
      const poly = [P(-0.5, Math.max(0, p - 0.02)), P(0.5, Math.max(0, p - 0.02)), P(0.5, p + 0.02), P(-0.5, p + 0.02)];
      draw.polygon(S, [78, 205, 196], poly); draw.polygon(S, [255, 255, 255], poly, 2);
    }
    const flash = el - pv.beatAt < C.CLUB_PREVIEW_FLASH_MS, judge = [P(-0.62, 0.98), P(0.62, 0.98), P(0.62, 1.02), P(-0.62, 1.02)];
    draw.polygon(S, flash ? C.CLUB_FX_COL_GOLD : [40, 40, 50], judge); draw.polygon(S, [255, 255, 255], judge, 2);
    x.restore();
    draw.rect(S, [128, 120, 142], Rr, 2, 8);
    S.blit(art.text(F.g_xs, "PREVIEW", [150, 255, 176]), [Rr.x + 10, Rr.y + 8]);
    this.appBtn(BTN.pvBgm, pv.paused ? "BGM 再開" : "BGM 一時停止", pv.paused ? [241, 196, 15] : [96, 88, 108], pv.paused ? [17, 17, 17] : [255, 255, 255], () => {
      pv.paused = !pv.paused; this.club.sound.pauseMusic(pv.paused);
    }, F.m_sm);
    art.text_c(S, F.g_xs, "タイミングを合わせるときは、BGM を止めてください", [214, 204, 220], Rr.centerx, BTN.pvBgm.bottom + 6);
  },

  // =====================================================
  // カメラ調整（PC版の CAMERA_ADJUST。赤色検知の厳しさ）。設定の「カメラ調整」から
  // =====================================================
  draw_CAMERA_ADJUST() {
    const S = this.club.screen, art = this.club.art, F = this.club.F, cfg = this.config;
    S.blit(art.bg("tablet"), [0, 0]);
    art.text_c(S, F.m_lg, "カメラ調整", PINK, W / 2, 34);
    const vx = 150, vy = 82, vw = 240, vh = 180;
    S.fill([8, 6, 10], [vx - 4, vy - 4, vw + 8, vh + 8]); S.fill([8, 6, 10], [vx + vw + 16, vy - 4, vw + 8, vh + 8]);
    if (this.mockLike()) S.fill([51, 51, 68], [vx, vy, vw, vh]); else this.scr.video(this.video, vx, vy, vw, vh);
    if (!this._off) this.engine.drawMask(S.x, vx + vw + 20, vy, vw, vh);
    art.text_c(S, F.g_xs, "カメラ映像", [214, 204, 220], vx + vw / 2, vy + vh + 8);
    art.text_c(S, F.g_xs, "赤色検知（舌）", [255, 120, 110], vx + vw * 1.5 + 20, vy + vh + 8);
    S.blit(art.text(F.m_sm, "赤色検知の厳しさ (0〜150)", CREAM), [150, 300]);
    const sl = { x: 400, y: 308, w: 200, h: 10, min: 0, max: 150, set: (v) => { cfg.exposure_offset = v; this.engine.exposure = v; } };
    if (!this._off) this.sliders.push(sl);
    const ratio = cfg.exposure_offset / 150, on = this.activeSlider && this.activeSlider.x === sl.x;
    draw.rect(S, [74, 66, 84], [sl.x, sl.y, sl.w, sl.h], 0, 5); draw.rect(S, C.CLUB_COL_PINK_DEEP, [sl.x, sl.y, Math.max(10, sl.w * ratio), sl.h], 0, 5);
    draw.circle(S, on ? [255, 255, 255] : [220, 204, 212], [Math.trunc(sl.x + sl.w * ratio), sl.y + 5], 11);
    S.blit(art.text(F.g_md, String(cfg.exposure_offset), C.CLUB_COL_LED), [616, 298]);
    art.text_c(S, F.m_xs, "通常は50のまま。舌を出しても右の白い塊がほとんど出ないときだけ左へ", [214, 204, 220], W / 2, 338);
    this.cardBtn(R(W / 2 - 90, 384, 180, 42), "設定へ戻る", async () => { await this.saveUser(); this.go("SETTINGS", "zoom_out"); });
  },

  // =====================================================
  // リザルト：お会計の伝票
  // =====================================================
  draw_RESULT() {
    const cl = this.club, S = cl.screen, art = cl.art, F = cl.F, rec = this.getRecord(), d = new Date();
    if (!this._off && !this.cheerPlayed) { this.cheerPlayed = true; cl.stage.play_cheer(Math.min(1000000, Math.trunc(this.score))); }
    const dateText = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`, songLine = `${this.song.title} [${this.song.diff}]`;
    const score = Math.min(1000000, Math.trunc(this.score)), lv = StageShow.level_of(score), uid = this.user.id;
    const receipt = art.cached("receipt", JSON.stringify([dateText, uid, songLine, score, rec.high, this.prevScore, lv]), () => art.receipt_image(dateText, uid, songLine, score, rec.high, this.prevScore || 0, lv));
    S.blit(art.bg("table"), [0, 0]);
    art.text_c(S, F.g_xl, "CLEAR!", GOLD, 125, 70);
    art.text_c(S, F.m_sm, "ご出演ありがとうございました", CREAM, 125, 132);
    // スマホ版：今日のノルマ（PC とスマホの合計）を左に小さく
    const tc = this.todayCounts();
    art.text_c(S, F.m_sm, "今日のノルマ", PINK, 125, 182);
    DIRS5.forEach((k, i) => { const v = tc[k] || 0; art.text_c(S, F.m_sm, `${DIR_JA[k]}  ${v} / 3${v >= 3 ? "  ✓" : ""}`, v >= 3 ? [150, 255, 176] : CREAM, 125, 208 + i * 22); });
    if (this.justCleared) art.text_c(S, F.m_sm, "今日のトレーニング クリア！", GOLD, 125, 326);
    else if (this.todayCleared()) art.text_c(S, F.m_xs, "今日のトレーニングはクリア済みです", [150, 255, 176], 125, 328);
    const [rx, ry, rw, rh] = C.CLUB_RECEIPT_RECT, drop = Math.trunc((1 - C.easeOut(this.sceneT / Math.max(0.01, C.CLUB_RESULT_DROP_SEC))) * 46);
    S.fill([70, 12, 32], [rx + 5, ry + 8, rw, rh - 10]);
    S.blit(receipt, [rx, ry - drop]);
    if (this.isNewRecord) {
      const st = art.stamp("自己ベスト更新", F.m_md, -10), cx = rx + rw - 92, cy = ry + 208, q = (this.sceneT - C.CLUB_RESULT_STAMP_AT) / Math.max(0.01, C.CLUB_RESULT_STAMP_SEC);
      if (q >= 1) { S.blit(st, [cx - Math.floor(st.w / 2), cy - Math.floor(st.h / 2)]); art.text_c(S, F.m_md, "NEW RECORD!", GOLD, 675, 78); art.text_c(S, F.m_sm, "自己ベスト更新！", CREAM, 675, 112); }
      else if (q > 0) { const sc = 1 + 1.5 * (1 - q), w = st.w * sc, h = st.h * sc; S.x.save(); S.x.globalAlpha = q; S.x.drawImage(st.c, cx - w / 2, cy - h / 2, w, h); S.x.restore(); }
    }
    if (this.lastTiming) { const m = this.lastTiming.mean, t = art.text(F.g_xs, `タイミング：平均 ${m > 0 ? "+" : ""}${m}ms（${m > 0 ? "早め" : m < 0 ? "遅め" : "ぴったり"}・${this.lastTiming.n}回）`, [200, 170, 184]); S.blit(t, [W - 12 - t.w, H - 22]); }
    this.cardBtn(BTN.ret, "曲選択に戻る", () => { cl.stage.stop_cheer(); this.go("SONG_SELECT", "fade"); }, F.m_md);
  },

  // =====================================================
  // 記録（スマホ版だけの画面）：今日のノルマと、1か月のカレンダー
  // =====================================================
  draw_HOME() {
    const S = this.club.screen, art = this.club.art, F = this.club.F, ink = C.CLUB_COL_INK, sub = C.CLUB_COL_INK_SUB;
    if (!this._off) this.sync.refresh();
    S.blit(art.bg("table"), [0, 0]);
    const P = R(80, 26, 640, 380);
    S.fill([52, 8, 24], P.move(5, 7).arr()); S.blit(art.cached("home_paper", 0, () => art.paper(P.w, P.h, 31)), P.topleft); draw.rect(S, C.CLUB_COL_PAPER_EDGE, P, 2);
    S.blit(art.text(F.m_lg, "出演の記録", ink), [P.x + 22, P.y + 12]);
    if (this.user && this.user.calibAt) { const t = art.text(F.m_xs, `測定: ${this.courseNames[this.user.calib_course] || "じっくりコース"}（${this.user.calibAt.slice(5, 10).replace("-", "/")}）`, sub); S.blit(t, [P.right - 22 - t.w, P.y + 22]); }
    art._rule(S, P.x + 18, P.y + 54, P.w - 36);
    const tc = this.todayCounts();
    S.blit(art.text(F.m_md, "今日のノルマ", C.CLUB_COL_STAMP), [P.x + 24, P.y + 66]);
    S.blit(art.text(F.m_xs, this.todayCleared() ? "今日のトレーニング クリア！" : "各方向3回でクリア（PCとスマホの合計）", this.todayCleared() ? [176, 120, 0] : sub), [P.x + 170, P.y + 72]);
    DIRS5.forEach((k, i) => {
      const v = tc[k] || 0, x = P.x + 24 + i * 120, y = P.y + 100, done = v >= 3, icon = art.small_icon(k, 30);
      draw.rect(S, done ? [226, 244, 230] : [250, 236, 226], [x, y, 108, 42], 0, 6); draw.rect(S, done ? [46, 160, 90] : C.CLUB_COL_PAPER_EDGE, [x, y, 108, 42], 2, 6);
      if (icon) S.blit(icon, [x + 6, y + 6]);
      S.blit(art.text(F.g_sm, `${v}/3`, done ? [28, 136, 84] : ink), [x + 44, y + 12]);
      if (done) S.blit(art.text(F.g_sm, "✓", [28, 136, 84]), [x + 86, y + 12]);
    });
    art.text_c(S, F.m_xs, "※左・右は、反対の肩を下げながら舌を出したときに数えます", sub, W / 2, P.y + 150);
    // カレンダー（初回利用日から31日）
    const start = (this.user && this.user.firstUseDate) || this.localDate(), today = this.localDate(), hist = this.sync.historyMap();
    S.blit(art.text(F.m_sm, `記録（${start.slice(5).replace("-", "/")}〜${this.addDays(start, 30).slice(5).replace("-", "/")}）　●クリア　△遊んだ`, ink), [P.x + 24, P.y + 176]);
    const cw = 84, ch = 26, gx = P.x + 26, gy = P.y + 200;
    for (let i = 0; i < 31; i++) {
      const ds = this.addDays(start, i), r = Math.floor(i / 7), c = i % 7, cx = gx + c * cw, cy = gy + r * ch;
      const loc = this.daily[ds] || {}, srv = hist[ds] || {};
      const cleared = loc.cleared || srv.cleared || (ds === today && this.todayCleared()), plays = (loc.plays || 0) + (srv.plays || 0);
      if (ds === today) draw.rect(S, C.CLUB_COL_STAMP, [cx, cy, cw - 6, ch - 4], 2, 4);
      S.blit(art.text(F.g_xs, ds.slice(5).replace(/^0/, "").replace("-", "/"), ds > today ? C.CLUB_COL_INK_OFF : sub), [cx + 6, cy + 4]);
      if (cleared) S.blit(art.text(F.g_sm, "●", [28, 136, 84]), [cx + cw - 30, cy + 2]);
      else if (plays > 0) S.blit(art.text(F.g_sm, "△", [176, 120, 0]), [cx + cw - 30, cy + 2]);
    }
    const st = this.sync.statusText();
    if (st) S.blit(art.text(F.m_xs, st, [232, 176, 192]), [20, 8]);
    this.scr.hotspot(80, 26, 200, 40, () => this.titleTap("HOME"));
    this.cardBtn(BTN.homeExport, "記録の書き出し（CSV）", () => this.exportCSV(), F.m_xs);   // 修正(1.5.1): 設定から移動
    this.cardBtn(BTN.homeBack, "曲選択へ戻る", () => this.go("SONG_SELECT", "fade"));
  },
};

// プレイの流れ（開演 → プレイ → 終演）。app.js の startSong / drawGame の代わり
export const ClubPlay = {
  async startSong(song, tutorial) {
    this.audio.unlock();
    this.song = song; this.tutorial = tutorial; this.songBuf = null; this.loadFailed = false; this.openingSkip = false; this.cheerPlayed = false;
    this.club.stage.reset(tutorial);
    this.club.sound.stopMusic();
    this.go("OPENING", "fade");
    try {
      await new Promise((r) => setTimeout(r, C.CLUB_OPEN_LOAD_AT * 1000));   // BGM が消えてから読み込む
      const [bm, buf] = await Promise.all([fetch(song.beatmap).then((r) => r.json()), this.audio.load(song.audio)]);
      this.beatmap = bm.map((n) => { const note = { time: n.time, type: n.type, active: true }; if ("duration" in n) { note.duration = n.duration; note.isHolding = false; note.missMs = 0; } return note; });
      this.songBuf = buf;
    } catch (e) { console.error(e); this.loadFailed = true; }
  },
  // 幕が上がりきった瞬間：曲の再生と計時の開始（演出の時間で判定がずれない）
  beginPlaying() {
    this.score = 0; this.combo = 0; this.missCount = 0;
    this.feedback = { text: "", until: 0, x: 400 };
    this.lastElapsed = 0; this.normaThisPlay = { up: 0, down: 0, left: 0, right: 0, front: 0 }; this.justCleared = false;
    if (this.tutorial) { this.tutorialData = { up: [], down: [], left: [], right: [], front: [] }; this.lastTutorialFeatId = -1; }
    else this.beginPlayLog();
    this.audio.setVolumes(this.config.bgm_vol, this.config.se_vol);
    this.audio.playBuffer(this.songBuf, 0);
    this.setScene("PLAYING");
  },
  drawGame(countdown) {
    const cl = this.club, S = cl.screen, stage = cl.stage, e = this.engine, st = e.state;
    const elapsed = this.audio.elapsedMs(), dt = Math.max(0, Math.min(250, elapsed - this.lastElapsed));
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
      if (C.CLUB_OVATION_SEC > 0) { stage.start_ovation(); if (C.CLUB_CHEER_AT === "ovation") { stage.play_cheer(this.score); this.cheerPlayed = true; } this.setScene("OVATION"); }
      else this.go("RESULT", "zoom_out", null, null, (s) => this.renderScene("PLAYING", s));
      return;
    }
        if (!countdown) { stage.update(this.frameDt, this.score, this.combo, now < this.feedback.until && this.feedback.text.includes("MAX")); stage.show.beat(elapsed, this.beatmap, this.config.offset * 10); }
    this.drawPlayBase(S);
    // PC版と同じく「判定文字の残りフレーム数が増えた＝新しい判定」としてエフェクトを出す（判定そのものには触らない）
    const fbFrames = () => Math.max(0, Math.ceil((this.feedback.until - now) / (1000 / 60)));
    const fb0 = fbFrames(), tc0 = this.todayCounts(), normaPrev = DIRS5.map((k) => tc0[k] || 0);
    if (!countdown) { if (this.tutorial) this.updateTutorialNotes(elapsed); else this.updateNotes(elapsed, dt, st, now); }
    if (!countdown && !this.tutorial) {
      const tc1 = this.todayCounts();
      stage.observe(fb0, this.feedback.text, fbFrames(), this.feedback.x, normaPrev, DIRS5.map((k) => tc1[k] || 0));
    }
    const approach = 10000 / this.config.speed_mult, th = 0.02;
    for (let i = this.beatmap.length - 1; i >= 0; i--) {
      const note = this.beatmap[i]; if (!note.active) continue;
      const adj = note.time + this.config.offset * 10, td = adj - elapsed, li = this.laneIndex(note.type), progress = 1 - td / approach;
      if ("duration" in note) {
        const tailP = 1 - (adj + note.duration - elapsed) / approach;
        if (progress > -0.1 && tailP < 2) {
          const top = Math.max(0, tailP); let bot = Math.max(0, progress); if (note.isHolding) bot = Math.min(1, bot);
          const col = note.isHolding ? [200, 180, 50] : [50, 150, 140], poly = [p3d(li - 0.5, top), p3d(li + 0.5, top), p3d(li + 0.5, bot), p3d(li - 0.5, bot)];
          stage.band_glow(S, col, poly); draw.polygon(S, col, poly);
        }
      }
      if ((progress > -0.1 && progress < 2) || note.isHolding) {
        const [top, bot] = note.isHolding ? [1 - th, 1 + th] : [Math.max(0, progress - th), Math.max(0, progress + th)];
        const col = note.type.includes("shoulder") ? [231, 76, 60] : (note.duration || 0) >= 5000 ? [255, 215, 0] : [78, 205, 196];
        const poly = [p3d(li - 0.5, top), p3d(li + 0.5, top), p3d(li + 0.5, bot), p3d(li - 0.5, bot)];
        stage.note_glow(S, col, poly); draw.polygon(S, col, poly); draw.polygon(S, [255, 255, 255], poly, 2);
      }
    }
    stage.draw_fx(S); this.drawPlayIcons(S); stage.draw_icon_flash(S);
    if (now < this.feedback.until && !this.tutorial) stage.draw_feedback(S, this.feedback.text, Math.ceil((this.feedback.until - now) / (1000 / 60)), this.feedback.x);
    stage.draw_popups(S);
    this.drawPlayHud(S);
    if (!countdown && !this._off) this.scr.hotspot(BTN.pause.x - 6, BTN.pause.y - 6, 72, 72, () => { this.audio.pause(); this.go("PAUSE", "curtain_down"); });
    if (countdown) {
      const el = now - this.countdownStart, remain = 3 - Math.floor(el / 1000);
      if (remain <= 0) { this.audio.resume(); this.lastElapsed = this.audio.elapsedMs(); this.setScene("PLAYING"); }
      else this.drawCountIn(S, el, remain);
    }
  },
  async finishTutorial() {
    this.tutorial = false;
    this.trainBg = "play_rehearsal"; this.setScene("TRAINING"); this.trainMsg = "チュートリアルの動きを学習しています"; this.trainProgress = 0;
    for (const k of Object.keys(this.tutorialData)) {
      if (k in this.calibDataset) {
        let dyn = this.tutorialData[k];
        if (dyn.length > 200) dyn = dyn.slice().sort(() => Math.random() - 0.5).slice(0, 200);
        this.calibDataset[k].push(...dyn);
      }
    }
    const ok = await this.trainAndSave();
    if (!ok) this.popup("学習に失敗しました（測定のときのモデルを使います）", 4000, "#E74C3C");
    this.testState = "IDLE";
    this.go("CHECK_DETECTION", "pan_right");
  },
};
