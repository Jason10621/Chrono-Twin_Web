"use client";

import { useMemo, useState } from "react";
import { Coffee, Dumbbell, RotateCcw, Smartphone, Sparkles } from "lucide-react";
import {
  applyAllWhatIf,
  computeChronoTwin,
  delaySentence,
  type ChronoTwinInputs,
} from "@/lib/chronoTwinModel";
import { SLEEP_SLIDER_MAX, SLEEP_SLIDER_MIN } from "@/lib/easter";

const signed = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(Math.round(m))}`;
const THUMB = 30; // globals.css 의 .ct-slider 썸 크기와 같다

function CompareSlider({
  label,
  unit,
  a,
  b,
  min,
  max,
  step,
  color,
  onB,
}: {
  label: string;
  unit: string;
  a: number;
  b: number;
  min: number;
  max: number;
  step: number;
  color: string;
  onB: (v: number) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const fmt = (v: number) => String(parseFloat(v.toFixed(2)));
  return (
    <div className="py-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <label className="text-[17px] font-medium">{label}</label>
        <span className="text-[17px] tabular-nums text-fg-2">
          지금 {fmt(a)}
          {unit} <span className="text-fg-3">→</span>{" "}
          <b className="font-semibold" style={{ color: `var(--t-${color})` }}>
            {fmt(b)}
            {unit}
          </b>
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          className="ct-slider"
          min={min}
          max={max}
          step={step}
          value={b}
          aria-label={`${label} (바꾼 습관)`}
          onChange={(e) => onB(parseFloat(e.target.value))}
          style={{ ["--pct" as string]: `${pct(b)}%`, ["--sc" as string]: `rgb(var(--sys-${color}))` }}
        />
        <span
          aria-hidden
          title="지금 습관"
          className="pointer-events-none absolute top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-fg/55"
          style={{ left: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${pct(a) / 100})` }}
        />
      </div>
    </div>
  );
}

/**
 * "지금 습관"과 "바꾼 습관"을 나란히. 바꾼 습관은 처음엔 모든 개선을 적용한 값이고,
 * 슬라이더로 직접 만지면 그 값이 계산에 쓰인다. 회색 눈금이 지금 습관의 위치다.
 */
export default function ScenarioCompare({ inputs }: { inputs: ChronoTwinInputs }) {
  const [override, setOverride] = useState<ChronoTwinInputs | null>(null);

  const b: ChronoTwinInputs = useMemo(() => {
    if (!override) return applyAllWhatIf(inputs);
    return {
      ...override,
      caffeineHalfLifeH: inputs.caffeineHalfLifeH,
      personalOffsetMin: inputs.personalOffsetMin,
    };
  }, [override, inputs]);

  const ra = computeChronoTwin(inputs);
  const rb = computeChronoTwin(b);
  const diff = ra.phaseDelayMin - rb.phaseDelayMin;
  const set = <K extends keyof ChronoTwinInputs>(k: K, v: ChronoTwinInputs[K]) => setOverride({ ...b, [k]: v });

  // 두 막대를 같은 눈금에 겹쳐 그린다(0분 ~ 둘 중 큰 값, 최소 60분 폭).
  const scale = Math.max(60, ra.phaseDelayMin, rb.phaseDelayMin);
  const w = (m: number) => `${Math.max(0, Math.min(100, (Math.max(0, m) / scale) * 100))}%`;

  return (
    <div className="card">
      <div className="grid grid-cols-2 gap-3 text-center md:gap-5">
        <div className="tile">
          <p className="text-[16px] font-medium text-fg-2">지금 습관</p>
          <p className="mt-2 text-[clamp(34px,6vw,60px)] font-semibold leading-none tracking-tight tabular-nums text-tx-orange">
            {signed(ra.phaseDelayMin)}
            <span className="ml-0.5 text-[0.34em] font-medium text-fg-2">분</span>
          </p>
          <p className="mt-2 text-[15px] leading-snug text-fg-2">{delaySentence(ra.phaseDelayMin)}</p>
        </div>
        <div className="tile">
          <p className="text-[16px] font-medium text-fg-2">바꾼 습관</p>
          <p className="mt-2 text-[clamp(34px,6vw,60px)] font-semibold leading-none tracking-tight tabular-nums text-tx-blue">
            {signed(rb.phaseDelayMin)}
            <span className="ml-0.5 text-[0.34em] font-medium text-fg-2">분</span>
          </p>
          <p className="mt-2 text-[15px] leading-snug text-fg-2">{delaySentence(rb.phaseDelayMin)}</p>
        </div>
      </div>

      {/* 겹쳐 보는 막대 */}
      <div className="mt-6" role="img" aria-label={`지금 ${signed(ra.phaseDelayMin)}분, 바꾼 습관 ${signed(rb.phaseDelayMin)}분`}>
        <div className="relative h-5 overflow-hidden rounded-full bg-fg/[0.07]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-sys-orange/45 transition-all duration-500"
            style={{ width: w(ra.phaseDelayMin) }}
          />
          <div
            className="absolute inset-y-[5px] left-0 rounded-full bg-sys-blue transition-all duration-500"
            style={{ width: w(rb.phaseDelayMin) }}
          />
        </div>
        <p className="mt-3 text-center text-[17px] font-medium">
          {Math.abs(diff) < 1 ? (
            <span className="text-fg-2">지금과 거의 같아요</span>
          ) : diff > 0 ? (
            <span className="text-tx-green">{Math.round(diff)}분 일찍 잠들어요</span>
          ) : (
            <span className="text-tx-red">{Math.round(-diff)}분 더 늦게 잠들어요</span>
          )}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          className="chip"
          onClick={() => set("caffeineMg", Math.min(400, b.caffeineMg + 80))}
        >
          <Coffee className="mr-2 h-[18px] w-[18px]" strokeWidth={2} />
          카페인 한 잔 더
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => set("bluelightMin", Math.min(180, b.bluelightMin + 30))}
        >
          <Smartphone className="mr-2 h-[18px] w-[18px]" strokeWidth={2} />
          스마트폰 30분 더
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={b.exercisedToday}
          onClick={() => set("exercisedToday", !b.exercisedToday)}
        >
          <Dumbbell className="mr-2 h-[18px] w-[18px]" strokeWidth={2} />
          운동
        </button>
        <button type="button" className="chip" onClick={() => setOverride(null)}>
          <Sparkles className="mr-2 h-[18px] w-[18px]" strokeWidth={2} />
          개선안으로
        </button>
        <button type="button" className="chip" onClick={() => setOverride({ ...inputs })}>
          <RotateCcw className="mr-2 h-[18px] w-[18px]" strokeWidth={2} />
          지금과 똑같이
        </button>
      </div>

      <div className="mt-4 divide-y divide-line/10">
        <CompareSlider
          label="스마트폰 사용"
          unit="분"
          a={inputs.bluelightMin}
          b={b.bluelightMin}
          min={0}
          max={180}
          step={5}
          color="blue"
          onB={(v) => set("bluelightMin", v)}
        />
        <CompareSlider
          label="카페인"
          unit="mg"
          a={inputs.caffeineMg}
          b={b.caffeineMg}
          min={0}
          max={400}
          step={10}
          color="orange"
          onB={(v) => set("caffeineMg", v)}
        />
        <CompareSlider
          label="방 조명"
          unit="lux"
          a={inputs.ledLux}
          b={b.ledLux}
          min={0}
          max={500}
          step={10}
          color="teal"
          onB={(v) => set("ledLux", v)}
        />
        <CompareSlider
          label="평균 수면"
          unit="시간"
          a={inputs.avgRecentSleepHours}
          b={b.avgRecentSleepHours}
          min={SLEEP_SLIDER_MIN}
          max={SLEEP_SLIDER_MAX}
          step={0.25}
          color="purple"
          onB={(v) => set("avgRecentSleepHours", v)}
        />
      </div>
    </div>
  );
}
