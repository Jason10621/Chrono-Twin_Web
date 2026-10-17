"use client";

import {
  phaseDelayBreakdown,
  type ChronoTwinInputs,
  type ChronoTwinResult,
  type PhaseDelayBreakdownItem,
} from "@/lib/chronoTwinModel";

/**
 * 아바타의 색·모양이 왜 그렇게 보이는지: 다섯 요인을 회귀계수(β·γ) 그대로 분리해 보여준다.
 * 선형 모형이라 막대를 전부 더하면 위의 위상 지연 값과 정확히 같다.
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
  const total = result.phaseDelayMin;

  return (
    <div className="card">
      <div className="flex items-baseline justify-between gap-4 border-b border-line/10 pb-6">
        <h3 className="t-card-title">전부 더하면</h3>
        <p className="text-[clamp(32px,5vw,48px)] font-semibold leading-none tracking-tight tabular-nums">
          {total >= 0 ? "+" : "−"}
          {Math.abs(total).toFixed(0)}
          <span className="ml-1 text-[22px] font-medium text-fg-2">분</span>
        </p>
      </div>
      <div className="mt-2 divide-y divide-line/10">
        {rows.map((row) => (
          <Row key={row.key} row={row} maxAbs={maxAbs} />
        ))}
      </div>
    </div>
  );
}

function Row({ row, maxAbs }: { row: PhaseDelayBreakdownItem; maxAbs: number }) {
  const pct = (Math.abs(row.contributionMin) / maxAbs) * 50;
  const positive = row.contributionMin >= 0;
  return (
    <div className="py-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-[19px] font-medium">{row.label}</span>
        <span className="text-[19px] font-semibold tabular-nums">
          {positive ? "+" : "−"}
          {Math.abs(row.contributionMin).toFixed(1)}
          <span className="ml-0.5 text-[15px] font-medium text-fg-2">분</span>
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-fg/[0.07]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-fg/20" />
        <div
          className="absolute inset-y-0 rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: row.color,
            left: positive ? "50%" : `${50 - pct}%`,
          }}
        />
      </div>
    </div>
  );
}
