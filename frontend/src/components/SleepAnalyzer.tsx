"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import InputPanel from "./InputPanel";
import { computeChronoTwin, SEVERITY_LABEL, type ChronoTwinInputs } from "@/lib/chronoTwinModel";

// Three.js/WebGL 컴포넌트는 서버 렌더링에서 제외 (window 필요)
const ChronoTwinAvatar = dynamic(() => import("./ChronoTwinAvatar"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[380px] md:h-[440px] rounded-2xl glass-panel flex items-center justify-center">
      <span className="text-white/30 text-sm font-mono tracking-widest uppercase">렌더링 엔진 로딩 중…</span>
    </div>
  ),
});

// Math.sin 기반 점 배치가 서버/클라이언트 V8 빌드 간 미세한 부동소수점 차이로
// hydration mismatch 를 일으킬 수 있어, 지도도 클라이언트 전용으로 렌더.
const WorldJetlagMap = dynamic(() => import("./WorldJetlagMap"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-2xl glass-panel" />,
});

const DEFAULT_INPUTS: ChronoTwinInputs = {
  bluelightMin: 60,
  screenBrightness: 0.7,
  caffeineMg: 80,
  hoursSinceCaffeine: 3,
  ledLux: 200,
  ledColorTempK: 5000,
  avgRecentSleepHours: 6.5,
  exercisedToday: false,
};

const SEVERITY_COLOR: Record<string, string> = {
  great: "text-teal-300",
  good: "text-emerald-300",
  moderate: "text-amber-300",
  poor: "text-orange-300",
  severe: "text-red-300",
};

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-panel rounded-xl px-4 py-3 flex-1 min-w-[140px]">
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SleepAnalyzer() {
  const [inputs, setInputs] = useState<ChronoTwinInputs>(DEFAULT_INPUTS);
  const result = useMemo(() => computeChronoTwin(inputs), [inputs]);

  return (
    <section id="analyze" className="w-full max-w-6xl mx-auto px-4 py-16 md:py-24 scroll-mt-20">
      <div className="text-center mb-10 md:mb-14">
        <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-3">
          당신의 <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Chrono-Twin</span>을 만나보세요
        </h2>
        <p className="text-white/50 max-w-xl mx-auto text-sm md:text-base">
          왼쪽의 슬라이더를 움직이면, 파이프라인과 동일한 계산식으로 오른쪽의 디지털 트윈이 실시간으로 반응합니다.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8">
        <InputPanel inputs={inputs} onChange={setInputs} />
        <div className="flex flex-col gap-4">
          <ChronoTwinAvatar vitality={result.vitality} />
          <div className="text-center">
            <span className={`text-sm font-mono uppercase tracking-widest ${SEVERITY_COLOR[result.severity]}`}>
              {SEVERITY_LABEL[result.severity]}
            </span>
            <span className="text-white/30 text-sm ml-2">
              · 추정 위상 지연 {result.phaseDelayMin >= 0 ? "+" : ""}
              {result.phaseDelayMin.toFixed(0)}분
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-8">
        <StatChip label="블루라이트 보정" value={`${result.bluelightAdjMin.toFixed(0)}분`} sub="X₁ · 노출×밝기 가중" />
        <StatChip label="취침 시 카페인 잔류" value={`${result.caffeineResidueMg.toFixed(0)}mg`} sub="X₂ · 반감기 5.5h 역산" />
        <StatChip label="5일 수면부채" value={`${result.sleepDebtMin.toFixed(0)}분`} sub="X₃ · 권장 8h 기준" />
        <StatChip label="LED 저녁 부하" value={result.ledLoad.toFixed(2)} sub={`멜라놉틱 ${result.melanopicLux.toFixed(0)}lux`} />
      </div>

      <div className="mt-10">
        <WorldJetlagMap phaseDelayMin={result.phaseDelayMin} />
      </div>

      <p className="mt-6 text-[11px] text-white/25 text-center max-w-2xl mx-auto leading-relaxed">
        이 데모의 계수는 더미(합성) 데이터로 자체검증한 EURIF 정보학 파트의 간이 추정 모형입니다. 실측 데이터 수집이
        끝나면 <code className="text-white/40">pipeline/regression.py</code>가 산출한 실제 회귀계수로 자동 교체될
        예정입니다.
      </p>
    </section>
  );
}
