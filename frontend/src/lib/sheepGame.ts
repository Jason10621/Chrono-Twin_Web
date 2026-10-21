/**
 * 양 울타리 점프 — 코나미 코드 이스터에그 미니게임의 규칙 (화면·키 입력과 분리된 순수 로직)
 * ================================================================================
 * 좌표는 800×300 논리 픽셀. 양은 제자리(SHEEP_X)에 있고 장애물이 오른쪽에서 다가온다.
 *
 *  · 울타리 — 점프(↑ ← →)로 넘는다.
 *  · 별     — 가끔 위에서 내려와 양의 머리 높이로 날아온다. ↓ 를 누르는 동안 숙여서 피한다.
 *
 * 난이도는 "달린 시간"에 따라 오른다(DIFFICULTY_RAMP_S 에 걸쳐 0→1):
 * 속도 · 울타리 사이 간격 · 키 큰 울타리와 쌍둥이 울타리의 비율 · 별이 나오는 빈도.
 *
 * 공정성: 장애물 묶음 사이 간격은 거리가 아니라 "시간"으로 정해서, 빨라져도 착지 후 다시 뛰거나
 * 일어설 틈이 남는다. 쌍둥이·세쌍둥이 울타리는 한 번의 점프로 넘을 수 있을 때만 나온다.
 * (완벽한 타이밍의 봇이 최고 난이도에서도 끝까지 살아남는지 시뮬레이션으로 확인했다.)
 */

export const W = 800;
export const H = 300;
export const GROUND = 252; // 땅 y 좌표
export const SHEEP_X = 130; // 양의 가로 위치(몸 중심)

export const GRAVITY = 2600; // px/s²
export const JUMP_V = 720; // px/s — 최고점 ≈ 100px, 공중 시간 ≈ 0.55초
export const JUMP_BUFFER_S = 0.12; // 착지 직전에 눌러도 착지하자마자 뛴다
export const RESTART_LOCK_S = 0.45; // 게임 오버 직후 실수로 다시 시작하지 않도록

/* ── 난이도 ── */
export const SPEED_BASE = 340; // px/s
export const SPEED_MAX = 820;
export const DIFFICULTY_RAMP_S = 96; // 이 시간 동안 난이도가 0 → 1 로 오른다
export const LEVEL_S = 12; // 화면에 보이는 레벨이 한 칸 오르는 시간
export const MAX_LEVEL = 9;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 달린 시간(초) → 난이도 0~1. */
export function difficulty(playTime: number): number {
  return Math.min(1, Math.max(0, playTime / DIFFICULTY_RAMP_S));
}
export function levelOf(playTime: number): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(playTime / LEVEL_S));
}
export function speedAt(playTime: number): number {
  return lerp(SPEED_BASE, SPEED_MAX, difficulty(playTime));
}

/** 충돌 상자(양): 좌우로 살짝 좁게, 발 쪽은 여유를 준다 — 아슬아슬하게 스치면 통과. */
export const HIT = { left: 16, right: 26, feetMargin: 6, fenceInsetX: 5, fenceInsetTop: 6 };
/** 양의 키(충돌 상자 높이): 서 있을 때 / 숙였을 때. */
export const STAND_BOX = 52;
export const DUCK_BOX = 28;

/* ── 별 ── */
export const STAR_R = 9; // 충돌 반지름(그림은 조금 더 크다)
export const STAR_H = 54; // 양 앞을 지날 때 별 중심의 땅에서 높이 — 서 있으면 맞고, 숙이면 지나간다
const STAR_SPAWN_H = 300; // 처음엔 화면 위쪽 밖에서 나타난다
const STAR_LEVEL_X = SHEEP_X + 170; // 이 지점부터는 수평으로 날아온다
const STAR_SLOPE = (STAR_SPAWN_H - STAR_H) / (W + 24 - STAR_LEVEL_X);
const STAR_FROM_S = 14; // 첫 별이 나오는 시간
const STAR_P_MAX = 0.28; // 묶음 하나가 별일 확률의 최대치
const STAR_RAMP_S = 50;

/** 별의 가로 위치 → 땅에서의 높이. 위에서 비스듬히 내려오다가 양 앞에서는 수평이 된다. */
export function starHeight(x: number): number {
  return STAR_H + Math.max(0, x - STAR_LEVEL_X) * STAR_SLOPE;
}

export interface Fence {
  x: number;
  w: number;
  h: number;
  counted: boolean;
}

export interface Star {
  x: number;
  counted: boolean;
}

export interface Floater {
  x: number;
  y: number;
  age: number;
}

export type Phase = "ready" | "playing" | "over";
export type Cause = "fence" | "star";

export interface Game {
  phase: Phase;
  /** 땅에서 떨어진 높이(위쪽이 +). */
  y: number;
  vy: number;
  onGround: boolean;
  /** ↓ 를 누르고 있는 동안 true — 양이 숙인다. */
  ducking: boolean;
  buffer: number;
  fences: Fence[];
  stars: Star[];
  floaters: Floater[];
  dist: number;
  speed: number;
  /** 화면 애니메이션용 시계(대기·게임 오버 중에도 흐른다). */
  time: number;
  /** 실제로 달린 시간 — 난이도는 이것으로 오른다. */
  playTime: number;
  level: number;
  levelUpAt: number;
  /** 다음 장애물 묶음이 나오기까지 남은 이동 거리(px). */
  gapLeft: number;
  /** 지금까지 나온 별 묶음 수(처음 몇 번만 "숙여요!" 안내를 띄운다). */
  starGroups: number;
  score: number;
  overAt: number;
  cause: Cause | null;
  rng: () => number;
}

const FENCE_W = [26, 34, 44];
const FIRST_GAP_PX = 460;
const DOUBLE_FROM_SPEED = 390;
/**
 * 쌍둥이 울타리가 허용하는 폭: "한 번 점프로 넘는 데 필요한 체공 시간 ÷ 실제로 낼 수 있는 체공 시간".
 * 1 이면 꼭 맞는 완벽한 타이밍이 필요하다. 난이도가 오르면 이 비율이 커져서 타이밍 여유가 줄어든다.
 * (속도만 올리면 같은 점프로 더 빨리 지나가서 오히려 타이밍이 쉬워지기 때문에 필요하다.)
 */
const doubleFeasibility = (d: number) => lerp(0.58, 0.9, d);

/** 장애물 묶음 사이의 최소 시간 간격과 무작위 추가분 — 난이도가 오르면 촘촘해진다. */
function gapTimes(d: number) {
  return { min: lerp(0.95, 0.75, d), extra: lerp(0.85, 0.5, d) };
}

/** 키 높이: 쉬울 땐 낮은 울타리가 많고, 어려워지면 높은 울타리가 많아진다. */
function pickHeight(r: () => number, d: number): number {
  const low = lerp(0.4, 0.2, d);
  const tall = lerp(0.2, 0.4, d);
  const x = r();
  return x < low ? 34 : x < 1 - tall ? 46 : 58;
}

/**
 * 점프 중에 양의 발이 높이 h 울타리를 "넘은 상태"로 있는 시간(초).
 * y(t)=V·t−G·t²/2 가 (h−여유) 이상인 구간의 길이다.
 */
export function clearTime(h: number): number {
  const need = Math.max(0, h - (HIT.feetMargin + HIT.fenceInsetTop));
  const disc = JUMP_V * JUMP_V - 2 * GRAVITY * need;
  return disc <= 0 ? 0 : (2 * Math.sqrt(disc)) / GRAVITY;
}

/** 양 충돌 상자와 울타리 묶음이 겹쳐 있는 총 이동 거리(px) — 이 동안 계속 공중에 떠 있어야 한다. */
export function overlapTravel(spanPx: number): number {
  return HIT.left + HIT.right - 2 * HIT.fenceInsetX + spanPx;
}

export function createGame(rng: () => number = Math.random): Game {
  return {
    phase: "ready",
    y: 0,
    vy: 0,
    onGround: true,
    ducking: false,
    buffer: 0,
    fences: [],
    stars: [],
    floaters: [],
    dist: 0,
    speed: SPEED_BASE,
    time: 0,
    playTime: 0,
    level: 1,
    levelUpAt: -10,
    gapLeft: FIRST_GAP_PX,
    starGroups: 0,
    score: 0,
    overAt: 0,
    cause: null,
    rng,
  };
}

/** 게임 오버 직후엔 잠겨 있다가, 풀리면 새 게임으로 바꿔 돌려준다. 아직 잠겼으면 null. */
function restartIfOver(g: Game): Game | null {
  if (g.phase !== "over") return g;
  if (g.time - g.overAt < RESTART_LOCK_S) return null;
  return createGame(g.rng);
}

/** ↑ ← → = 점프 한 번. 준비 상태면 게임을 시작하고, 끝난 뒤면 (잠금이 풀렸을 때) 다시 시작한다. */
export function jump(g: Game): Game {
  const cur = restartIfOver(g);
  if (!cur) return g;
  g = cur;
  if (g.phase === "ready") g.phase = "playing";
  if (g.onGround) {
    g.vy = JUMP_V;
    g.onGround = false;
  } else {
    g.buffer = JUMP_BUFFER_S;
  }
  return g;
}

/** ↓ 를 누르면(down=true) 숙이고, 떼면 일어선다. 준비·게임 오버 상태에서 누르면 게임을 시작(재시작)한다. */
export function setDuck(g: Game, down: boolean): Game {
  if (down) {
    const cur = restartIfOver(g);
    if (!cur) return g;
    g = cur;
    if (g.phase === "ready") g.phase = "playing";
  }
  g.ducking = down;
  return g;
}

function randomFence(r: () => number, x: number, d: number): Fence {
  return { x, w: FENCE_W[Math.floor(r() * FENCE_W.length)], h: pickHeight(r, d), counted: false };
}

/** 울타리 count 개를 붙여서 한 묶음을 만든다. 한 번의 점프로 넘을 수 있는 폭일 때만 돌려준다. */
function tryGroup(g: Game, d: number, count: number): Fence[] | null {
  const r = g.rng;
  const x0 = W + 24;
  for (let tries = 0; tries < 10; tries++) {
    const group: Fence[] = [randomFence(r, x0, d)];
    while (group.length < count) {
      const p = group[group.length - 1];
      group.push(randomFence(r, p.x + p.w + 62 + r() * 14, d));
    }
    const last = group[group.length - 1];
    const span = last.x + last.w - x0;
    const hMax = Math.max(...group.map((f) => f.h));
    if (overlapTravel(span) <= doubleFeasibility(d) * clearTime(hMax) * g.speed) return group;
  }
  return null;
}

function spawnFences(g: Game, d: number): number {
  const r = g.rng;
  const x0 = W + 24;
  // 후반에는 울타리 세 개짜리, 중반부터는 두 개짜리가 섞인다 — 한 번의 점프로 넘을 수 있을 때만 낸다
  // (느린 속도에서는 폭이 넓어 못 넘는다).
  let group: Fence[] | null = null;
  if (d >= 0.55 && r() < lerp(0, 0.3, (d - 0.55) / 0.45)) group = tryGroup(g, d, 3);
  if (!group && g.speed >= DOUBLE_FROM_SPEED && r() < lerp(0.25, 0.5, d)) group = tryGroup(g, d, 2);
  if (!group) group = [randomFence(r, x0, d)];

  g.fences.push(...group);
  const last = group[group.length - 1];
  return last.x + last.w - x0; // 묶음이 차지하는 가로 폭
}

function spawnStars(g: Game, d: number): number {
  const r = g.rng;
  const x0 = W + 24;
  g.stars.push({ x: x0, counted: false });
  g.starGroups += 1;
  // 난이도가 오르면 별이 연달아 두 개 오기도 한다 — 그 사이에도 계속 숙이고 있어야 한다.
  if (d >= 0.45 && r() < 0.3) {
    const gap = 150 + r() * 40;
    g.stars.push({ x: x0 + gap, counted: false });
    return gap;
  }
  return 0;
}

function starChance(playTime: number): number {
  return playTime < STAR_FROM_S ? 0 : STAR_P_MAX * Math.min(1, (playTime - STAR_FROM_S) / STAR_RAMP_S);
}

function spawnGroup(g: Game) {
  const d = difficulty(g.playTime);
  const span = g.rng() < starChance(g.playTime) ? spawnStars(g, d) : spawnFences(g, d);
  const gap = gapTimes(d);
  g.gapLeft = span + g.speed * (gap.min + g.rng() * gap.extra);
}

/** 양 충돌 상자의 위·아래(캔버스 y). 숙이면 키가 줄어든다. */
function sheepBox(g: Game) {
  const bottom = GROUND - g.y - HIT.feetMargin;
  return { left: SHEEP_X - HIT.left, right: SHEEP_X + HIT.right, bottom, top: bottom - (g.ducking ? DUCK_BOX : STAND_BOX) };
}

function starHits(g: Game, s: Star): boolean {
  const box = sheepBox(g);
  const cy = GROUND - starHeight(s.x);
  const nx = Math.max(box.left, Math.min(s.x, box.right));
  const ny = Math.max(box.top, Math.min(cy, box.bottom));
  return (s.x - nx) ** 2 + (cy - ny) ** 2 < STAR_R * STAR_R;
}

function gameOver(g: Game, cause: Cause) {
  g.phase = "over";
  g.overAt = g.time;
  g.cause = cause;
  g.ducking = false;
}

/** dt(초)만큼 게임을 진행한다. */
export function step(g: Game, dt: number): void {
  g.time += dt;
  for (const f of g.floaters) f.age += dt;
  g.floaters = g.floaters.filter((f) => f.age < 0.8);
  if (g.phase !== "playing") return;

  g.playTime += dt;
  g.speed = speedAt(g.playTime);
  const lv = levelOf(g.playTime);
  if (lv > g.level) {
    g.level = lv;
    g.levelUpAt = g.time;
  }
  const dx = g.speed * dt;
  g.dist += dx;

  // 점프 물리
  if (!g.onGround) {
    g.y += g.vy * dt;
    g.vy -= GRAVITY * dt;
    if (g.y <= 0) {
      g.y = 0;
      g.vy = 0;
      g.onGround = true;
      if (g.buffer > 0) {
        g.vy = JUMP_V;
        g.onGround = false;
      }
    }
  }
  g.buffer = Math.max(0, g.buffer - dt);

  // 장애물 이동 · 생성
  for (const f of g.fences) f.x -= dx;
  for (const s of g.stars) s.x -= dx;
  g.gapLeft -= dx;
  if (g.gapLeft <= 0) spawnGroup(g);

  // 충돌
  const feet = GROUND - g.y - HIT.feetMargin;
  for (const f of g.fences) {
    const overlapX = SHEEP_X + HIT.right > f.x + HIT.fenceInsetX && SHEEP_X - HIT.left < f.x + f.w - HIT.fenceInsetX;
    if (overlapX && feet > GROUND - f.h + HIT.fenceInsetTop) {
      gameOver(g, "fence");
      return;
    }
  }
  for (const s of g.stars) {
    if (starHits(g, s)) {
      gameOver(g, "star");
      return;
    }
  }

  // 점수: 장애물을 완전히 지나치면 한 마리
  const passed = (right: number) => right < SHEEP_X - HIT.left - 8;
  const count = () => {
    g.score += 1;
    g.floaters.push({ x: SHEEP_X, y: GROUND - 96, age: 0 });
  };
  for (const f of g.fences) {
    if (!f.counted && passed(f.x + f.w)) {
      f.counted = true;
      count();
    }
  }
  for (const s of g.stars) {
    if (!s.counted && passed(s.x + STAR_R)) {
      s.counted = true;
      count();
    }
  }
  g.fences = g.fences.filter((f) => f.x + f.w > -20);
  g.stars = g.stars.filter((s) => s.x + STAR_R > -20);
}
