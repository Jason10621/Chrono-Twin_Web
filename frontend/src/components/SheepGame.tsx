"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { sheepFinale } from "@/lib/easter";
import { GROUND, H, SHEEP_X, W, createGame, jump, step, type Fence, type Game, type Phase } from "@/lib/sheepGame";

const BEST_KEY = "ct-sheep-best";
const FONT = '"Pretendard Variable","SF Pro Display",-apple-system,"Malgun Gothic",sans-serif';

/** 진행 정도에 따라 바뀌는 한마디. */
const QUIPS: [number, string][] = [
  [0, "울타리를 넘을 때마다 양이 한 마리씩 세어져요"],
  [5, "좋아요, 양이 한 마리, 두 마리…"],
  [15, "슬슬 졸리지 않나요?"],
  [30, "눈이 감기기 시작해요…"],
  [60, "아직도 안 졸려요?"],
  [100, "당신, 혹시 잠이 없나요?"],
];
const quipFor = (n: number) => [...QUIPS].reverse().find(([from]) => n >= from)?.[1] ?? QUIPS[0][1];

/* ── 그리기 ──────────────────────────────────────────────── */
function makeStars() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 44 }, () => ({ x: rnd() * W, y: rnd() * (GROUND - 90), r: 0.8 + rnd() * 1.3 }));
}

function drawFence(ctx: CanvasRenderingContext2D, f: Fence) {
  const posts = Math.max(2, Math.round(f.w / 14));
  const gap = (f.w - 6) / (posts - 1);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  // 가로대 두 개
  ctx.fillStyle = "#b98b57";
  for (const k of [0.3, 0.72]) {
    const y = GROUND - f.h * k - 2.5;
    ctx.fillRect(f.x - 2, y, f.w + 4, 5);
    ctx.strokeRect(f.x - 2, y, f.w + 4, 5);
  }
  // 말뚝 — 꼭대기를 뾰족하게
  ctx.fillStyle = "#d3a972";
  for (let i = 0; i < posts; i++) {
    const px = f.x + i * gap;
    const top = GROUND - f.h;
    ctx.beginPath();
    ctx.moveTo(px, GROUND);
    ctx.lineTo(px, top + 6);
    ctx.lineTo(px + 3, top);
    ctx.lineTo(px + 6, top + 6);
    ctx.lineTo(px + 6, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawSheep(ctx: CanvasRenderingContext2D, g: Game) {
  const dead = g.phase === "over";
  const gait = g.dist / 13;
  const bob = g.phase === "ready" ? Math.sin(g.time * 3) * 1.6 : g.onGround && !dead ? Math.abs(Math.sin(gait)) * 2.4 : 0;
  const feetY = GROUND - g.y;

  // 그림자 — 높이 뜰수록 작고 옅다
  const sh = Math.max(0.35, 1 - g.y / 190);
  ctx.fillStyle = `rgba(0,0,0,${0.28 * sh})`;
  ctx.beginPath();
  ctx.ellipse(SHEEP_X, GROUND + 4, 26 * sh, 4.5 * sh, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(SHEEP_X, feetY - bob);
  if (dead) {
    // 울타리에 걸려 앞으로 넘어진다
    ctx.rotate(Math.min(1.45, (g.time - g.overAt) * 7));
  } else if (!g.onGround) {
    ctx.translate(0, -30);
    ctx.rotate(-Math.max(-0.3, Math.min(0.3, g.vy / 2600)));
    ctx.translate(0, 30);
  }

  const dark = "#45434f";
  // 다리 4개 (몸 뒤쪽 둘 → 앞쪽 둘)
  ctx.strokeStyle = dark;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  const legs: [number, number][] = [
    [-11, 0],
    [-4, Math.PI],
    [9, Math.PI],
    [16, 0],
  ];
  legs.forEach(([lx, ph], i) => {
    const swing = dead ? 0.2 : g.onGround ? Math.sin(gait + ph) * 0.6 : i < 2 ? 0.75 : -0.75; // 공중: 뒷다리는 뒤로, 앞다리는 앞으로
    ctx.beginPath();
    ctx.moveTo(lx, -20);
    ctx.lineTo(lx - Math.sin(swing) * 20, -20 + Math.cos(swing) * 20);
    ctx.stroke();
  });

  // 꼬리 · 몸(양털 뭉치)
  ctx.fillStyle = "#f6f3ec";
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  const puffs: [number, number, number][] = [
    [-23, -37, 5],
    [-17, -26, 11],
    [-14, -36, 14],
    [0, -43, 15],
    [14, -37, 14],
    [-3, -28, 15],
    [11, -26, 13],
  ];
  for (const [px, py, pr] of puffs) {
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 머리 · 귀 · 머리털
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(28, -40, 10.5, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(20, -46, 4, 7, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6f3ec";
  ctx.beginPath();
  ctx.arc(24, -50, 6, 0, Math.PI * 2);
  ctx.fill();

  // 눈: 평소엔 동그랗게, 넘어지면 X
  if (dead) {
    ctx.strokeStyle = "#f6f3ec";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(29, -44);
    ctx.lineTo(34, -39);
    ctx.moveTo(34, -44);
    ctx.lineTo(29, -39);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(32, -42, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(32.8, -42, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, g: Game, stars: ReturnType<typeof makeStars>) {
  ctx.clearRect(0, 0, W, H);

  // 별 · 달
  stars.forEach((s, i) => {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.35 * Math.sin(g.time * 1.4 + i)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  const halo = ctx.createRadialGradient(702, 62, 6, 702, 62, 54);
  halo.addColorStop(0, "rgba(255,244,205,0.35)");
  halo.addColorStop(1, "rgba(255,244,205,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(640, 0, 120, 124);
  ctx.fillStyle = "#fbf2cf";
  ctx.beginPath();
  ctx.arc(702, 62, 17, 0, Math.PI * 2);
  ctx.fill();

  // 땅 + 달리는 느낌을 주는 풀
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND + 1);
  ctx.lineTo(W, GROUND + 1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  for (const [pitch, len, y] of [
    [46, 7, GROUND + 12],
    [31, 5, GROUND + 26],
  ] as const) {
    const off = g.dist % pitch;
    ctx.beginPath();
    for (let x = -off; x < W; x += pitch) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y - 1);
    }
    ctx.stroke();
  }

  for (const f of g.fences) drawFence(ctx, f);
  drawSheep(ctx, g);

  // 한 마리 셀 때마다 "+1"
  ctx.textAlign = "center";
  ctx.font = `700 22px ${FONT}`;
  for (const f of g.floaters) {
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - f.age / 0.8)})`;
    ctx.fillText("+1", f.x, f.y - f.age * 46);
  }
}

/* ── 컴포넌트 ────────────────────────────────────────────── */
/**
 * 코나미 코드 이스터에그 — 양 울타리 점프 미니게임.
 * 조작은 화살표 키(↑ ↓ ← → 아무거나)로 점프 하나뿐. Esc 로 닫는다. 규칙은 lib/sheepGame.ts.
 */
export default function SheepGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game>(createGame());
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const bestRef = useRef(0);

  useEffect(() => {
    dialogRef.current?.focus();
    try {
      const saved = Number(window.localStorage.getItem(BEST_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        bestRef.current = saved;
        setBest(saved);
      }
    } catch {
      /* 저장소를 못 읽어도 게임은 한다 */
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const stars = makeStars();

    let shownPhase: Phase = "ready";
    let shownScore = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      step(g, dt);
      draw(ctx, g, stars);

      if (g.phase !== shownPhase) {
        shownPhase = g.phase;
        setPhase(g.phase);
        if (g.phase === "over" && g.score > bestRef.current) {
          bestRef.current = g.score;
          setBest(g.score);
          try {
            window.localStorage.setItem(BEST_KEY, String(g.score));
          } catch {
            /* 무시 */
          }
        }
      }
      if (g.score !== shownScore) {
        shownScore = g.score;
        setScore(g.score);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault(); // 뒤쪽 페이지가 스크롤되지 않게
        if (!e.repeat) {
          gameRef.current = jump(gameRef.current);
          // 다시 시작했다면 화면 상태도 바로 맞춘다
          if (gameRef.current.phase !== shownPhase) {
            shownPhase = gameRef.current.phase;
            setPhase(shownPhase);
            shownScore = gameRef.current.score;
            setScore(shownScore);
          }
        }
      } else if (e.key === " ") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="양 울타리 점프 게임"
      data-egg="sheep"
      data-phase={phase}
      data-score={score}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-y-auto bg-[#0a0f24]/[0.97] px-4 py-6 text-center text-white outline-none backdrop-blur-sm"
    >
      <p className="text-[clamp(52px,11vw,104px)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
        {score.toLocaleString("ko-KR")}
        <span className="ml-2 text-[0.28em] font-medium tracking-normal text-white/70">마리</span>
      </p>
      <p className="mt-2 text-[15px] text-white/60">최고 {best.toLocaleString("ko-KR")}마리</p>

      <div className="relative mt-5 w-full max-w-[860px] overflow-hidden rounded-[28px] bg-[#0b1226]/90 ring-1 ring-white/10">
        <canvas ref={canvasRef} className="block h-auto w-full" aria-hidden />

        {phase === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/25">
            <p className="text-[clamp(20px,3.2vw,30px)] font-semibold">화살표 키를 눌러 시작해요</p>
            <p className="text-[clamp(14px,2vw,17px)] text-white/75">↑ ↓ ← → 어떤 화살표든 점프예요</p>
          </div>
        )}
        {phase === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 px-6" aria-live="polite">
            <p className="max-w-lg text-[clamp(19px,3.2vw,30px)] font-semibold leading-snug">{sheepFinale(score)}</p>
            <p className="text-[clamp(14px,2vw,17px)] text-white/75">아무 화살표 키를 누르면 다시 시작해요</p>
          </div>
        )}
      </div>

      <p className="mt-5 min-h-[1.6em] text-[17px] text-white/80">{phase === "playing" ? quipFor(score) : ""}</p>
      <button type="button" onClick={onClose} className="btn mt-4 bg-white/15 text-white hover:bg-white/25">
        <X className="mr-1.5 h-5 w-5" strokeWidth={2.2} />
        그만할래요 (Esc)
      </button>
    </div>
  );
}
