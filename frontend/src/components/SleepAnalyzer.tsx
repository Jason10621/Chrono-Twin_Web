"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import InputPanel from "./InputPanel";
import ImpactSection from "./ImpactSection";
import PhaseBreakdown from "./PhaseBreakdown";
import WhatIfSection from "./WhatIfSection";
import ChronoAI from "./ChronoAI";
import CaffeineConverter from "./CaffeineConverter";
import { Section, SectionHead } from "./Section";
import {
  PHASE_DIAGNOSIS_LABEL,
  PHASE_DIAGNOSIS_TONE,
  computeChronoTwin,
  delaySentence,
  diagnosePhaseDelay,
  type ChronoTwinInputs,
  type ChronoTwinResult,
} from "@/lib/chronoTwinModel";

// Three.js/WebGL 컴포넌트는 서버 렌더링에서 제외 (window 필요)
const ChronoTwinAvatar = dynamic(() => import("./ChronoTwinAvatar"), {
  ssr: false,
  loading: () => <div className="avatar-stage h-[300px] w-full md:h-[340px]" />,
});

// Math.sin 기반 점 배치가 서버/클라이언트 부동소수점 차이로 hydration mismatch 를 낼 수 있어 클라이언트 전용.
const WorldJetlagMap = dynamic(() => import("./WorldJetlagMap"), {
  ssr: false,
  loading: () => <div className="card h-[420px]" />,
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

const signed = (m: number) => `${m >= 0 ? "+" : "−"}${Math.abs(Math.round(m))}`;

function ResultCard({ result }: { result: ChronoTwinResult }) {
  const { level } = diagnosePhaseDelay(result.phaseDelayMin);
  const tone = PHASE_DIAGNOSIS_TONE[level];
  return (
    <div id="result" className="card overflow-hidden !p-0 text-center">
      <ChronoTwinAvatar vitality={result.vitality} />
      <div className="px-6 pb-10 md:px-10">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-fg/[0.07] px-4 py-1.5 text-[17px] font-semibold">
          <i className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
          {PHASE_DIAGNOSIS_LABEL[level]}
        </span>
        <p className="t-number mt-5" style={{ color: tone }}>
          {signed(result.phaseDelayMin)}
          <span className="ml-1.5 text-[0.28em] font-medium tracking-normal text-fg-2">분</span>
        </p>
        <p className="mt-4 text-[clamp(21px,2.6vw,28px)] font-semibold tracking-tight">
          {delaySentence(result.phaseDelayMin)}
        </p>
      </div>
    </div>
  );
}

/** 모바일에서 슬라이더를 만지는 동안 결과가 화면 밖으로 사라지지 않도록 하단에 작게 띄운다. */
function LiveBar({ visible, result }: { visible: boolean; result: ChronoTwinResult }) {
  const { level } = diagnosePhaseDelay(result.phaseDelayMin);
  const tone = PHASE_DIAGNOSIS_TONE[level];
  return (
    <a
      href="#result"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`nav-blur fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-full px-6 py-3.5 shadow-[0_8px_30px_rgb(0_0_0/0.18)] transition duration-300 lg:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <span className="inline-flex items-center gap-2.5 text-[17px] font-semibold">
        <i className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
        {PHASE_DIAGNOSIS_LABEL[level]}
      </span>
      <span className="text-[26px] font-semibold tabular-nums leading-none" style={{ color: tone }}>
        {signed(result.phaseDelayMin)}
        <span className="ml-0.5 text-[15px] font-medium text-fg-2">분</span>
      </span>
    </a>
  );
}

export default function SleepAnalyzer() {
  const [inputs, setInputs] = useState<ChronoTwinInputs>(DEFAULT_INPUTS);
  const result = useMemo(() => computeChronoTwin(inputs), [inputs]);

  const inputsRef = useRef<HTMLDivElement>(null);
  const [inputsInView, setInputsInView] = useState(false);
  useEffect(() => {
    const el = inputsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInputsInView(e.isIntersecting), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <Section id="analyze" className="!pt-4 md:!pt-8">
        <SectionHead eyebrow="분석" title="오늘 밤을 알려주세요" sub="슬라이더를 움직이면 결과가 바로 바뀌어요." />
        <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
          <div ref={inputsRef} className="order-2 lg:order-1">
            <InputPanel inputs={inputs} onChange={setInputs} />
          </div>
          <div className="order-1 lg:sticky lg:top-20 lg:order-2">
            <ResultCard result={result} />
          </div>
        </div>
      </Section>

      <Section id="impact">
        <SectionHead eyebrow="내일의 나" title="내일, 이렇게 달라져요" />
        <ImpactSection phaseDelayMin={result.phaseDelayMin} avgRecentSleepHours={inputs.avgRecentSleepHours} />
      </Section>

      <Section id="why">
        <SectionHead eyebrow="원인" title="왜 이런 결과일까요?" sub="다섯 가지 요인이 더해진 값이에요." />
        <div className="mx-auto max-w-3xl">
          <PhaseBreakdown inputs={inputs} result={result} />
        </div>
      </Section>

      <Section id="whatif">
        <SectionHead eyebrow="해결" title="이렇게 바꿔보세요" sub="효과가 큰 순서예요." />
        <div className="mx-auto max-w-3xl">
          <WhatIfSection inputs={inputs} phaseDelayMin={result.phaseDelayMin} />
        </div>
      </Section>

      <Section id="coach">
        <SectionHead eyebrow="AI 코치" title="Chrono-AI에게 물어보세요" sub="내 결과를 알고 답해요." />
        <ChronoAI inputs={inputs} />
      </Section>

      <Section id="caffeine">
        <SectionHead eyebrow="카페인" title="자는 동안에도 남아 있어요" />
        <div className="mx-auto max-w-3xl">
          <CaffeineConverter
            doseMg={inputs.caffeineMg}
            hoursElapsed={inputs.hoursSinceCaffeine}
            residueMg={result.caffeineResidueMg}
          />
        </div>
      </Section>

      <Section id="jetlag">
        <SectionHead eyebrow="사회적 시차" title="내 몸은 지금 어느 도시일까요?" />
        <WorldJetlagMap phaseDelayMin={result.phaseDelayMin} />
      </Section>

      <LiveBar visible={inputsInView} result={result} />
    </>
  );
}
