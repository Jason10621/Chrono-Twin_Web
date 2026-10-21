/**
 * 이스터에그 — 숨은 장난 모음
 * =============================
 * 임계값·문구를 한 곳에 모아 두었다. 결과 숫자나 모형 계산은 절대 바꾸지 않고,
 * 보여주는 문구·연출만 바꾼다(그래서 연구 결과의 신뢰도에는 영향이 없다).
 *
 *  1. 화성 시차     — 위상 지연이 ≈39분이면 "화성", 그보다 늦으면 화성과의 차이, 극단이면 마리아나 해구
 *  2. 카페인 폭주   — 카페인 슬라이더를 끝까지 올리면 화면이 떨리고 문구가 바뀜
 *  3. 0lux 손전등   — 방 조명을 0으로 내리면 화면이 어두워지고 마우스 주변만 보임
 *  4. 수면 양극단   — 평균 수면 0시간 / 최대치
 *  5. AI 코치       — "졸려" · "잘 자" · "치킨" 한마디 반응(서버 호출 없음)
 *  6. 코나미 코드   — ↑↑↓↓←→←→BA → 양 울타리 점프 미니게임 (화살표 키로 점프, lib/sheepGame.ts)
 *  7. 새벽 접속     — 현지 시각 02~05시에 상단 배너 (?egg=dawn 으로 낮에도 확인 가능)
 *  8. 로고 5연타    — 졸린 쌍둥이
 */
import { GROUND_TRUTH, ledEveningLoad } from "./chronoTwinModel";

/* ── 1. 화성 시차 ─────────────────────────────────────────────── */
/** 화성의 하루는 24시간 39분 35초 — 지구보다 약 39분 길다. */
export const MARS_DELAY_MIN = 39;
/** 39분 ± 이 값 안이면 "화성". */
export const MARS_WINDOW_MIN = 5;
/** 이 이상이면 "마리아나 해구". 슬라이더를 거의 끝까지 밀어야 닿는 값(만점 근처 ≈190분). */
export const MARIANA_DELAY_MIN = 150;
/** 마리아나 해구 좌표(챌린저 해연 부근)와 가장 가까운 IANA 시간대(괌). */
export const MARIANA = { lat: 11.35, lon: 142.2, timezone: "Pacific/Guam" };

export type JetlagEgg =
  | { kind: "mars" }
  | { kind: "mars-over"; overMin: number }
  | { kind: "mariana" }
  | null;

export function jetlagEgg(phaseDelayMin: number): JetlagEgg {
  const d = Math.round(phaseDelayMin);
  if (d >= MARIANA_DELAY_MIN) return { kind: "mariana" };
  if (Math.abs(d - MARS_DELAY_MIN) <= MARS_WINDOW_MIN) return { kind: "mars" };
  if (d > MARS_DELAY_MIN + MARS_WINDOW_MIN) return { kind: "mars-over", overMin: d - MARS_DELAY_MIN };
  return null;
}

/* ── 2·4. 입력 슬라이더 극단 ──────────────────────────────────── */
export const CAFFEINE_SLIDER_MAX = 400;
export const SLEEP_SLIDER_MIN = 0;
export const SLEEP_SLIDER_MAX = 12;

export type InputEgg =
  | { kind: "caffeine"; badge: string; hint: string }
  | { kind: "sleep-zero"; badge: string; hint: string }
  | { kind: "sleep-max"; badge: string; hint: string };

export function inputEgg(i: { caffeineMg: number; avgRecentSleepHours: number }): InputEgg | null {
  if (i.caffeineMg >= CAFFEINE_SLIDER_MAX) {
    return {
      kind: "caffeine",
      badge: "정상 (심박수 제외)",
      hint: "아메리카노 17잔. 글자가 떨리는 건 버그가 아닙니다",
    };
  }
  if (i.avgRecentSleepHours <= SLEEP_SLIDER_MIN) {
    return { kind: "sleep-zero", badge: "정상 +∞분", hint: "그건 수면이 아니라 근무입니다" };
  }
  if (i.avgRecentSleepHours >= SLEEP_SLIDER_MAX) {
    return { kind: "sleep-max", badge: "정상 +∞분", hint: "곰이세요? 🐻 겨울잠 모드 진입" };
  }
  return null;
}

/* ── 3. 0lux 손전등 ───────────────────────────────────────────── */
/** "켜면 +N분"을 셈할 때 쓰는 기준 밝기(슬라이더 기본값과 같다). */
export const LIGHTS_ON_REFERENCE_LUX = 200;

/** 같은 모형으로 구한 진짜 값이다 — 기본 조명(200lux)을 켜면 위상 지연이 몇 분 늘어나는지. */
export function lightsOutHint(colorTempK: number): string {
  const addMin = GROUND_TRUTH.gammaLedLoad * ledEveningLoad(LIGHTS_ON_REFERENCE_LUX, colorTempK);
  return `불 켜세요… 근데 켜면 +${addMin.toFixed(1)}분인데…`;
}

/* ── 5. AI 코치 한마디 ────────────────────────────────────────── */
export interface ChatEgg {
  reply: string;
  delayMs: number;
}

const normalizeChat = (s: string) => s.toLowerCase().replace(/[\s.,!?~…ㅋㅎㅠㅜ]/g, "");

const CHAT_EGGS: { words: string[]; egg: ChatEgg }[] = [
  {
    words: ["졸려", "졸려요", "졸림", "졸리다", "졸리네", "졸리네요", "졸려죽겠다"],
    egg: { reply: "저도요.", delayMs: 500 },
  },
  {
    words: ["잘자", "잘자요", "잘자라", "굿나잇", "굿나이트", "굿밤"],
    egg: { reply: "전 AI라 안 자요. 대신 서버가 졸고 있어요 (응답 3초 지연)", delayMs: 3000 },
  },
  {
    words: ["치킨", "치킨먹고싶다", "치킨먹고싶어", "치킨시켜", "치킨먹을래", "치느님"],
    egg: { reply: "카페인 0mg. 하지만 제 마음은 흔들립니다", delayMs: 700 },
  },
];

/** 입력이 이 짧은 말과 정확히 같을 때만 반응한다 — 진짜 질문은 그대로 AI 에게 간다. */
export function chatEgg(text: string): ChatEgg | null {
  const n = normalizeChat(text);
  if (!n) return null;
  for (const { words, egg } of CHAT_EGGS) if (words.includes(n)) return egg;
  return null;
}

/* ── 6. 코나미 코드 ───────────────────────────────────────────── */
export const KONAMI = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
];
/** 게임 오버 문구 — 몇 마리를 넘었든 결론은 같다. */
export function sheepFinale(count: number): string {
  return `양 ${count.toLocaleString("ko-KR")}마리째. 이제 안 졸림. 새벽 3시. 당신이 졌습니다`;
}

/* ── 7. 새벽 접속 ─────────────────────────────────────────────── */
export const DAWN_FROM_HOUR = 2; // 02:00 ~ 04:59
export const DAWN_TO_HOUR = 5;
export const DAWN_TEXT = "지금 이 사이트 보고 계시죠? 분석 필요 없어요. 결과는 이미 나왔습니다";

export function isDawn(now = new Date()): boolean {
  const h = now.getHours();
  return h >= DAWN_FROM_HOUR && h < DAWN_TO_HOUR;
}

/* ── 8. 로고 5연타 ────────────────────────────────────────────── */
export const LOGO_CLICKS = 5;
export const TWIN_TEXT = "저는 이미 자고 있는 당신입니다. 와서 자세요";
