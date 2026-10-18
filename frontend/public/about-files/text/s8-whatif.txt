"use client";

import { useMemo } from "react";
import { Coffee, Dumbbell, Lightbulb, MoonStar, Smartphone, type LucideIcon } from "lucide-react";
import { whatIfActions, type ChronoTwinInputs, type WhatIfAction } from "@/lib/chronoTwinModel";

const ICON: Record<WhatIfAction["key"], { icon: LucideIcon; color: string }> = {
  caffeine: { icon: Coffee, color: "orange" },
  phone: { icon: Smartphone, color: "blue" },
  sleep: { icon: MoonStar, color: "purple" },
  exercise: { icon: Dumbbell, color: "green" },
  light: { icon: Lightbulb, color: "teal" },
};

/** 같은 모형으로 "이 한 가지만 바꾸면 몇 분 줄어드는지"를 다시 계산해 보여준다. */
export default function WhatIfSection({ inputs, phaseDelayMin }: { inputs: ChronoTwinInputs; phaseDelayMin: number }) {
  const { actions, allSavedMin, afterMin } = useMemo(() => whatIfActions(inputs), [inputs]);

  if (actions.length === 0) {
    return (
      <div className="card text-center">
        <p className="t-card-title">지금 습관 그대로 좋아요</p>
        <p className="t-lead mt-3">더 줄일 만한 요인이 거의 없어요.</p>
      </div>
    );
  }

  const fmtMin = (m: number) => `${m >= 0 ? "" : "−"}${Math.abs(Math.round(m))}`;

  return (
    <div className="card">
      <ul className="divide-y divide-line/10">
        {actions.map((a) => {
          const { icon: Icon, color } = ICON[a.key];
          return (
            <li key={a.key} className="flex items-center gap-4 py-5 first:pt-0 md:gap-6">
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: `rgb(var(--sys-${color}) / 0.14)`, color: `var(--t-${color})` }}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[clamp(19px,2.4vw,24px)] font-semibold leading-snug tracking-tight">{a.label}</p>
                <p className="mt-0.5 text-[16px] text-fg-2">{a.detail}</p>
              </div>
              <p className="shrink-0 text-right text-[clamp(28px,4vw,40px)] font-semibold leading-none tracking-tight text-tx-green tabular-nums">
                −{Math.round(a.savedMin)}
                <span className="ml-0.5 text-[16px] font-medium text-fg-2">분</span>
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 rounded-[20px] bg-surface-2 px-6 py-6 text-center md:px-8">
        <p className="text-[17px] text-fg-2">모두 실천하면</p>
        <p className="mt-1 flex flex-wrap items-baseline justify-center gap-x-3 text-[clamp(30px,5vw,48px)] font-semibold leading-tight tracking-tight tabular-nums">
          <span>
            {fmtMin(phaseDelayMin)}
            <span className="text-[0.5em] font-medium text-fg-2">분</span>
          </span>
          <span className="text-fg-3">→</span>
          <span className="text-tx-green">
            {fmtMin(afterMin)}
            <span className="text-[0.5em] font-medium text-fg-2">분</span>
          </span>
        </p>
        <p className="mt-1 text-[16px] text-fg-2">약 {Math.round(allSavedMin)}분 일찍 잠들 수 있어요</p>
      </div>
    </div>
  );
}
