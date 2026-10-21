"use client";

import type { ReactNode } from "react";
import { Coffee, Lightbulb, MoonStar, Smartphone, type LucideIcon } from "lucide-react";
import type { ChronoTwinInputs } from "@/lib/chronoTwinModel";
import { CAFFEINE_SLIDER_MAX, SLEEP_SLIDER_MAX, SLEEP_SLIDER_MIN, inputEgg } from "@/lib/easter";

interface Props {
  inputs: ChronoTwinInputs;
  onChange: (next: ChronoTwinInputs) => void;
}

const fmt = (v: number) => String(parseFloat(v.toFixed(2)));

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  color,
  hint,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  color: string;
  hint?: ReactNode;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <label className="text-[17px] text-fg">{label}</label>
        <span className="text-[19px] font-semibold tabular-nums" style={{ color: `var(--t-${color})` }}>
          {fmt(value)}
          <span className="ml-1 text-[15px] font-medium text-fg-2">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        className="ct-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ ["--pct" as string]: `${pct}%`, ["--sc" as string]: `rgb(var(--sys-${color}))` }}
      />
      {hint && <p className="mt-2 text-[15px] text-fg-2">{hint}</p>}
    </div>
  );
}

function Group({
  icon: Icon,
  color,
  title,
  children,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="py-8 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-[14px]"
          style={{ background: `rgb(var(--sys-${color}) / 0.14)`, color: `var(--t-${color})` }}
        >
          <Icon className="h-6 w-6" strokeWidth={1.9} />
        </span>
        <h3 className="text-[24px] font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const LIGHT_PRESETS: { label: string; k: number }[] = [
  { label: "전구색", k: 2700 },
  { label: "주백색", k: 4000 },
  { label: "주광색", k: 6500 },
];

export default function InputPanel({ inputs, onChange }: Props) {
  const egg = inputEgg(inputs); // 이스터에그: 카페인·수면 슬라이더 극단 (lib/easter.ts)
  const set = <K extends keyof ChronoTwinInputs>(k: K, v: ChronoTwinInputs[K]) => onChange({ ...inputs, [k]: v });

  return (
    <div className="card">
      <h3 className="t-card-title mb-8">오늘 밤의 습관</h3>

      <div className="divide-y divide-line/10">
      <Group icon={Smartphone} color="blue" title="스마트폰">
        <Slider
          label="자기 전 2시간 동안 사용"
          unit="분"
          min={0}
          max={180}
          step={5}
          value={inputs.bluelightMin}
          onChange={(v) => set("bluelightMin", v)}
          color="blue"
        />
        <Slider
          label="화면 밝기"
          unit="%"
          min={0}
          max={100}
          step={5}
          value={Math.round(inputs.screenBrightness * 100)}
          onChange={(v) => set("screenBrightness", v / 100)}
          color="blue"
        />
      </Group>

      <Group icon={Coffee} color="orange" title="카페인">
        <Slider
          label="오후 6시 이후 마신 양"
          unit="mg"
          min={0}
          max={CAFFEINE_SLIDER_MAX}
          step={10}
          value={inputs.caffeineMg}
          onChange={(v) => set("caffeineMg", v)}
          color="orange"
          hint={
            egg?.kind === "caffeine" ? (
              <span className="egg-jitter-text font-semibold text-tx-red">{egg.hint}</span>
            ) : (
              `아메리카노 약 ${(inputs.caffeineMg / 150).toFixed(1)}잔`
            )
          }
        />
        <Slider
          label="마신 뒤 잠들기까지"
          unit="시간"
          min={0}
          max={10}
          step={0.5}
          value={inputs.hoursSinceCaffeine}
          onChange={(v) => set("hoursSinceCaffeine", v)}
          color="orange"
        />
      </Group>

      <Group icon={Lightbulb} color="teal" title="방 조명">
        <Slider
          label="밝기"
          unit="lux"
          min={0}
          max={500}
          step={10}
          value={inputs.ledLux}
          onChange={(v) => set("ledLux", v)}
          color="teal"
        />
        <div className="mt-5 flex flex-wrap gap-2.5">
          {LIGHT_PRESETS.map((p) => (
            <button
              key={p.k}
              type="button"
              aria-pressed={inputs.ledColorTempK === p.k}
              onClick={() => set("ledColorTempK", p.k)}
              className="chip"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Group>

      <Group icon={MoonStar} color="purple" title="최근 컨디션">
        <Slider
          label="최근 5일 평균 수면"
          unit="시간"
          min={SLEEP_SLIDER_MIN}
          max={SLEEP_SLIDER_MAX}
          step={0.25}
          value={inputs.avgRecentSleepHours}
          onChange={(v) => set("avgRecentSleepHours", v)}
          color="purple"
          hint={
            egg && egg.kind !== "caffeine" ? <span className="font-semibold text-tx-purple">{egg.hint}</span> : undefined
          }
        />
        <div className="mt-5">
          <button
            type="button"
            aria-pressed={inputs.exercisedToday}
            onClick={() => set("exercisedToday", !inputs.exercisedToday)}
            className="chip"
          >
            {inputs.exercisedToday ? "✓ 오늘 운동했어요" : "오늘 운동했어요"}
          </button>
        </div>
      </Group>
      </div>
    </div>
  );
}
