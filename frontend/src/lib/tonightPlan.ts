/**
 * 오늘 밤 실행 플랜 — "이렇게 바꿔보세요"를 시각이 찍힌 타임라인으로 바꾼다.
 * 효과(분)는 따로 어림하지 않고, 계획대로 했을 때의 입력값을 같은 모형에 다시 넣어 구한다.
 */
import {
  caffeineSafeHoursNeeded,
  computeChronoTwin,
  DEFAULT_CAFFEINE_HALF_LIFE_H,
  type ChronoTwinInputs,
} from "./chronoTwinModel";

export type PlanKey = "exercise" | "caffeine" | "light" | "phone" | "bed";

export interface PlanStep {
  key: PlanKey;
  label: string;
  detail: string;
  /** 취침 몇 분 전인가(0=취침). */
  leadMin: number;
  /** 이 항목만 지켰을 때 줄어드는 위상 지연(분). 0이면 이미 잘 지키고 있다는 뜻. */
  savedMin: number;
  /** 이미 지키고 있어서 따로 바꿀 게 없는 항목. */
  done: boolean;
}

export interface TonightPlanResult {
  steps: PlanStep[];
  /** 지금 습관 그대로일 때 / 계획대로 했을 때의 위상 지연(분). */
  beforeMin: number;
  afterMin: number;
  planInputs: ChronoTwinInputs;
}

const PHONE_OFF_LEAD_MIN = 60; // 취침 1시간 전부터 화면 끄기 → 모형의 "취침 전 2시간 사용량"이 최대 60분이 된다
const LIGHT_DIM_LEAD_MIN = 90; // 취침 90분 전부터 전구색·약한 조명
const EXERCISE_LEAD_MIN = 240; // 운동은 취침 4시간 전까지

type Patch = (i: ChronoTwinInputs) => ChronoTwinInputs;

export function tonightPlan(inputs: ChronoTwinInputs): TonightPlanResult {
  const halfLife = inputs.caffeineHalfLifeH ?? DEFAULT_CAFFEINE_HALF_LIFE_H;
  const base = computeChronoTwin(inputs).phaseDelayMin;
  const saved = (patch: Patch) => base - computeChronoTwin(patch(inputs)).phaseDelayMin;

  const cutoffHours = caffeineSafeHoursNeeded(inputs.caffeineMg, halfLife);
  const patches: Record<Exclude<PlanKey, "bed">, Patch> = {
    // 마지막 카페인을 '안전 수준(50mg)'까지 분해될 시간 전에 마시면, 취침 시점 경과 시간이 그만큼 확보된다.
    caffeine: (i) => ({ ...i, hoursSinceCaffeine: Math.max(i.hoursSinceCaffeine, cutoffHours) }),
    phone: (i) => ({ ...i, bluelightMin: Math.min(i.bluelightMin, PHONE_OFF_LEAD_MIN) }),
    light: (i) => ({ ...i, ledColorTempK: Math.min(i.ledColorTempK, 2700), ledLux: Math.min(i.ledLux, 100) }),
    exercise: (i) => ({ ...i, exercisedToday: true }),
  };

  const savedBy = {
    caffeine: saved(patches.caffeine),
    phone: saved(patches.phone),
    light: saved(patches.light),
    exercise: saved(patches.exercise),
  };

  const steps: PlanStep[] = [];

  if (!inputs.exercisedToday) {
    steps.push({
      key: "exercise",
      label: "30분 운동 마치기",
      detail: "취침 4시간 전까지 끝내면 좋아요",
      leadMin: EXERCISE_LEAD_MIN,
      savedMin: savedBy.exercise,
      done: false,
    });
  }

  if (inputs.caffeineMg > 0) {
    const ok = savedBy.caffeine < 1;
    steps.push({
      key: "caffeine",
      label: "마지막 카페인",
      detail: ok
        ? `${Math.round(inputs.caffeineMg)}mg — 지금 간격이면 충분해요`
        : `${Math.round(inputs.caffeineMg)}mg 기준 · 이후엔 물이나 보리차`,
      leadMin: Math.round(Math.max(cutoffHours, inputs.hoursSinceCaffeine) * 60),
      savedMin: savedBy.caffeine,
      done: ok,
    });
  }

  {
    const ok = savedBy.light < 1;
    steps.push({
      key: "light",
      label: "조명 낮추기",
      detail: ok ? "지금 조명이면 충분해요" : "전구색 · 100lux 이하로",
      leadMin: LIGHT_DIM_LEAD_MIN,
      savedMin: savedBy.light,
      done: ok,
    });
  }

  {
    const ok = savedBy.phone < 1;
    steps.push({
      key: "phone",
      label: "스마트폰 내려놓기",
      detail: ok ? "지금 사용량이면 충분해요" : "이 시각 이후엔 화면을 보지 않아요",
      leadMin: PHONE_OFF_LEAD_MIN,
      savedMin: savedBy.phone,
      done: ok,
    });
  }

  steps.push({ key: "bed", label: "잠자리에 눕기", detail: "", leadMin: 0, savedMin: 0, done: false });

  // 먼저 해야 하는 일(취침까지 많이 남은 것)부터 위에 둔다.
  steps.sort((a, b) => b.leadMin - a.leadMin);

  const planInputs = (["exercise", "caffeine", "light", "phone"] as const).reduce(
    (acc, k) => patches[k](acc),
    inputs
  );
  const afterMin = computeChronoTwin(planInputs).phaseDelayMin;

  return { steps, beforeMin: base, afterMin, planInputs };
}

/* ── 시각 계산 ── */
const DAY = 1440;
const mod = (n: number) => ((n % DAY) + DAY) % DAY;

/** 자정부터의 분 → "23:40". */
export function clock(min: number): string {
  const m = mod(Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** 취침 시각이 새벽(정오 이전)이면 "오늘 밤"의 취침은 내일 날짜에 속한다. */
export function bedAbsMin(bedtimeMin: number): number {
  return bedtimeMin < 12 * 60 ? bedtimeMin + DAY : bedtimeMin;
}

/** 잠드는 시각 = 취침 시각 + 위상 지연. 사람이 읽기 쉽게 "새벽 00:19" 형태로 돌려준다. */
export function fallAsleepLabel(bedtimeMin: number, delayMin: number): string {
  const t = mod(bedtimeMin + delayMin);
  const dawn = t < 5 * 60 ? "새벽 " : "";
  return `${dawn}${clock(t)}`;
}

/* ── 캘린더(.ics) ── 기기의 캘린더 앱이 알림까지 챙겨준다 ── */
const pad = (n: number) => String(n).padStart(2, "0");

function icsLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

const escapeIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function buildIcs(steps: PlanStep[], bedtimeMin: number, now = new Date()): string {
  const bedAbs = bedAbsMin(bedtimeMin);
  // 새벽 5시 전이면 아직 "어젯밤"이 이어지는 중이라, 그 밤이 시작된 어제를 기준일로 삼는다.
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 5 ? 1 : 0));
  const eventsFor = (day0: Date) =>
    steps
      .filter((s) => !s.done)
      .map((s) => ({ s, start: new Date(day0.getTime() + (bedAbs - s.leadMin) * 60_000) }))
      .filter((e) => e.start.getTime() >= now.getTime());

  let day0 = startDay;
  let events = eventsFor(day0);
  if (events.length === 0) {
    // 오늘 밤 일정이 전부 지나갔으면 다음 밤으로 넘긴다.
    day0 = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + 1);
    events = eventsFor(day0);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chrono-Twin//Tonight Plan//KO",
    "CALSCALE:GREGORIAN",
  ];
  events.forEach(({ s, start }, i) => {
    const end = new Date(start.getTime() + 15 * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:chrono-twin-${icsLocal(day0)}-${i}-${s.key}@chrono-twin`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocal(start)}`,
      `DTEND:${icsLocal(end)}`,
      `SUMMARY:${escapeIcs(`[Chrono-Twin] ${s.label}`)}`,
      `DESCRIPTION:${escapeIcs(s.detail || "오늘 밤 실행 플랜")}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(s.label)}`,
      "TRIGGER:-PT5M",
      "END:VALARM",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
