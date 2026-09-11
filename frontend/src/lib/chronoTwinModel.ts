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
