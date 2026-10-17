"use client";

import { useMemo } from "react";
import { Candy, Coffee, Zap, type LucideIcon } from "lucide-react";
import { caffeineDecayCurve, caffeineFamiliarUnits, caffeineSafeHoursNeeded } from "@/lib/chronoTwinModel";

const UNIT: Record<string, { icon: LucideIcon; suffix: string }> = {
  coffee: { icon: Coffee, suffix: "잔" },
  energy: { icon: Zap, suffix: "캔" },
  candy: { icon: Candy, suffix: "개" },
};

/**
 * 홍서준(약학) "Dose Echo" — 잠들 때 몸에 남는 카페인(mg)을 일상의 단위로 바꿔 체감시킨다.
 * 전윤서(생명공학)의 "카페인 컷오프(골든타임)" 역산도 한 줄로 함께 보여준다.
 */
export default function CaffeineConverter({
  doseMg,
  hoursElapsed,
  residueMg,
}: {
  doseMg: number;
  hoursElapsed: number;
  residueMg: number;
}) {
  const units = useMemo(() => caffeineFamiliarUnits(residueMg), [residueMg]);
  const curve = useMemo(() => caffeineDecayCurve(Math.max(doseMg, 1), 10, 48), [doseMg]);
  const safeHours = caffeineSafeHoursNeeded(doseMg);
  const waitMore = safeHours - hoursElapsed;
  const coffee = units.find((u) => u.key === "coffee");

  return (
    <div className="card">
      <p className="text-[17px] font-medium text-fg-2">잠들 때 몸에 남는 카페인</p>
      <p className="mt-2 text-[clamp(64px,11vw,104px)] font-semibold leading-none tracking-[-0.04em] tabular-nums text-tx-orange">
        {residueMg.toFixed(0)}
        <span className="ml-1 text-[0.32em] font-medium tracking-normal text-fg-2">mg</span>
      </p>
      <p className="t-lead mt-4">
        {coffee && coffee.count >= 0.1 ? (
          <>
            아메리카노 <b className="font-semibold text-fg">{coffee.count.toFixed(1)}잔</b> 분량이 남아 있어요.
          </>
        ) : (
          "거의 다 분해됐어요."
        )}
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {units.map((u) => {
          const { icon: Icon, suffix } = UNIT[u.key];
          return (
            <div key={u.key} className="tile text-center">
              <Icon className="mx-auto h-6 w-6 text-tx-orange" strokeWidth={1.8} />
              <p className="mt-3 text-[clamp(24px,3.4vw,34px)] font-semibold leading-none tabular-nums">
                {u.count.toFixed(1)}
                <span className="ml-0.5 text-[15px] font-medium text-fg-2">{suffix}</span>
              </p>
              <p className="mt-2 text-[14px] leading-tight text-fg-2">{u.label}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8">
        <DecayCurve curve={curve} markerHour={hoursElapsed} markerMg={residueMg} />
        <div className="mt-2 flex justify-between text-[14px] text-fg-2">
          <span>마신 직후</span>
          <span>10시간 뒤</span>
        </div>
      </div>

      <p className="mt-6 text-[19px] font-medium leading-snug">
        {waitMore > 0 ? (
          <>
            완전히 안전해지려면 <span className="text-tx-orange">{waitMore.toFixed(1)}시간</span> 더 필요해요.
          </>
        ) : (
          <span className="text-tx-green">이미 안전한 수준이에요.</span>
        )}
      </p>
    </div>
  );
}

function DecayCurve({
  curve,
  markerHour,
  markerMg,
}: {
  curve: { h: number; mg: number }[];
  markerHour: number;
  markerMg: number;
}) {
  const W = 600;
  const H = 150;
  const pad = 14;
  const maxH = curve[curve.length - 1]?.h || 10;
  const maxMg = Math.max(1, ...curve.map((p) => p.mg));

  const x = (h: number) => pad + (h / maxH) * (W - pad * 2);
  const y = (mg: number) => pad + (1 - mg / maxMg) * (H - pad * 2);

  const line = curve.map((p, i) => `${i ? "L" : "M"}${x(p.h).toFixed(1)},${y(p.mg).toFixed(1)}`).join(" ");
  const area = `${line} L${x(maxH)},${H - pad} L${x(0)},${H - pad} Z`;
  const mx = Math.min(x(markerHour), W - pad);
  const my = y(markerMg);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="시간에 따라 카페인이 줄어드는 곡선">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="stroke-line/15" strokeWidth={2} />
      <path d={area} className="fill-sys-orange/15" />
      <path d={line} className="fill-none stroke-sys-orange" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={mx} y1={my} x2={mx} y2={H - pad} className="stroke-fg-3" strokeWidth={2} strokeDasharray="5 6" />
      <circle cx={mx} cy={my} r={9} className="fill-sys-orange stroke-surface" strokeWidth={4} />
    </svg>
  );
}
