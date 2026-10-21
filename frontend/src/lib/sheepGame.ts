/**
 * 양 울타리 점프 — 코나미 코드 이스터에그 미니게임의 규칙 (화면·키 입력과 분리된 순수 로직)
 * ================================================================================
 * 좌표는 800×300 논리 픽셀. 양은 제자리(SHEEP_X)에 있고 울타리가 오른쪽에서 다가온다.
 * 조작은 "점프" 하나뿐이다. 울타리를 하나 완전히 지나칠 때마다 양이 한 마리 세어진다.
 *
 * 공정성: 울타리 묶음 사이 간격은 거리가 아니라 "시간"(≥0.95초)으로 정해서, 속도가 빨라져도
 * 착지 후 다시 뛸 틈이 항상 남는다. 쌍둥이 울타리는 한 번의 점프로 넘을 수 있을 때만 나온다.
 */

export const W = 800;
export const H = 300;
export const GROUND = 252; // 땅 y 좌표
export const SHEEP_X = 130; // 양의 가로 위치(몸 중심)

export const GRAVITY = 2600; // px/s²
export const JUMP_V = 720; // px/s — 최고점 ≈ 100px, 공중 시간 ≈ 0.55초
export const SPEED_BASE = 340; // px/s
export const SPEED_MAX = 760;
export const SPEED_GAIN = 7; // 초당 증가량
export const JUMP_BUFFER_S = 0.12; // 착지 직전에 눌러도 착지하자마자 뛴다
export const RESTART_LOCK_S = 0.45; // 게임 오버 직후 실수로 다시 시작하지 않도록

/** 충돌 상자(양): 좌우로 살짝 좁게, 발 쪽은 여유를 준다 — 아슬아슬하게 스치면 통과. */
export const HIT = { left: 16, right: 26, feetMargin: 6, fenceInsetX: 5, fenceInsetTop: 6 };

export interface Fence {
  x: number;
  w: number;
  h: number;
  counted: boolean;
}

export interface Floater {
  x: number;
  y: number;
  age: number;
}

export type Phase = "ready" | "playing" | "over";

export interface Game {
  phase: Phase;
  /** 땅에서 떨어진 높이(위쪽이 +). */
  y: number;
  vy: number;
  onGround: boolean;
  buffer: number;
  fences: Fence[];
  floaters: Floater[];
  dist: number;
  speed: number;
  /** 화면 애니메이션용 시계(대기·게임 오버 중에도 흐른다). */
  time: number;
  /** 실제로 달린 시간 — 속도는 이것으로 올라간다. */
  playTime: number;
  /** 다음 울타리 묶음이 나오기까지 남은 이동 거리(px). */
  gapLeft: number;
  score: number;
  overAt: number;
  rng: () => number;
}

const FENCE_W = [26, 34, 44];
const FIRST_GAP_PX = 460;
const MIN_GAP_S = 0.95; // 묶음 사이 최소 시간 간격
const EXTRA_GAP_S = 0.85;
const DOUBLE_FROM_SPEED = 390;
const DOUBLE_CHANCE = 0.3;
/** 키 한 번으로 넘을 수 있어야 하는 폭의 비율(1 이면 꼭 맞는 완벽한 타이밍이 필요). 낮을수록 여유롭다. */
const DOUBLE_FEASIBILITY = 0.62;

/** 키 높이: 낮은 울타리를 더 자주 낸다. */
function pickHeight(r: () => number): number {
  const x = r();
  return x < 0.4 ? 34 : x < 0.8 ? 46 : 58;
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
    buffer: 0,
    fences: [],
    floaters: [],
    dist: 0,
    speed: SPEED_BASE,
    time: 0,
    playTime: 0,
    gapLeft: FIRST_GAP_PX,
    score: 0,
    overAt: 0,
    rng,
  };
}

/** 화살표 키 하나 = 점프 한 번. 준비 상태면 게임을 시작하고, 끝난 뒤면 (잠금이 풀렸을 때) 다시 시작한다. */
export function jump(g: Game): Game {
  if (g.phase === "over") {
    if (g.time - g.overAt < RESTART_LOCK_S) return g;
    g = createGame(g.rng);
  }
  if (g.phase === "ready") g.phase = "playing";
  if (g.onGround) {
    g.vy = JUMP_V;
    g.onGround = false;
  } else {
    g.buffer = JUMP_BUFFER_S;
  }
  return g;
}

function randomFence(r: () => number, x: number): Fence {
  return { x, w: FENCE_W[Math.floor(r() * FENCE_W.length)], h: pickHeight(r), counted: false };
}

function spawnGroup(g: Game) {
  const r = g.rng;
  const x0 = W + 24;
  let group: Fence[] = [randomFence(r, x0)];

  // 쌍둥이 울타리는 "한 번의 점프로 넘을 수 있을 때만" 낸다(느린 속도에서는 폭이 넓어 못 넘는다).
  if (g.speed >= DOUBLE_FROM_SPEED && r() < DOUBLE_CHANCE) {
    for (let tries = 0; tries < 8; tries++) {
      const a = randomFence(r, x0);
      const b = randomFence(r, a.x + a.w + 62 + r() * 14);
      const span = b.x + b.w - x0;
      const hMax = Math.max(a.h, b.h);
      if (overlapTravel(span) <= DOUBLE_FEASIBILITY * clearTime(hMax) * g.speed) {
        group = [a, b];
        break;
      }
    }
  }

  g.fences.push(...group);
  const last = group[group.length - 1];
  const span = last.x + last.w - x0;
  g.gapLeft = span + g.speed * (MIN_GAP_S + r() * EXTRA_GAP_S);
}

/** dt(초)만큼 게임을 진행한다. */
export function step(g: Game, dt: number): void {
  g.time += dt;
  for (const f of g.floaters) f.age += dt;
  g.floaters = g.floaters.filter((f) => f.age < 0.8);
  if (g.phase !== "playing") return;

  g.playTime += dt;
  g.speed = Math.min(SPEED_MAX, SPEED_BASE + g.playTime * SPEED_GAIN);
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

  // 울타리 이동 · 생성
  for (const f of g.fences) f.x -= dx;
  g.gapLeft -= dx;
  if (g.gapLeft <= 0) spawnGroup(g);

  // 충돌
  const feet = GROUND - g.y - HIT.feetMargin;
  for (const f of g.fences) {
    const overlapX = SHEEP_X + HIT.right > f.x + HIT.fenceInsetX && SHEEP_X - HIT.left < f.x + f.w - HIT.fenceInsetX;
    if (overlapX && feet > GROUND - f.h + HIT.fenceInsetTop) {
      g.phase = "over";
      g.overAt = g.time;
      return;
    }
  }

  // 점수: 울타리를 완전히 지나치면 한 마리
  for (const f of g.fences) {
    if (!f.counted && f.x + f.w < SHEEP_X - HIT.left - 8) {
      f.counted = true;
      g.score += 1;
      g.floaters.push({ x: SHEEP_X, y: GROUND - 96, age: 0 });
    }
  }
  g.fences = g.fences.filter((f) => f.x + f.w > -20);
}
