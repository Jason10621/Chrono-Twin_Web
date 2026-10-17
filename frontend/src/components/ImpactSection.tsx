"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  PHASE_DIAGNOSIS_TONE,
  diagnosePhaseDelay,
  sleepCycleImpact,
  sleepStageLoss,
} from "@/lib/chronoTwinModel";
import { fetchSeoulLiveContext, type SeoulLiveContext } from "@/lib/liveContext";

const STAGES = ["N1", "N2", "N3", "REM"] as const;
const DEPTH: Record<string, number> = { N1: 0.25, N2: 0.5, N3: 1, REM: 0.15 };

/** 90분 수면 주기를 그림으로 — 글자 없이 모양만 (모바일에서 글씨가 작아지지 않도록) */
function Hypnogram({ total, lost }: { total: number; lost: number }) {
  const cycles = Math.max(1, total);
  const w = 640;
  const h = 150;
  const pad = 10;
  const cw = (w - pad * 2) / cycles;

  const pts: { x: number; y: number; stage: string; cut: boolean }[] = [];
  for (let c = 0; c < cycles; c++) {
    const cut = c >= cycles - lost;
    STAGES.forEach((s, i) => {
      pts.push({
        x: pad + c * cw + (i / (STAGES.length - 1)) * cw,
        y: pad + (1 - DEPTH[s]) * (h - pad * 2),
        stage: s,
        cut,
      });
    });
  }
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const splitX = pad + (cycles - lost) * cw;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="하룻밤 수면 주기 그래프">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="stroke-line/15" strokeWidth={2} />
      {lost > 0 && (
        <rect
          x={splitX}
          y={pad}
          width={Math.max(0, w - pad - splitX)}
          height={h - pad * 2}
          rx={14}
          className="fill-sys-red/15"
        />
      )}
      <path d={path} className="fill-none stroke-sys-purple" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.stage === "N3" ? 6 : 4}
          className={p.cut ? "fill-sys-red" : p.stage === "N3" ? "fill-sys-purple" : "fill-sys-blue"}
        />
      ))}
    </svg>
  );
}

function Tile({ label, value, unit, sub }: { label: string; value: string; unit: string; sub: string }) {
  return (
    <div className="tile">
      <p className="text-[16px] font-medium text-fg-2">{label}</p>
      <p className="mt-2 text-[40px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
        <span className="ml-1 text-[20px] font-medium text-fg-2">{unit}</span>
      </p>
      <p className="mt-2 text-[15px] text-fg-2">{sub}</p>
    </div>
  );
}

/**
 * "내일의 나" — 위상 지연이 실제 수면 구조(깊은 잠·렘수면·90분 주기)를 얼마나
 * 잘라내는지, 그게 내일 컨디션에 뭘 뜻하는지를 큰 글씨로 보여준다. (유가빈 · 뇌과학)
 * 하단의 서울 일몰·구름량은 Sunrise-Sunset / Open-Meteo 실시간 데이터.
 */
export default function ImpactSection({
  phaseDelayMin,
  avgRecentSleepHours,
}: {
  phaseDelayMin: number;
  avgRecentSleepHours: number;
}) {
  const diag = diagnosePhaseDelay(phaseDelayMin);
  const tone = PHASE_DIAGNOSIS_TONE[diag.level];
  const loss = sleepStageLoss(phaseDelayMin);
  const cycles = sleepCycleImpact(phaseDelayMin, avgRecentSleepHours);

  const [live, setLive] = useState<SeoulLiveContext | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSeoulLiveContext().then((c) => alive && setLive(c));
    return () => {
      alive = false;
    };
  }, []);

  const hasLive = live && (live.sunsetLabel || live.cloudCoverPct !== null);

  return (
    <div className="card">
      <h3 className="text-[clamp(30px,4.4vw,48px)] font-semibold leading-[1.15] tracking-[-0.025em]" style={{ color: tone }}>
        {diag.title}
      </h3>
      <p className="t-lead mt-3 max-w-3xl">{diag.detail}</p>

      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Tile
          label="깊은 잠"
          value={loss.n3LossMin > 0 ? `−${loss.n3LossMin}` : "0"}
          unit="분"
          sub="몸 회복 · 성장호르몬"
        />
        <Tile
          label="렘수면"
          value={loss.remLossMin > 0 ? `−${loss.remLossMin}` : "0"}
          unit="분"
          sub="기억 · 감정 정리"
        />
        <Tile
          label="온전한 수면 주기"
          value={`${cycles.actualCycles}/${cycles.baselineCycles}`}
          unit="회"
          sub="90분짜리 한 세트"
        />
        <Tile
          label="실제 잠든 시간"
          value={(cycles.effectiveSleepMin / 60).toFixed(1)}
          unit="시간"
          sub="지연된 시간을 뺀 값"
        />
      </div>

      <div className="mt-10">
        <p className="mb-4 text-[17px] font-semibold">오늘 밤 수면 주기</p>
        <Hypnogram total={cycles.baselineCycles} lost={cycles.cyclesLost} />
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-fg-2">
          <span className="inline-flex items-center gap-2">
            <i className="h-3 w-3 rounded-full bg-sys-purple" /> 온전한 주기
          </span>
          {cycles.cyclesLost > 0 && (
            <span className="inline-flex items-center gap-2">
              <i className="h-3 w-3 rounded-full bg-sys-red" /> 잘려 나가는 주기 {cycles.cyclesLost}회
            </span>
          )}
        </div>
      </div>

      <details className="mt-10">
        <summary className="inline-flex items-center gap-1 text-[18px] font-medium text-tx-blue">
          깊은 잠과 렘수면은 뭘 하나요?
          <ChevronRight className="chev h-5 w-5 transition-transform" />
        </summary>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="tile">
            <p className="text-[18px] font-semibold">깊은 잠</p>
            <p className="mt-1.5 text-[17px] text-fg-2">
              몸을 회복시키고 성장호르몬이 나오는 시간이에요. 뇌의 노폐물도 이때 씻겨 나가요.
            </p>
          </div>
          <div className="tile">
            <p className="text-[18px] font-semibold">렘수면</p>
            <p className="mt-1.5 text-[17px] text-fg-2">
              낮에 겪은 일과 감정을 정리해 기억으로 남기는 시간이에요. 모자라면 기분이 불안정해져요.
            </p>
          </div>
        </div>
      </details>

      {hasLive && (
        <p className="mt-8 border-t border-line/10 pt-5 text-[15px] text-fg-2">
          지금 서울 ·{live?.sunsetLabel ? ` 일몰 ${live.sunsetLabel}` : ""}
          {live?.cloudCoverPct !== null && live?.cloudCoverPct !== undefined ? ` · 구름 ${live.cloudCoverPct}%` : ""}
          {live?.isDaylightNow !== null && live?.isDaylightNow !== undefined ? ` · ${live.isDaylightNow ? "낮" : "밤"}` : ""}
        </p>
      )}
    </div>
  );
}
