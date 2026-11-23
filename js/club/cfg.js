// =====================================================
// cfg.js — 演出の数値（PC版 1122_2 の「タイトル演出の設定」「演出の設定」と同じ値・同じ名前）
//   見た目だけの数値。判定・スコア・記録には使っていない
// =====================================================
// --- 使用ファイル（assets/club/ に置く。無い・読めない場合は、その音や画像を省いて動く） ---
export const DIR = "assets/club/";
export const TITLE_SE_SPARK = "spark.m4a";            // PC版：電気バチバチ_効果音ラボ.mp3
export const TITLE_SE_LIGHTS_ON = "lights_on.m4a";    // PC版：スポットライトが当たる_効果音ラボ.mp3
export const TITLE_BGM = "elise_3.m4a";               // PC版：elise_3.wav
export const TITLE_NEON_FONT = "neon_font.ttf";
export const TITLE_BG_LIT_IMG = "bg_lit.png";
export const TITLE_BG_DARK_IMG = "bg_dark.png";
export const TITLE_NEON_SYSFONTS = '"Snell Roundhand","Segoe Script","Brush Script MT","Lucida Handwriting","Segoe Print","Dancing Script",cursive';

export const TITLE_DARK_MIN_SEC = 1.5;
export const TITLE_T_NEON_FLICKER = 0.3, TITLE_T_NEON_STABLE = 1.0, TITLE_T_CROSSFADE = 1.3, TITLE_CROSSFADE_SEC = 0.6;
export const TITLE_T_LAMPS = 1.8, TITLE_LAMP_STAGGER = 0.2, TITLE_LAMP_RETURN_SEC = 0.6, TITLE_LAMP_OVERSHOOT = 1.7;
export const TITLE_T_SPOT = 2.5, TITLE_SPOT_FADE_SEC = 0.5, TITLE_T_READY = 4.3;
export const TITLE_NEON_FLICKER_PATTERN = [[0.00, 1.0], [0.08, 0.0], [0.22, 1.0], [0.34, 0.55], [0.44, 1.0], [0.52, 0.0], [0.60, 1.0]];
export const TITLE_NEON_ZAP_THRESH = 0.5;
export const TITLE_VOL_SPARK_LOOP = 0.35, TITLE_VOL_SPARK_BOOST = 0.90, TITLE_SPARK_BOOST_SEC = 0.30, TITLE_VOL_SPARK_ONESHOT = 0.80;
export const TITLE_VOL_NEON_ZAP = 0.45, TITLE_NEON_ZAP_MS = 150, TITLE_VOL_LIGHTS_ON = 1.00, TITLE_VOL_BGM = 1.00;
export const TITLE_SPARK_LOOP_MIN_SEC = 1.5, TITLE_SPARK_FADEOUT_MS = 200, TITLE_BGM_FADEIN_MS = 1000, TITLE_BGM_FADEOUT_MS = 500;

export const TITLE_LAMPS = [
  { anchor: [52, 12], cord_len: 96, droop_deg: -15, home_deg: 0, spark_tip: [17, 62], sway_deg: 2.2, sway_period: 3.1 },
  { anchor: [112, 12], cord_len: 50, droop_deg: 19, home_deg: 0, spark_tip: [-15, 30], sway_deg: 3.0, sway_period: 2.3 },
  { anchor: [722, 12], cord_len: 78, droop_deg: -31, home_deg: 0, spark_tip: [16, 48], sway_deg: 2.6, sway_period: 2.7 },
];
export const TITLE_LAMP_SHADE_W = 46, TITLE_LAMP_SHADE_H = 22, TITLE_LAMP_HALO_R = 74, TITLE_LAMP_HALO_COL = [150, 96, 84], TITLE_LAMP_CACHE_MAX = 80;

export const TITLE_SPARK_INTERVAL = [0.5, 2.5], TITLE_SPARK_COUNT = [8, 14], TITLE_SPARK_BIG_COUNT = 30, TITLE_SPARK_MAX = 100;
export const TITLE_SPARK_LIFE = [0.3, 0.6], TITLE_SPARK_SPEED = [50, 210], TITLE_SPARK_UP_BIAS = 50, TITLE_SPARK_GRAVITY = 560;
export const TITLE_SPARK_COLORS = [[255, 252, 226], [255, 238, 170], [255, 220, 120], [214, 232, 255], [168, 204, 255]];
export const TITLE_SPARK_GLOW_R = 58, TITLE_SPARK_GLOW_COL = [120, 140, 190], TITLE_SPARK_GLOW_SEC = 0.14;
export const TITLE_FLASH_STRENGTH = 115, TITLE_FLASH_SEC = 0.28;

export const TITLE_NEON_TEXT = "Tongue Music Club";
export const TITLE_NEON_CENTER = [400, 55], TITLE_NEON_SIZE = 62, TITLE_NEON_MAX_W = 440, TITLE_NEON_BOLD = true, TITLE_NEON_TUBE_WIDTH = 2;
export const TITLE_NEON_OFF_COL = [60, 38, 50], TITLE_NEON_TUBE_COL = [255, 62, 150], TITLE_NEON_CORE_COL = [255, 232, 244], TITLE_NEON_GLOW_COL = [235, 40, 128];
export const TITLE_NEON_GLOW_PAD = 30, TITLE_NEON_GLOW_BLUR = [[3, 1], [9, 2]], TITLE_NEON_FLICKER_GLOW = 0.35, TITLE_NEON_GLOW_FADE_SEC = 0.3;
export const TITLE_NEON_BREATH = 0.10, TITLE_NEON_BREATH_PERIOD = 4.0, TITLE_NEON_BLINK_INTERVAL = [5.0, 10.0], TITLE_NEON_BLINK_SEC = [0.05, 0.13];
export const TITLE_NEON_BLINK_LEVEL = 0.12, TITLE_NEON_BLINK_WORD_PROB = 0.35;

export const TITLE_STAGE_X0 = 150, TITLE_STAGE_X1 = 650, TITLE_STAGE_TOP = 100, TITLE_STAGE_FLOOR_Y = 318, TITLE_STAGE_FRONT_Y = 324, TITLE_FLOOR_Y = 352;
export const TITLE_TABLES = [[292, 384, 0.78], [508, 384, 0.78], [168, 420, 1.0], [636, 420, 1.0]];
export const TITLE_SPOT_BEAMS = [[[300, 100], 28, [400, 322], 210], [[500, 100], 28, [400, 322], 210]];
export const TITLE_SPOT_POOL = [400, 316, 250, 30], TITLE_SPOT_COL = [74, 54, 62];

export const TITLE_COL_WALL_TOP = [56, 10, 26], TITLE_COL_WALL_BOTTOM = [118, 22, 48], TITLE_COL_WAINSCOT = [58, 12, 28], TITLE_COL_TRIM = [222, 96, 138];
export const TITLE_COL_CEILING = [26, 6, 14], TITLE_COL_FRAME = [30, 8, 16], TITLE_COL_SILHOUETTE = [18, 5, 11];
export const TITLE_COL_CURTAIN_LIGHT = [240, 110, 156], TITLE_COL_CURTAIN_DARK = [150, 20, 52], TITLE_COL_DRAPE = [190, 30, 70], TITLE_COL_STAGE_TOP = [128, 56, 52];
export const TITLE_COL_FLOOR_A = [158, 32, 64], TITLE_COL_FLOOR_B = [30, 8, 16], TITLE_COL_CLOTH_TOP = [226, 110, 146], TITLE_COL_CLOTH_SIDE = [160, 32, 68];
export const TITLE_CURTAIN_FOLD_W = 27;
export const TITLE_DARK_SATURATION = 0.38, TITLE_DARK_BRIGHTNESS = 0.40, TITLE_DARK_TINT = [0.82, 0.95, 1.30];
export const TITLE_DUST_COUNT = 520, TITLE_DUST_SEED = 1110, TITLE_DUST_MOTES = 22, TITLE_MOON_COL = [30, 38, 62];

export const TITLE_TEXT_WAIT_MAIN = "準備中…";
export const TITLE_TEXT_WAIT_SUB = "カメラの読み込みを待っています";
export const TITLE_TEXT_READY = "カメラ準備完了！ STARTを押してください";
export const TITLE_SUBTITLE = "";
export const TITLE_UI_FADE_SEC = 0.4;

// --- 1111_1：タイトル以外 ---
export const CLUB_MINCHO_SIZES = { xs: 13, sm: 15, md: 21, lg: 30, xl: 44 };
export const CLUB_TRANS_ENABLED = true, CLUB_TRANS_CLICK_SKIP = true;
export const CLUB_TRANS_SEC = { pan: 0.70, zoom: 0.85, fade: 0.40, curtain: 0.55, page: 0.60 };
export const CLUB_ZOOM_FADE_START = 0.45;
export const CLUB_COL_FALLBACK = [38, 8, 20], CLUB_COL_PINK = [255, 150, 188], CLUB_COL_PINK_DEEP = [240, 110, 156], CLUB_COL_CREAM = [252, 236, 226];
export const CLUB_COL_GOLD = [241, 196, 15], CLUB_COL_PAPER = [250, 241, 228], CLUB_COL_PAPER_EDGE = [206, 170, 156];
export const CLUB_COL_INK = [58, 26, 32], CLUB_COL_INK_SUB = [132, 92, 96], CLUB_COL_INK_OFF = [176, 158, 156], CLUB_COL_STAMP = [204, 36, 52];
export const CLUB_COL_CARD_HOVER = [255, 214, 226], CLUB_COL_CARD_SHADOW = [40, 6, 18], CLUB_COL_COVER = [104, 18, 42];
export const CLUB_COL_CLOTH = [150, 30, 64], CLUB_COL_CLOTH_DARK = [96, 16, 40], CLUB_COL_TABLET_TOP = [56, 10, 26], CLUB_COL_TABLET_BOTTOM = [30, 6, 16];
export const CLUB_COL_BEZEL = [9, 8, 11], CLUB_COL_BOARD_TOP = [26, 52, 43], CLUB_COL_BOARD_BOTTOM = [15, 33, 28];
export const CLUB_COL_CHALK = [238, 238, 228], CLUB_COL_CHALK_YELLOW = [250, 226, 122], CLUB_COL_CHALK_BLUE = [150, 216, 228], CLUB_COL_CHALK_PINK = [255, 150, 164];
export const CLUB_COL_METAL = [40, 36, 46], CLUB_COL_METAL_EDGE = [104, 96, 116], CLUB_COL_LED = [255, 196, 96];
export const CLUB_DIFF_INK = { EASY: [28, 136, 84], NORMAL: [14, 124, 122], HARD: [198, 46, 44] };
export const CLUB_TABLET_BEZEL = 10, CLUB_TABLET_RADIUS = 20;
export const CLUB_LOGIN_TABLET = [150, 22, 500, 392], CLUB_LOGIN_COUNTER_Y = 404;
export const CLUB_BOOK_RECT = [66, 40, 668, 318], CLUB_MENU_PER_PAGE = 3, CLUB_CARD_ROW_Y = 418, CLUB_CARD_H = 40;
export const CLUB_RECEIPT_RECT = [250, 12, 300, 404];
export const CLUB_MIXER_CX = [152, 236, 320, 404], CLUB_MIXER_TRACK = [192, 344], CLUB_RULE_SHIFT_Y = 14;
export const CLUB_PLAY_BG_BRIGHTNESS = 0.26, CLUB_PLAY_BG_SATURATION = 0.55, CLUB_PLAY_LANE_SHADE = 120, CLUB_LANE_LINE_COL = [92, 62, 78];
export const CLUB_REHEARSAL_STAGE_BRIGHTNESS = 0.62;
export const CLUB_AUDIENCE_MAX = 200, CLUB_AUDIENCE_STEP_SCORE = 100000, CLUB_AUDIENCE_STEP_COUNT = 20;
export const CLUB_AUDIENCE_POP_SPAN = 0.8, CLUB_AUDIENCE_POP_SEC = 0.28, CLUB_AUDIENCE_POP_JUMP = 26;
export const CLUB_AUDIENCE_SCALE = [0.42, 1.0], CLUB_AUDIENCE_ROW_Y = [168, 476], CLUB_AUDIENCE_COL = [12, 5, 9], CLUB_AUDIENCE_RIM_COL = [206, 92, 136];
export const CLUB_AUDIENCE_SWAY_DEG = 6, CLUB_AUDIENCE_SWAY_STEP = 2, CLUB_AUDIENCE_SWAY_PERIOD = 0.9, CLUB_AUDIENCE_SWAY_IN = 0.15, CLUB_AUDIENCE_SWAY_OUT = 0.6;
export const CLUB_AUDIENCE_SEED = 1111;
export const CLUB_COUNTIN_WORDS = { 3: "3", 2: "2", 1: "1" }, CLUB_COUNTIN_CURTAIN_SEC = 0.6;
export const CLUB_RESULT_DROP_SEC = 0.35, CLUB_RESULT_STAMP_AT = 0.7, CLUB_RESULT_STAMP_SEC = 0.22;

// --- 1111_2：満月と雲・幕・バンド・観客 ---
export const TITLE_MOON_PANE = [69, 156, 31, 45], TITLE_MOON_POS = [84, 178], TITLE_MOON_R = 9, TITLE_FULLMOON_COL = [255, 250, 222];
export const TITLE_MOON_GLOW_COL = [120, 124, 150], TITLE_MOON_GLOW_R = 46, TITLE_MOON_GLOW_HIDDEN = 0.12;
export const TITLE_CLOUD_COL = [104, 110, 142], TITLE_CLOUD_SWAY = [1.5, 7.0], TITLE_CLOUD_MOVE = 30, TITLE_T_CLOUDS = 1.3, TITLE_CLOUDS_SEC = 1.5;
export const TITLE_T_CURTAIN = 2.8, TITLE_CURTAIN_SEC = 1.5, TITLE_CURTAIN_FOLD = 27;
export const TITLE_BG_INSTRUMENTS = false;
export const TITLE_BAND_SCALE = 0.5, TITLE_BAND_FACE_D = 92, TITLE_BAND_SWAY_X = 0, TITLE_BAND_SWAY_Y = 0, TITLE_BAND_SWAY_PERIOD = 1.1;
export const TITLE_BAND_SUIT = [250, 250, 252], TITLE_BAND_SUIT_SHADE = [206, 206, 220], TITLE_BAND_RED = [214, 30, 52], TITLE_BAND_SKIN = [246, 224, 184];
export const TITLE_BAND = [
  { face: "left", inst: "guitar", x: 206, foot_dy: 0, scale: 1.0, anchor: "top", face_dx: 0, face_dy: 0, face_scale: 1.0, hat_dx: 0, hat_dy: 0, hat_scale: 1.0 },
  { face: "up", inst: "drums", x: 302, foot_dy: -6, scale: 1.0, anchor: "bottom", face_dx: 0, face_dy: 0, face_scale: 1.0, hat_dx: 0, hat_dy: 0, hat_scale: 1.0 },
  { face: "front", inst: "vocal", x: 400, foot_dy: 2, scale: 1.08, anchor: "top", face_dx: 0, face_dy: 0, face_scale: 1.0, hat_dx: 0, hat_dy: 0, hat_scale: 1.0 },
  { face: "down", inst: "bass", x: 498, foot_dy: 0, scale: 1.0, anchor: "top", face_dx: 0, face_dy: 0, face_scale: 1.0, hat_dx: 0, hat_dy: 0, hat_scale: 1.0 },
  { face: "right", inst: "keyboard", x: 594, foot_dy: 0, scale: 1.0, anchor: "top", face_dx: 0, face_dy: 0, face_scale: 1.0, hat_dx: 0, hat_dy: 0, hat_scale: 1.0 },
];
export const TITLE_BTN_Y = 378;
export const TITLE_AUDIENCE_COUNT = 60, TITLE_AUDIENCE_SPAN = 1.5, TITLE_AUDIENCE_SWAY = 0.6;
export const CLUB_PLAY_BAND_BRIGHTNESS = 0.26, CLUB_PLAY_BAND_SATURATION = 0.5, CLUB_PLAY_BAND_SWAY = 0.8;
export const CLUB_ICON_BACK_R = 33, CLUB_ICON_BACK_COL = [22, 8, 15], CLUB_ICON_BACK_EDGE = [255, 176, 204], CLUB_NORMA_ICON_SIZE = 30;
export const CLUB_AUDIENCE_LANE_MARGIN = 14, CLUB_AUDIENCE_FLOOR_PAD = 6;

// --- 1116_1：プレイ中 ---
export const SE_OPENING_BUZZER = "buzzer.m4a";        // PC版：開演ブザー_効果音ラボ.mp3
export const SE_CHEER_SMALL = "cheer_small.m4a";      // PC版：歓声と拍手2_効果音ラボ.mp3
export const SE_CHEER_BIG = "cheer_big.m4a";          // PC版：スタジアムの歓声1_効果音ラボ.mp3
export const CLUB_CHEER_BIG_SCORE = 500000, CLUB_CHEER_AT = "receipt", CLUB_CHEER_FADE_MS = 500;
export const CLUB_OPEN_T_TITLE = 0.3, CLUB_OPEN_T_BUZZER = 0.3, CLUB_OPEN_T_LIGHT = 1.3, CLUB_OPEN_T_RISE = 2.3, CLUB_OPEN_T_END = 3.8;
export const CLUB_OPEN_FADE_SEC = 0.5, CLUB_OPEN_DARK = 0.30, CLUB_OVATION_SEC = 2.0;
export const CLUB_VIEW_HORIZON = 172, CLUB_VIEW_BRIGHTNESS = 0.27, CLUB_VIEW_SATURATION = 0.55, CLUB_LANE_FLOOR_ALPHA = 115;
export const CLUB_STAGE_EDGE = [[0, 336], [46, 340], [140, 400], [660, 400], [742, 388], [800, 384]];
export const CLUB_VIEW_TABLES = [[205, 0.42, [90, 210, 330, 470, 590, 710]], [252, 0.60, [150, 320, 480, 650]], [314, 0.85, [80, 260, 540, 720]]];
export const CLUB_VIEW_LAMPS = [330, 470];
export const CLUB_CROWD_ROW_Y = [188, 392], CLUB_CROWD_SCALE = [0.30, 0.92], CLUB_CROWD_STAND_RATIO = 0.2, CLUB_CROWD_BEHIND_DAMP = 0.5;
export const CLUB_CHEER_COUNT = 5, CLUB_CHEER_SEC = 0.5, CLUB_WAVE_SEC = 1.0, CLUB_COMBO_MILESTONES = [10, 25, 50, 100];
export const CLUB_SCORE_ROLL_SEC = 0.3, CLUB_SCORE_POP_MIN = 2000, CLUB_SCORE_POP_SEC = 0.3, CLUB_GAUGE_RECT = [20, 52, 200, 9];
export const CLUB_COMBO_BOUNCE_SEC = 0.18, CLUB_COMBO_MILESTONE_SEC = 1.0, CLUB_COMBO_FADE_SEC = 0.3;
export const CLUB_FX_MAX_PARTICLES = 150, CLUB_FX_SPARKS_EXCELLENT = 14, CLUB_FX_SPARKS_HOLD = 0.35, CLUB_FX_CONFETTI = 36;
export const CLUB_FX_RING = { excellent: [16, 74, 0.34], nice: [12, 44, 0.26], perfect: [20, 112, 0.5] };
export const CLUB_FX_MAX_SCALE = 1.25, CLUB_FX_FLASH_SEC = 0.2;
export const CLUB_FX_COL_GOLD = [255, 214, 64], CLUB_FX_COL_BLUE = [120, 214, 255], CLUB_FX_COL_PINK = [255, 110, 186], CLUB_FX_COL_MISS = [150, 150, 162];
export const CLUB_NOTE_GLOW = 0.42, CLUB_NORMA_POP_SEC = 1.5;

// --- 1116_3：ステージの盛り上がり ---
export const STAGE_LEVEL_SCORES = [0, 200000, 400000, 600000, 800000, 900000];
export const STAGE_LEVEL_MESSAGES = ["", "客席が温まってきた", "照明さんも本気を出してきた", "ミラーボール、点灯！", "店中が虹色に！", "伝説のステージ！"];
export const STAGE_DEBUG = false;   // PC版は True（数字キーで段階を試す）。スマホにはキーが無いので使わない
export const STAGE_MSG_SEC = 1.5, STAGE_MSG_Y = 108;
export const STAGE_SPOTS = [
  { ox: 290, cx: 250, amp: 140, ty: 300, period: 10.0, phase: 0.0, solo_cx: 400, solo_amp: 220 },
  { ox: 510, cx: 560, amp: 140, ty: 300, period: 12.0, phase: 2.1 },
  { ox: 560, cx: 460, amp: 190, ty: 300, period: 14.0, phase: 4.0 },
];
export const STAGE_SPOT_LEVEL = 24;
export const STAGE_SPOT_COLS = { white: [255, 244, 232], pink: [255, 132, 176], red: [255, 78, 92], gold: [255, 206, 88] };
export const STAGE_SPOT_ORDER = ["pink", "red", "gold"];
export const STAGE_SPOT_WARM_SEC = 1.0, STAGE_SPOT_MIX_SEC = 0.4, STAGE_SPOT_MIX_STEPS = 6, STAGE_SPOT_GROW_SEC = 0.7, STAGE_SPOT_FOLLOW = 5.0, STAGE_SPOT_SLICE = 4;
export const STAGE_FOCUS_SEC = 0.8, STAGE_FOCUS_Y = 372, STAGE_FOCUS_SPREAD = 190;
export const STAGE_RAINBOW_COLORS = 12, STAGE_RAINBOW_SEC = 6.0, STAGE_RAINBOW_SAT = 0.50, STAGE_GOLD_EVERY = 8.0, STAGE_GOLD_SEC = 1.6;
export const STAGE_CANDLE_GAP = 0.5, STAGE_CANDLE_GLOW = [86, 54, 22], STAGE_CANDLE_LANE_RATE = 0.5;
export const STAGE_FOOT_COL = [112, 80, 52], STAGE_FOOT_RADIUS = 32, STAGE_FOOT_LANE_RATE = 0.6, STAGE_FOOT_BASE = 0.50, STAGE_FOOT_ON_SEC = 1.0;
export const STAGE_FOOT_COMBO = 20, STAGE_FOOT_RUN_SEC = 1.6, STAGE_FOOT_FADE_SEC = 0.5;
export const STAGE_BALL_POS = [400, 44], STAGE_BALL_R = 17, STAGE_BALL_DROP_SEC = 1.5, STAGE_BALL_FRAME_SEC = 0.4, STAGE_BALL_DOTS = 36;
export const STAGE_DOT_COL = [46, 44, 52], STAGE_DOT_SPEED = [14, 30];
export const STAGE_SIGN_TEXT = "Tongue Music Club", STAGE_SIGN_CENTER = [314, 40], STAGE_SIGN_MAX_W = 114, STAGE_SIGN_ON_SEC = 1.0;
export const STAGE_CONFETTI = 40, STAGE_CONFETTI_COLS = [[232, 190, 70], [200, 158, 52], [244, 220, 132]], STAGE_CONFETTI_SPEED = [30, 54];
export const STAGE_LANE_PARTICLE_RATE = 0.0;
export const STAGE_PULSE_GAIN = 0.10, STAGE_PULSE_ADD = 5, STAGE_PULSE_SEC = 0.15, STAGE_PULSE_MIN_GAP = 0.35;

// --- 1116_2：画面ごとの BGM・案内 ---
export const BGM_LOGIN = "elise_3.m4a", BGM_CALIB = "carib.m4a", BGM_MENU = "song.m4a", BGM_CHECK = "carib.m4a";
export const BGM_CALIB_RATE = 0.5, BGM_FADE_MS = 500;
export const CLUB_WELCOME_T_PAN = 0.8, CLUB_WELCOME_T_TABLE = 1.6, CLUB_WELCOME_T_OPEN = 2.2, CLUB_WELCOME_T_END = 3.0;
export const CLUB_CROWD_SPARSE_DIST = 70, CLUB_CROWD_SPARSE_LOOK = 14, CLUB_CROWD_STAND_AFTER = 0.8;
export const CLUB_PREVIEW_RECT = [458, 76, 260, 256], CLUB_PREVIEW_SCALE = 0.85, CLUB_PREVIEW_BEAT_MS = 1000, CLUB_PREVIEW_FLASH_MS = 110, CLUB_OPEN_LOAD_AT = 0.7;

// --- レーン（判定と同じ値。app.js と同じ） ---
export const VANISHING_Y = 150, JUDGE_Y = 400, LANE_WIDTH_TOP = 20, LANE_WIDTH_BOTTOM = 68;
export const laneHalf = (y) => { const z = (y - VANISHING_Y) / (JUDGE_Y - VANISHING_Y); return 3.5 * (LANE_WIDTH_TOP + (LANE_WIDTH_BOTTOM - LANE_WIDTH_TOP) * Math.max(0, z)); };
export const ease = (p) => { p = Math.max(0, Math.min(1, p)); return p * p * (3 - 2 * p); };
export const easeOut = (p) => { const q = 1 - Math.max(0, Math.min(1, p)); return 1 - q * q * q; };
export const easeOutBack = (p, o) => { const q = Math.max(0, Math.min(1, p)) - 1; return 1 + (o + 1) * q * q * q + o * q * q; };
