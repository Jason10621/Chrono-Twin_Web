"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import InputPanel from "./InputPanel";
import ImpactSection from "./ImpactSection";
import PhaseBreakdown from "./PhaseBreakdown";
import WhatIfSection from "./WhatIfSection";
import ChronoAI from "./ChronoAI";
import CaffeineConverter from "./CaffeineConverter";
import ProfileCard from "./ProfileCard";
import TonightPlan from "./TonightPlan";
import ScenarioCompare from "./ScenarioCompare";
import MyTwin from "./MyTwin";
import ShareCard from "./ShareCard";
import LightsOut from "./LightsOut";
import { Section, SectionHead } from "./Section";
import {
  PHASE_DIAGNOSIS_LABEL,
  PHASE_DIAGNOSIS_TONE,
  PREDICTION_SIGMA_MIN,
  computeChronoTwin,
  delaySentence,
  diagnosePhaseDelay,
  normalizeInputs,
  phaseDelayRange,
  type ChronoTwinInputs,
  type ChronoTwinResult,
} from "@/lib/chronoTwinModel";
import { LIGHTS_ON_REFERENCE_LUX, inputEgg, lightsOutHint } from "@/lib/easter";
import {
  DEFAULT_PROFILE,
  HALF_LIFE_BY_SENSITIVITY,
  calibrationFrom,
  loadInputs,
  loadLog,
  loadProfile,
  pendingEntry,
  pickRaw,
  saveInputs,
  saveLog,
  saveProfile,
  todayKey,
  type LogEntry,
  type Profile,
} from "@/lib/profile";

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

function ResultCard({
  result,
  offsetMin,
  badge,
}: {
  result: ChronoTwinResult;
  offsetMin: number;
  /** 이스터에그: 슬라이더 극단에서 배지 문구를 바꾼다(숫자는 그대로). */
  badge?: string;
}) {
  const { level } = diagnosePhaseDelay(result.phaseDelayMin);
  const tone = PHASE_DIAGNOSIS_TONE[level];
  const range = phaseDelayRange(result.phaseDelayMin);
  const needsCare = level === "moderate" || level === "severe";
  return (
    <div id="result" className="card overflow-hidden !p-0 text-center">
      <ChronoTwinAvatar vitality={result.vitality} />
      <div className="px-6 pb-10 md:px-10">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-fg/[0.07] px-4 py-1.5 text-[17px] font-semibold">
          <i className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
          {badge ?? PHASE_DIAGNOSIS_LABEL[level]}
        </span>
        <p className="t-number mt-5" style={{ color: tone }}>
          {signed(result.phaseDelayMin)}
          <span className="ml-1.5 text-[0.28em] font-medium tracking-normal text-fg-2">분</span>
        </p>
        <p className="mt-4 text-[clamp(21px,2.6vw,28px)] font-semibold tracking-tight">
          {delaySentence(result.phaseDelayMin)}
        </p>
        <p className="mt-3 text-[16px] text-fg-2">
          {signed(range.lo)} ~ {signed(range.hi)}분 사이일 수 있어요 (±{PREDICTION_SIGMA_MIN}분)
        </p>
        <p className="mt-1 text-[14px] text-fg-3">
          더미 데이터로 검증한 간이 추정이라 실제 사람은 더 벌어질 수 있어요
          {Math.abs(offsetMin) >= 0.5 && ` · 내 기록 보정 ${signed(offsetMin)}분 포함`}
        </p>
        {needsCare && (
          <p className="mx-auto mt-5 max-w-md rounded-2xl bg-sys-orange/[0.12] px-5 py-3.5 text-[15px] leading-snug text-fg">
            이런 날이 며칠째 이어지고 낮에 많이 졸리다면, 보건선생님이나 병원에서 상담을 받아 보세요.
          </p>
        )}
      </div>
    </div>
  );
}

/** 모바일에서 슬라이더를 만지는 동안 결과가 화면 밖으로 사라지지 않도록 하단에 작게 띄운다. */
function LiveBar({ visible, result, badge }: { visible: boolean; result: ChronoTwinResult; badge?: string }) {
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
        {badge ?? PHASE_DIAGNOSIS_LABEL[level]}
      </span>
      <span className="text-[26px] font-semibold tabular-nums leading-none" style={{ color: tone }}>
        {signed(result.phaseDelayMin)}
        <span className="ml-0.5 text-[15px] font-medium text-fg-2">분</span>
      </span>
    </a>
  );
}

export default function SleepAnalyzer() {
  // 슬라이더로 직접 만지는 값. 내 설정·기록 보정(파생값)은 아래 `inputs` 에서 따로 얹는다.
  const [raw, setRaw] = useState<ChronoTwinInputs>(DEFAULT_INPUTS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bedtimeMin, setBedtimeMin] = useState(DEFAULT_PROFILE.bedtimeMin);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [calibPref, setCalibPref] = useState<boolean | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 서버 렌더링과 어긋나지 않게, 저장된 값은 마운트 뒤에 읽는다.
  useEffect(() => {
    const stored = loadInputs();
    // 0lux(손전등 이스터에그)로 끝낸 상태를 다시 열었을 때 화면이 어두운 채로 시작하지 않게, 0이면 복원하지 않는다.
    if (stored) {
      const merged = { ...DEFAULT_INPUTS, ...stored };
      if (merged.ledLux === 0) merged.ledLux = DEFAULT_INPUTS.ledLux;
      setRaw(pickRaw(normalizeInputs(merged)));
    }
    const p = loadProfile();
    if (p) {
      setProfile(p);
      setBedtimeMin(p.bedtimeMin);
    }
    setLog(loadLog());
    try {
      const c = window.localStorage.getItem("ct-calib");
      if (c === "1" || c === "0") setCalibPref(c === "1");
    } catch {
      /* 저장소를 못 읽어도 기본값으로 동작 */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveInputs(pickRaw(raw));
  }, [raw, hydrated]);

  const calibration = useMemo(() => calibrationFrom(log), [log]);
  // 기록이 3번 이상 쌓이면 자동으로 켜지고, 사용자가 직접 고르면 그 선택을 따른다.
  const calibOn = calibPref ?? calibration.n >= 3;
  const offsetMin = calibOn ? calibration.offsetMin : 0;

  const inputs: ChronoTwinInputs = useMemo(
    () => ({
      ...raw,
      caffeineHalfLifeH: profile ? HALF_LIFE_BY_SENSITIVITY[profile.caffeine] : undefined,
      personalOffsetMin: offsetMin,
    }),
    [raw, profile, offsetMin]
  );
  const result = useMemo(() => computeChronoTwin(inputs), [inputs]);
  // 기록에는 개인 보정을 뺀 모형 값을 남겨야 보정이 자기 자신을 먹지 않는다.
  const modelOnlyMin = useMemo(
    () => computeChronoTwin({ ...inputs, personalOffsetMin: 0 }).phaseDelayMin,
    [inputs]
  );
  const pending = hydrated ? pendingEntry(log) : null;

  // 이스터에그(lib/easter.ts): 카페인·수면 슬라이더 극단의 배지 문구, 카페인 폭주 떨림, 0lux 손전등
  const egg = inputEgg(inputs);
  const jitter = egg?.kind === "caffeine";
  useEffect(() => {
    document.documentElement.classList.toggle("caffeine-jitter", jitter);
    return () => document.documentElement.classList.remove("caffeine-jitter");
  }, [jitter]);
  const lightsOut = raw.ledLux === 0;
  const lightsOn = useCallback(() => setRaw((r) => ({ ...r, ledLux: LIGHTS_ON_REFERENCE_LUX })), []);

  const inputsRef = useRef<HTMLDivElement>(null);
  const [inputsInView, setInputsInView] = useState(false);
  useEffect(() => {
    const el = inputsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInputsInView(e.isIntersecting), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const applyInputs = (next: ChronoTwinInputs) => setRaw(pickRaw(next));

  const updateLog = (next: LogEntry[]) => {
    setLog(next);
    saveLog(next);
  };

  const saveProfileAndBed = (p: Profile) => {
    setProfile(p);
    setBedtimeMin(p.bedtimeMin);
    saveProfile(p);
  };

  const changeBedtime = (m: number) => {
    setBedtimeMin(m);
    if (profile) {
      const next = { ...profile, bedtimeMin: m };
      setProfile(next);
      saveProfile(next);
    }
  };

  const saveToday = () => {
    const date = todayKey();
    const prev = log.find((e) => e.date === date);
    const entry: LogEntry = { date, predicted: Math.round(modelOnlyMin * 10) / 10, actual: prev?.actual };
    updateLog([...log.filter((e) => e.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const answer = (date: string, actual: number) =>
    updateLog(log.map((e) => (e.date === date ? { ...e, actual } : e)));

  const toggleCalibration = () => {
    const next = !calibOn;
    setCalibPref(next);
    try {
      window.localStorage.setItem("ct-calib", next ? "1" : "0");
    } catch {
      /* 무시 */
    }
  };

  return (
    <>
      <Section id="analyze" className="!pt-4 md:!pt-8">
        <SectionHead eyebrow="분석" title="오늘 밤을 알려주세요" sub="슬라이더를 움직이면 결과가 바로 바뀌어요." />
        {pending && (
          <a
            href="#twin"
            className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full bg-sys-purple/15 px-5 py-2.5 text-[16px] font-semibold text-tx-purple transition hover:bg-sys-purple/25"
          >
            어젯밤 예측, 실제로는 어땠나요? <span aria-hidden>›</span>
          </a>
        )}
        {hydrated && <ProfileCard key={profile ? "saved" : "new"} profile={profile} onSave={saveProfileAndBed} />}
        <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
          <div ref={inputsRef} className="order-2 lg:order-1">
            <InputPanel inputs={raw} onChange={setRaw} />
          </div>
          <div className="order-1 lg:sticky lg:top-20 lg:order-2">
            <ResultCard result={result} offsetMin={offsetMin} badge={egg?.badge} />
          </div>
        </div>
      </Section>

      <Section id="impact">
        <SectionHead eyebrow="내일의 나" title="내일, 이렇게 달라져요" />
        <ImpactSection phaseDelayMin={result.phaseDelayMin} avgRecentSleepHours={inputs.avgRecentSleepHours} />
      </Section>

      <Section id="why">
        <SectionHead eyebrow="원인" title="왜 이런 결과일까요?" sub={offsetMin !== 0 ? "다섯 가지 요인과 내 몸 보정이 더해진 값이에요." : "다섯 가지 요인이 더해진 값이에요."} />
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

      <Section id="compare">
        <SectionHead eyebrow="비교" title="지금 습관 vs 바꾼 습관" sub="카페인 한 잔을 더 마시면 어떻게 될지도 바로 볼 수 있어요." />
        <div className="mx-auto max-w-3xl">
          <ScenarioCompare inputs={inputs} />
        </div>
      </Section>

      <Section id="plan">
        <SectionHead eyebrow="오늘 밤" title="시간표로 만들었어요" sub="언제 무엇을 하면 되는지, 시각까지 알려드려요." />
        <div className="mx-auto max-w-3xl">
          <TonightPlan inputs={inputs} bedtimeMin={bedtimeMin} onBedtimeChange={changeBedtime} />
        </div>
      </Section>

      <Section id="twin">
        <SectionHead
          eyebrow="내 트윈"
          title="예측과 실제를 맞춰 보세요"
          sub="기록이 쌓일수록 모형이 내 몸에 가까워져요."
        />
        <MyTwin
          log={log}
          todayPredicted={modelOnlyMin}
          calibration={calibration}
          useCalibration={calibOn}
          onSaveToday={saveToday}
          onAnswer={answer}
          onSkip={(date) => updateLog(log.filter((e) => e.date !== date))}
          onToggleCalibration={toggleCalibration}
          onClear={() => updateLog([])}
        />
      </Section>

      <Section id="coach">
        <SectionHead eyebrow="AI 코치" title="Chrono-AI에게 물어보세요" sub="내 결과를 알고 답해요." />
        <ChronoAI inputs={inputs} onApply={applyInputs} />
      </Section>

      <Section id="caffeine">
        <SectionHead eyebrow="카페인" title="자는 동안에도 남아 있어요" />
        <div className="mx-auto max-w-3xl">
          <CaffeineConverter
            doseMg={inputs.caffeineMg}
            hoursElapsed={inputs.hoursSinceCaffeine}
            residueMg={result.caffeineResidueMg}
            halfLifeH={inputs.caffeineHalfLifeH}
          />
        </div>
      </Section>

      <Section id="jetlag">
        <SectionHead eyebrow="사회적 시차" title="내 몸은 지금 어느 도시일까요?" />
        <WorldJetlagMap phaseDelayMin={result.phaseDelayMin} />
        <div className="mx-auto max-w-3xl">
          <ShareCard phaseDelayMin={result.phaseDelayMin} />
        </div>
      </Section>

      <LiveBar visible={inputsInView} result={result} badge={egg?.badge} />
      <LightsOut active={lightsOut} hint={lightsOutHint(raw.ledColorTempK)} onLightsOn={lightsOn} />
    </>
  );
}
