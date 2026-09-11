"use client";

import type { ChronoTwinInputs } from "@/lib/chronoTwinModel";

interface Props {
  inputs: ChronoTwinInputs;
  onChange: (next: ChronoTwinInputs) => void;
}

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  accent,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accent?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <label className="text-xs text-white/60">{label}</label>
        <span className="text-xs font-mono" style={{ color: accent || "#fff" }}>
          {Number.isInteger(value) ? value : value.toFixed(1)} {unit}
        </span>
      </div>
      <input
        type="range"
        className="ct-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

const CCT_PRESETS: { label: string; k: number }[] = [
  { label: "전구색 2700K", k: 2700 },
  { label: "주백색 4000K", k: 4000 },
  { label: "주광색 6500K", k: 6500 },
];

export default function InputPanel({ inputs, onChange }: Props) {
  const set = <K extends keyof ChronoTwinInputs>(k: K, v: ChronoTwinInputs[K]) =>
    onChange({ ...inputs, [k]: v });

  return (
    <div className="glass-panel rounded-2xl p-5 md:p-6">
      <h3 className="text-sm font-mono tracking-widest text-primary uppercase mb-5">오늘 밤의 습관 입력</h3>

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2 font-mono">📱 스마트폰</div>
        <Slider label="취침 전 2시간 내 사용 시간" unit="분" min={0} max={180} step={5}
          value={inputs.bluelightMin} onChange={(v) => set("bluelightMin", v)} accent="#4fa3e0" />
        <Slider label="화면 밝기" unit="%" min={0} max={100} step={5}
          value={Math.round(inputs.screenBrightness * 100)}
          onChange={(v) => set("screenBrightness", v / 100)} accent="#4fa3e0" />
      </div>

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2 font-mono">☕ 카페인 (오후 6시 이후)</div>
        <Slider label="총 섭취량" unit="mg" min={0} max={400} step={10}
          value={inputs.caffeineMg} onChange={(v) => set("caffeineMg", v)} accent="#f59e0b" />
        <Slider label="섭취 후 ~ 취침까지 경과 시간" unit="h" min={0} max={10} step={0.5}
          value={inputs.hoursSinceCaffeine} onChange={(v) => set("hoursSinceCaffeine", v)} accent="#f59e0b" />
      </div>

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2 font-mono">💡 취침 전 실내 조명</div>
        <Slider label="조도" unit="lux" min={0} max={500} step={10}
          value={inputs.ledLux} onChange={(v) => set("ledLux", v)} accent="#2dd4bf" />
        <div className="flex gap-2 mt-2">
          {CCT_PRESETS.map((p) => (
            <button
              key={p.k}
              onClick={() => set("ledColorTempK", p.k)}
              className={`ct-toggle ${inputs.ledColorTempK === p.k ? "ct-toggle-on" : "ct-toggle-off"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2">
        <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2 font-mono">🛌 최근 컨디션</div>
        <Slider label="최근 5일 평균 수면시간" unit="h" min={4} max={9} step={0.25}
          value={inputs.avgRecentSleepHours} onChange={(v) => set("avgRecentSleepHours", v)} accent="#a78bfa" />
        <button
          onClick={() => set("exercisedToday", !inputs.exercisedToday)}
          className={`ct-toggle mt-1 ${inputs.exercisedToday ? "ct-toggle-on" : "ct-toggle-off"}`}
        >
          {inputs.exercisedToday ? "✓ 오늘 30분 이상 운동함" : "오늘 운동 안 함"}
        </button>
      </div>
    </div>
  );
}
