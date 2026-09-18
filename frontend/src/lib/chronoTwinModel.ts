/**
 * Chrono-Twin 간이 추정 모형 (프론트엔드 실시간 데모용)
 * ================================================
 *
 * pipeline/transforms/{pharmacokinetics,photobiology}.py 와
 * pipeline/dummy_data.py 의 GROUND_TRUTH 계수를 TypeScript 로 그대로 이식.
 *
 * 주의: 이 계수들은 "더미(합성) 데이터로 자체검증한" 교육용 스케일링 근사치이며
 * 임상 측정값이 아니다 — 파이프라인 문서와 동일한 원칙. 실측 데이터 수집 후
 * pipeline/regression.py 의 추정 계수로 교체 예정.
 */

// ── 블루라이트 (스마트폰) ──────────────────────────────────────────
const BL_BASE = 0.4;
const BL_BRIGHTNESS_GAIN = 0.8;

export function bluelightAdjustedMin(durationMin: number, brightnessRatio: number): number {
  const b = Math.min(1, Math.max(0, brightnessRatio));
  return Math.max(0, durationMin) * (BL_BASE + BL_BRIGHTNESS_GAIN * b);
}

// ── LED 조명 (mel-DER 근사) ────────────────────────────────────────
const CCT_REF_LOW = 2700;
const CCT_REF_HIGH = 6500;
const MDER_AT_LOW = 0.45;
const MDER_AT_HIGH = 0.9;
const MDER_CLIP: [number, number] = [0.3, 1.05];
const LUX_HALF = 100;
const ADOLESCENT_GAIN = 1.15;

export function melDER(colorTempK: number): number {
  const slope = (MDER_AT_HIGH - MDER_AT_LOW) / (CCT_REF_HIGH - CCT_REF_LOW);
  const raw = MDER_AT_LOW + (colorTempK - CCT_REF_LOW) * slope;
  return Math.min(MDER_CLIP[1], Math.max(MDER_CLIP[0], raw));
}

export function melanopicLux(lux: number, colorTempK: number): number {
  return Math.max(0, lux) * melDER(colorTempK);
}

export function ledEveningLoad(lux: number, colorTempK: number, adolescent = true): number {
  const mLux = melanopicLux(lux, colorTempK);
  let load = Math.log10(1 + mLux / LUX_HALF);
  if (adolescent) load *= ADOLESCENT_GAIN;
  return load;
}

// ── 카페인 약동학 ──────────────────────────────────────────────────
const CAFFEINE_HALF_LIFE_H = 5.5;

export function caffeineResidueAt(doseMg: number, hoursElapsed: number): number {
  if (hoursElapsed <= 0) return Math.max(0, doseMg);
  return Math.max(0, doseMg) * Math.pow(0.5, hoursElapsed / CAFFEINE_HALF_LIFE_H);
}

export function caffeineDecayCurve(doseMg: number, maxHours = 12, steps = 40) {
  const pts: { h: number; mg: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const h = (maxHours * i) / steps;
    pts.push({ h, mg: caffeineResidueAt(doseMg, h) });
  }
  return pts;
}

// ── 수면 부채 (5일 누적, 간이) ─────────────────────────────────────
const RECOMMENDED_SLEEP_MIN = 480;

export function fiveDaySleepDebtMin(avgRecentSleepMin: number): number {
  const dailyDeficit = Math.max(0, RECOMMENDED_SLEEP_MIN - avgRecentSleepMin);
  return dailyDeficit * 5;
}

// ── 통합 위상지연 추정 (dummy_data.GROUND_TRUTH 계수) ──────────────
export const GROUND_TRUTH = {
  betaBluelightAdj: 0.18,
  betaCaffeineResidue: 0.22,
  betaSleepDebt: 0.045,
  gammaLedLoad: 14.0,
  gammaExercise: -6.0,
  intercept: 0.0,
};

export interface ChronoTwinInputs {
  bluelightMin: number; // 취침 전 2h 스마트폰 사용(분)
  screenBrightness: number; // 0~1
  caffeineMg: number; // 오후 6시 이후 총 카페인(mg)
  hoursSinceCaffeine: number; // 섭취 후 경과 시간(h, 취침 시점 기준)
  ledLux: number; // 취침 전 실내 조도
  ledColorTempK: number; // 실내 조명 CCT
  avgRecentSleepHours: number; // 최근 5일 평균 수면시간
  exercisedToday: boolean;
}

export interface ChronoTwinResult {
  bluelightAdjMin: number;
  caffeineResidueMg: number;
  sleepDebtMin: number;
  ledLoad: number;
  melanopicLux: number;
  phaseDelayMin: number; // 추정 위상 지연(분)
  vitality: number; // 0~1, 아바타 상태
  severity: "great" | "good" | "moderate" | "poor" | "severe";
}

export function computeChronoTwin(inputs: ChronoTwinInputs): ChronoTwinResult {
  const bluelightAdjMin = bluelightAdjustedMin(inputs.bluelightMin, inputs.screenBrightness);
  const caffeineResidueMg = caffeineResidueAt(inputs.caffeineMg, inputs.hoursSinceCaffeine);
  const sleepDebtMin = fiveDaySleepDebtMin(inputs.avgRecentSleepHours * 60);
  const led = ledEveningLoad(inputs.ledLux, inputs.ledColorTempK);
  const mLux = melanopicLux(inputs.ledLux, inputs.ledColorTempK);

  const phaseDelayMin =
    GROUND_TRUTH.intercept +
    GROUND_TRUTH.betaBluelightAdj * bluelightAdjMin +
    GROUND_TRUTH.betaCaffeineResidue * caffeineResidueMg +
    GROUND_TRUTH.betaSleepDebt * sleepDebtMin +
    GROUND_TRUTH.gammaLedLoad * led +
    GROUND_TRUTH.gammaExercise * (inputs.exercisedToday ? 1 : 0);

  // 0분(완벽) ~ 180분(심각) 을 vitality 1→0 으로. 음수(위상 전진)는 보너스로 1 이상 클립.
  const vitality = clamp(1 - phaseDelayMin / 180, 0, 1);

  let severity: ChronoTwinResult["severity"];
  if (phaseDelayMin < 10) severity = "great";
  else if (phaseDelayMin < 40) severity = "good";
  else if (phaseDelayMin < 80) severity = "moderate";
  else if (phaseDelayMin < 130) severity = "poor";
  else severity = "severe";

  return {
    bluelightAdjMin,
    caffeineResidueMg,
    sleepDebtMin,
    ledLoad: led,
    melanopicLux: mLux,
    phaseDelayMin,
    vitality,
    severity,
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** vitality(0~1) → 건강한 teal(#2dd4bf)~위험한 red(#f87171) 보간 색상. */
export function vitalityColor(vitality: number): string {
  // HSL 보간: 165°(teal) → 260°(purple, 낮은 채도) → 0°(red) 느낌으로 손실감 있게
  const hue = lerp(0, 168, vitality); // 0=red, 168=teal
  const sat = lerp(45, 70, vitality);
  const light = lerp(45, 58, vitality);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export const SEVERITY_LABEL: Record<ChronoTwinResult["severity"], string> = {
  great: "매우 양호",
  good: "양호",
  moderate: "주의",
  poor: "경고",
  severe: "심각",
};

/* ════════════════════════════════════════════════════════════════
 * 3주차 "웹사이트 적용 방안" — 팀원 제안 기반 확장
 * 유가빈(뇌과학): 단계별 경고 진단 카드, N3/REM 비대칭 손실
 * 전윤서(생명공학): 카페인 컷오프 타임(골든타임) 역산
 * 홍서준(약학): Dose Echo — 카페인 잔존량의 실생활 단위 환산
 * ════════════════════════════════════════════════════════════════ */

// ── 유가빈: 단계별 뇌과학적 경고 진단 (원자료: knowledge 유가빈 3주차 제안) ──
export type PhaseDiagnosisLevel = "advanced" | "normal" | "moderate" | "severe";

export interface PhaseDiagnosis {
  level: PhaseDiagnosisLevel;
  title: string;
  detail: string;
}

export function diagnosePhaseDelay(phaseDelayMin: number): PhaseDiagnosis {
  if (phaseDelayMin < 0) {
    return {
      level: "advanced",
      title: "위상 앞당겨짐",
      detail: "생체 시계가 오히려 계획보다 일찍 준비된 상태예요. 지금 습관을 유지해도 좋습니다.",
    };
  }
  if (phaseDelayMin <= 50) {
    return {
      level: "normal",
      title: "정상 범위",
      detail: "생체 시계와 오늘 습관 사이의 차이가 크지 않아요.",
    };
  }
  if (phaseDelayMin <= 120) {
    return {
      level: "moderate",
      title: "중등도 수면 위상 지연",
      detail: "이 정도 지연이 반복되면 다음날 집중력·작업기억이 눈에 띄게 떨어질 수 있어요.",
    };
  }
  return {
    level: "severe",
    title: "심각한 수면 위상 지연",
    detail:
      "전전두엽(판단·집중을 담당하는 뇌 영역) 기능 저하와 편도체 과활성화로 인한 감정 불안정 위험이 있는 수준이에요.",
  };
}

export const PHASE_DIAGNOSIS_TONE: Record<PhaseDiagnosisLevel, string> = {
  advanced: "#6ee7b7",
  normal: "#4fa3e0",
  moderate: "#f59e0b",
  severe: "#f87171",
};

// ── 유가빈: 수면 단계별 비대칭 손실 (N3 −0.08·분, REM −0.12·분, 지연 1분당) ──
export interface SleepStageLoss {
  n3LossMin: number;
  remLossMin: number;
}

export function sleepStageLoss(phaseDelayMin: number): SleepStageLoss {
  const delay = Math.max(0, phaseDelayMin);
  return {
    n3LossMin: Math.round(delay * 0.08 * 10) / 10,
    remLossMin: Math.round(delay * 0.12 * 10) / 10,
  };
}

// ── 홍서준 "Dose Echo": 잔존 카페인을 실생활 단위로 환산 ──────────────
export interface CaffeineFamiliarUnit {
  key: "coffee" | "energy" | "candy";
  label: string;
  basis: string;
  mgPerUnit: number;
  count: number;
}

export function caffeineFamiliarUnits(residueMg: number): CaffeineFamiliarUnit[] {
  const mg = Math.max(0, residueMg);
  const defs: Omit<CaffeineFamiliarUnit, "count">[] = [
    { key: "coffee", label: "아메리카노(톨)", basis: "150mg / 1잔", mgPerUnit: 150 },
    { key: "energy", label: "에너지드링크", basis: "80mg / 1캔", mgPerUnit: 80 },
    { key: "candy", label: "코피코 커피캔디", basis: "22.5mg / 1개", mgPerUnit: 22.5 },
  ];
  return defs.map((d) => ({ ...d, count: mg / d.mgPerUnit }));
}

// ── 전윤서: 카페인 컷오프(골든타임) — 안전 역치 아래로 내려가기까지 필요한 시간 ──
const CAFFEINE_SAFE_THRESHOLD_MG = 50; // 아데노신 차단 영향이 미미해지는 근사 역치

export function caffeineSafeHoursNeeded(doseMg: number): number {
  if (doseMg <= CAFFEINE_SAFE_THRESHOLD_MG) return 0;
  return CAFFEINE_HALF_LIFE_H * Math.log2(doseMg / CAFFEINE_SAFE_THRESHOLD_MG);
}

/* ════════════════════════════════════════════════════════════════
 * 4주차 확장 — "왜 이렇게 보이는지" 설명 가능성 + 개인화 Chrono-AI
 * ════════════════════════════════════════════════════════════════ */

// ── 위상 지연 원인 분해: GROUND_TRUTH 각 항을 그대로 분리 (선형모형이라 합산=원값) ──
export interface PhaseDelayBreakdownItem {
  key: "bluelight" | "caffeine" | "sleepDebt" | "ledLoad" | "exercise";
  label: string;
  contributionMin: number;
  color: string;
}

export function phaseDelayBreakdown(
  inputs: ChronoTwinInputs,
  result: ChronoTwinResult
): PhaseDelayBreakdownItem[] {
  return [
    {
      key: "bluelight",
      label: "스마트폰 블루라이트",
      contributionMin: GROUND_TRUTH.betaBluelightAdj * result.bluelightAdjMin,
      color: "#4fa3e0",
    },
    {
      key: "caffeine",
      label: "취침 시 잔존 카페인",
      contributionMin: GROUND_TRUTH.betaCaffeineResidue * result.caffeineResidueMg,
      color: "#f59e0b",
    },
    {
      key: "sleepDebt",
      label: "5일 누적 수면부채",
      contributionMin: GROUND_TRUTH.betaSleepDebt * result.sleepDebtMin,
      color: "#a78bfa",
    },
    {
      key: "ledLoad",
      label: "취침 전 실내 LED",
      contributionMin: GROUND_TRUTH.gammaLedLoad * result.ledLoad,
      color: "#2dd4bf",
    },
    {
      key: "exercise",
      label: "오늘의 운동",
      contributionMin: GROUND_TRUTH.gammaExercise * (inputs.exercisedToday ? 1 : 0),
      color: "#6ee7b7",
    },
  ];
}

// ── 유가빈 "잠의 의미": 위상 지연이 90분 수면 주기를 몇 개나 잘라내는지 ──
const SLEEP_CYCLE_MIN = 90;

export interface SleepCycleImpact {
  baselineCycles: number;
  actualCycles: number;
  cyclesLost: number;
  effectiveSleepMin: number;
}

export function sleepCycleImpact(phaseDelayMin: number, avgRecentSleepHours: number): SleepCycleImpact {
  const baselineMin = Math.max(0, avgRecentSleepHours * 60);
  const effectiveSleepMin = Math.max(0, baselineMin - Math.max(0, phaseDelayMin));
  const baselineCycles = Math.floor(baselineMin / SLEEP_CYCLE_MIN);
  const actualCycles = Math.floor(effectiveSleepMin / SLEEP_CYCLE_MIN);
  return {
    baselineCycles,
    actualCycles,
    cyclesLost: Math.max(0, baselineCycles - actualCycles),
    effectiveSleepMin,
  };
}
