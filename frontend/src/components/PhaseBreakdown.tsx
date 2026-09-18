"use client";

import {
  phaseDelayBreakdown,
  type ChronoTwinInputs,
  type ChronoTwinResult,
  type PhaseDelayBreakdownItem,
} from "@/lib/chronoTwinModel";

/**
 * 아바타의 색·왜곡·크기는 vitality 하나에서 파생되기 때문에, 보는 사람이
 * "왜 지금 이런 모습인지"를 직관적으로 알기 어렵다는 피드백을 반영한 카드.
 * GROUND_TRUTH 의 각 항을 그대로 분리해 보여주므로, 막대를 전부 더하면
 * 위 아바타가 나타내는 위상 지연 추정치와 정확히 일치한다(가짜 설명이 아님).
 */
export default function PhaseBreakdown({
  inputs,
  result,
}: {
  inputs: ChronoTwinInputs;
  result: ChronoTwinResult;
}) {
  const rows = phaseDelayBreakdown(inputs, result);
  const maxAbs = Math.max(10, ...rows.map((r) => Math.abs(r.contributionMin)));

  return (
    <div className="glass-panel rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-sm font-mono tracking-widest text-primary uppercase">아바타는 왜 이렇게 보일까요?</h3>
        <span className="text-[10px] font-mono text-white/30 uppercase">계수 × 오늘 입력값</span>
      </div>
      <p className="text-xs text-white/40 mb-4 leading-relaxed">
        아래 다섯 항목을 더하면 위상 지연 추정치{" "}
        <b className="text-white/60">
          {result.phaseDelayMin >= 0 ? "+" : ""}
          {result.phaseDelayMin.toFixed(0)}분
        </b>
        과 정확히 같아요. 아바타의 색상·일그러짐·크기는 이 숫자 하나(vitality)에서 그대로 파생됩니다.
      </p>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <BreakdownRow key={row.key} row={row} maxAbs={maxAbs} />
        ))}
      </div>
    </div>
  );
}

function BreakdownRow({ row, maxAbs }: { row: PhaseDelayBreakdownItem; maxAbs: number }) {
  const pct = (Math.abs(row.contributionMin) / maxAbs) * 50;
  const positive = row.contributionMin >= 0;
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1">
        <span className="text-white/70">{row.label}</span>
        <span className="font-mono" style={{ color: row.color }}>
          {positive ? "+" : "−"}
          {Math.abs(row.contributionMin).toFixed(1)}분
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <div
          className="absolute inset-y-0 rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: row.color,
            left: positive ? "50%" : `${50 - pct}%`,
          }}
        />
      </div>
    </div>
  );
}
