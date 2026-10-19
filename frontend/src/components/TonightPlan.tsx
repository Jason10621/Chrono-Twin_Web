"use client";

import { useMemo } from "react";
import { BedDouble, CalendarPlus, Check, Coffee, Dumbbell, Lightbulb, Smartphone, type LucideIcon } from "lucide-react";
import type { ChronoTwinInputs } from "@/lib/chronoTwinModel";
import {
  buildIcs,
  clock,
  fallAsleepLabel,
  parseClock,
  tonightPlan,
  type PlanKey,
} from "@/lib/tonightPlan";

const ICON: Record<PlanKey, { icon: LucideIcon; color: string }> = {
  exercise: { icon: Dumbbell, color: "green" },
  caffeine: { icon: Coffee, color: "orange" },
  light: { icon: Lightbulb, color: "teal" },
  phone: { icon: Smartphone, color: "blue" },
  bed: { icon: BedDouble, color: "purple" },
};

const fmtMin = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(Math.round(m))}`;

/**
 * "이렇게 바꿔보세요"를 시각이 찍힌 타임라인으로. 효과(분)는 계획대로 했을 때의 입력값을
 * 같은 모형에 다시 넣어 구하고, 캘린더(.ics)로 담으면 기기가 알림까지 챙겨준다.
 */
export default function TonightPlan({
  inputs,
  bedtimeMin,
  onBedtimeChange,
}: {
  inputs: ChronoTwinInputs;
  bedtimeMin: number;
  onBedtimeChange: (min: number) => void;
}) {
  const plan = useMemo(() => tonightPlan(inputs), [inputs]);
  const actionable = plan.steps.filter((s) => !s.done && s.key !== "bed");
  const savedAll = plan.beforeMin - plan.afterMin;

  const downloadIcs = () => {
    const ics = buildIcs(plan.steps, bedtimeMin);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "chrono-twin-tonight.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/10 pb-6">
        <div>
          <p className="t-card-title">오늘 밤 몇 시에 누울 건가요?</p>
          <p className="mt-1 text-[16px] text-fg-2">이 시각을 기준으로 시간표를 짜요.</p>
        </div>
        <input
          type="time"
          value={clock(bedtimeMin)}
          onChange={(e) => {
            const m = parseClock(e.target.value);
            if (m !== null) onBedtimeChange(m);
          }}
          aria-label="취침 시각"
          className="rounded-2xl bg-surface-2 px-5 py-3 text-[26px] font-semibold tabular-nums text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      <ol className="relative mt-8">
        <span aria-hidden className="absolute bottom-6 left-[103px] top-6 w-0.5 rounded bg-fg/10 sm:left-[111px]" />
        {plan.steps.map((s) => {
          const { icon: Icon, color } = ICON[s.key];
          const at = bedtimeMin - s.leadMin;
          const isBed = s.key === "bed";
          return (
            <li key={s.key} className="relative grid grid-cols-[72px_44px_1fr] items-center gap-x-3 py-3.5 sm:grid-cols-[80px_44px_1fr_auto] sm:gap-x-4">
              <span className="text-right text-[clamp(22px,3vw,28px)] font-semibold tabular-nums tracking-tight">
                {clock(at)}
              </span>
              <span
                className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full ring-4 ring-surface"
                style={{
                  background: s.done ? "rgb(var(--sys-green) / 0.16)" : `rgb(var(--sys-${color}) / 0.18)`,
                  color: `var(--t-${s.done ? "green" : color})`,
                }}
              >
                {s.done ? <Check className="h-5 w-5" strokeWidth={2.6} /> : <Icon className="h-5 w-5" strokeWidth={2} />}
              </span>
              <div className="min-w-0">
                <p className="text-[clamp(18px,2.2vw,21px)] font-semibold leading-snug tracking-tight">{s.label}</p>
                {!isBed && s.detail && <p className="mt-0.5 text-[15px] text-fg-2">{s.detail}</p>}
                {isBed && (
                  <p className="mt-0.5 text-[15px] text-fg-2">
                    지금 습관이면 {fallAsleepLabel(bedtimeMin, plan.beforeMin)}에 잠들어요
                  </p>
                )}
              </div>
              {!isBed && !s.done && s.savedMin >= 1 && (
                <span className="col-start-3 mt-1 w-fit rounded-full bg-sys-green/15 px-3 py-1 text-[15px] font-semibold tabular-nums text-tx-green sm:col-start-4 sm:mt-0">
                  −{Math.round(s.savedMin)}분
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 rounded-[20px] bg-surface-2 px-6 py-6 text-center md:px-8">
        {actionable.length === 0 ? (
          <>
            <p className="text-[clamp(22px,3vw,30px)] font-semibold tracking-tight">지금 습관 그대로 좋아요</p>
            <p className="mt-1 text-[16px] text-fg-2">
              {fallAsleepLabel(bedtimeMin, plan.beforeMin)}쯤 잠들어요 ({fmtMin(plan.beforeMin)}분)
            </p>
          </>
        ) : (
          <>
            <p className="text-[17px] text-fg-2">계획대로 하면</p>
            <p className="mt-1 flex flex-wrap items-baseline justify-center gap-x-3 text-[clamp(26px,4.4vw,42px)] font-semibold leading-tight tracking-tight tabular-nums">
              <span>{fallAsleepLabel(bedtimeMin, plan.beforeMin)}</span>
              <span className="text-fg-3">→</span>
              <span className="text-tx-green">{fallAsleepLabel(bedtimeMin, plan.afterMin)}</span>
            </p>
            <p className="mt-1 text-[16px] text-fg-2">
              {savedAll >= 1 ? `약 ${Math.round(savedAll)}분 일찍 잠들 수 있어요` : "지금과 비슷해요"}
            </p>
          </>
        )}
      </div>

      {actionable.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <button type="button" onClick={downloadIcs} className="btn btn-primary">
            <CalendarPlus className="mr-2 h-5 w-5" strokeWidth={2.2} />
            캘린더에 담기
          </button>
          <p className="text-[14px] text-fg-2">캘린더 앱에 오늘 밤 일정이 추가되고, 5분 전에 알려줘요.</p>
        </div>
      )}
    </div>
  );
}
