"use client";

import { useEffect, useState } from "react";
import { sleepCycleImpact } from "@/lib/chronoTwinModel";
import { fetchSeoulLiveContext, type SeoulLiveContext } from "@/lib/liveContext";

const CYCLE_STAGES = ["N1", "N2", "N3", "REM"] as const;
const STAGE_DEPTH: Record<string, number> = { N1: 0.25, N2: 0.5, N3: 1, REM: 0.15 };

function Hypnogram({ totalCycles, lostCycles }: { totalCycles: number; lostCycles: number }) {
  const cycles = Math.max(1, totalCycles);
  const w = 640;
  const h = 140;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const cycleW = (w - padL - padR) / cycles;

  const points: { x: number; y: number; stage: string; lost: boolean }[] = [];
  for (let c = 0; c < cycles; c++) {
    const lost = c >= cycles - lostCycles;
    CYCLE_STAGES.forEach((stage, si) => {
      const x = padL + c * cycleW + (si / (CYCLE_STAGES.length - 1)) * cycleW;
      const y = padT + (1 - STAGE_DEPTH[stage]) * (h - padT - padB);
      points.push({ x, y, stage, lost });
    });
  }

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const splitX = padL + (cycles - lostCycles) * cycleW;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="수면 단계 도식">
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      {lostCycles > 0 && (
        <rect x={splitX} y={padT} width={Math.max(0, w - padR - splitX)} height={h - padT - padB} fill="rgba(248,113,113,0.08)" />
      )}
      <path d={path} fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.stage === "N3" ? 3 : 2}
          fill={p.lost ? "rgba(248,113,113,0.75)" : p.stage === "N3" ? "#a78bfa" : "#4fa3e0"}
        />
      ))}
      <text x={padL} y={h - 6} fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="ui-monospace, monospace">
        얕은 수면
      </text>
      <text x={padL} y={padT + 8} fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="ui-monospace, monospace">
        깊은 수면(N3)
      </text>
      {lostCycles > 0 && (
        <text x={Math.min(splitX + 6, w - 90)} y={padT + 16} fontSize={10} fill="#f87171" fontFamily="ui-monospace, monospace">
          손실된 주기
        </text>
      )}
    </svg>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-white/35 font-mono mb-1">{label}</div>
      <div className="text-lg font-bold font-mono" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

/**
 * 유가빈(뇌과학) 제안 "당신이 자는 잠의 의미" — 추상적인 위상 지연(분)을
 * 실제 수면 구조(90분 주기, N3/REM)가 얼마나 잘려나가는지로 번역해서 보여준다.
 * 하단의 서울 실시간 일몰·구름량은 Sunrise-Sunset / Open-Meteo API(둘 다 무료·무키)로
 * 가져오는 실측 데이터 — "오늘 밤 실제 빛 환경"과 조명 관리의 연관성을 체감시키기 위함.
 */
export default function SleepMeaning({
  phaseDelayMin,
  avgRecentSleepHours,
}: {
  phaseDelayMin: number;
  avgRecentSleepHours: number;
}) {
  const cycles = sleepCycleImpact(phaseDelayMin, avgRecentSleepHours);
  const [live, setLive] = useState<SeoulLiveContext | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSeoulLiveContext().then((c) => {
      if (alive) setLive(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="glass-panel rounded-2xl p-6 md:p-8">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg md:text-xl font-bold tracking-tight">당신이 자는 잠의 의미</h3>
        <span className="text-[10px] font-mono text-white/30 uppercase">유가빈 · 뇌과학</span>
      </div>
      <p className="text-sm text-white/55 leading-relaxed mb-6 max-w-2xl">
        수면은 하룻밤 동안 약 90분짜리 주기를 여러 번 반복하며, 얕은 잠(N1·N2)과 깊은 잠(N3), 그리고
        렘수면(REM)을 오갑니다. 위상이 지연될수록 이 주기 중 뒷부분—특히 새벽에 몰려있는 렘수면과
        깊은 잠—이 통째로 잘려나갑니다.
      </p>

      <Hypnogram totalCycles={cycles.baselineCycles} lostCycles={cycles.cyclesLost} />

      <div className="grid sm:grid-cols-3 gap-3 mt-6 mb-6">
        <MiniStat label="완전한 수면 주기" value={`${cycles.actualCycles} / ${cycles.baselineCycles}회`} tone="#a78bfa" />
        <MiniStat label="손실된 주기" value={`${cycles.cyclesLost}회`} tone="#f87171" />
        <MiniStat label="실질 수면 시간" value={`${(cycles.effectiveSleepMin / 60).toFixed(1)}h`} tone="#4fa3e0" />
      </div>

      <div className="grid md:grid-cols-2 gap-5 text-sm text-white/60 leading-relaxed mb-6">
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-violet-300/80 mb-1.5">깊은 잠(N3)이 하는 일</div>
          성장호르몬이 가장 많이 분비되는 구간이며, 뇌척수액이 뇌 조직 사이를 흐르며 하루 동안 쌓인
          노폐물(글림프 시스템)을 씻어냅니다. 이 구간이 줄면 다음날 피로 해소와 신체 회복이 눈에 띄게 더뎌집니다.
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-blue-300/80 mb-1.5">렘수면(REM)이 하는 일</div>
          낮 동안 겪은 일과 감정을 정리하고 장기기억으로 재구성하는 구간입니다. 렘수면이 부족하면
          기억력뿐 아니라 감정 조절·편도체 안정화에도 영향을 미칩니다.
        </div>
      </div>

      {live && (live.sunsetLabel || live.cloudCoverPct !== null) && (
        <div className="text-[11px] text-white/35 font-mono border-t border-white/10 pt-3 flex flex-wrap gap-x-4 gap-y-1">
          <span>오늘 서울 일몰 {live.sunsetLabel ?? "—"}</span>
          {live.cloudCoverPct !== null && <span>구름량 {live.cloudCoverPct}%</span>}
          {live.isDaylightNow !== null && <span>지금 {live.isDaylightNow ? "낮" : "밤"}</span>}
          <span className="text-white/20">· sunrise-sunset.org · open-meteo.com</span>
        </div>
      )}
    </div>
  );
}
