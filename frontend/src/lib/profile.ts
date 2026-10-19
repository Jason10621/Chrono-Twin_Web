/**
 * 내 설정 · 예측 기록 — 전부 이 기기의 localStorage 에만 저장한다(서버로 보내지 않음).
 * 저장소가 막혀 있어도(사생활 보호 모드 등) 화면은 그대로 동작하도록 모든 접근을 try/catch 로 감쌌다.
 */
import { DEFAULT_CAFFEINE_HALF_LIFE_H, clamp, type ChronoTwinInputs } from "./chronoTwinModel";

export type Chronotype = "morning" | "neutral" | "evening";
export type CaffeineSensitivity = "low" | "normal" | "high";

export interface Profile {
  chronotype: Chronotype;
  caffeine: CaffeineSensitivity;
  /** 보통 잠자리에 드는 시각(자정부터의 분, 0~1439). */
  bedtimeMin: number;
}

export const CHRONOTYPE_LABEL: Record<Chronotype, string> = {
  morning: "아침형",
  neutral: "보통",
  evening: "저녁형",
};

export const CAFFEINE_LABEL: Record<CaffeineSensitivity, string> = {
  low: "잘 안 받아요",
  normal: "보통이에요",
  high: "예민해요",
};

/** 크로노타입은 모형 계수에 들어가지 않는다 — 취침 시각 기본값(플랜의 기준 시각)에만 쓴다. */
export const DEFAULT_BEDTIME_MIN: Record<Chronotype, number> = {
  morning: 22 * 60 + 30,
  neutral: 23 * 60 + 30,
  evening: 30,
};

/** 카페인 민감도는 반감기 가정(4h / 5.5h / 7h)으로 옮겨 쓴다. 개인차가 크다는 점을 반영한 추정 가정이다. */
export const HALF_LIFE_BY_SENSITIVITY: Record<CaffeineSensitivity, number> = {
  low: 4,
  normal: DEFAULT_CAFFEINE_HALF_LIFE_H,
  high: 7,
};

export const DEFAULT_PROFILE: Profile = {
  chronotype: "neutral",
  caffeine: "normal",
  bedtimeMin: DEFAULT_BEDTIME_MIN.neutral,
};

/* ── 안전한 localStorage ── */
function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장이 막혀 있어도 그냥 넘어간다 */
  }
}

const KEY_PROFILE = "ct-profile";
const KEY_INPUTS = "ct-inputs";
const KEY_LOG = "ct-log";

export function loadProfile(): Profile | null {
  const p = read<Partial<Profile>>(KEY_PROFILE);
  if (!p || !p.chronotype || !p.caffeine) return null;
  if (!(p.chronotype in CHRONOTYPE_LABEL) || !(p.caffeine in CAFFEINE_LABEL)) return null;
  const bed = typeof p.bedtimeMin === "number" ? clamp(Math.round(p.bedtimeMin), 0, 1439) : DEFAULT_BEDTIME_MIN[p.chronotype];
  return { chronotype: p.chronotype, caffeine: p.caffeine, bedtimeMin: bed };
}
export const saveProfile = (p: Profile) => write(KEY_PROFILE, p);

/** 슬라이더로 직접 만지는 값만 저장한다(내 설정·보정에서 온 값은 제외). */
export type RawInputs = Omit<ChronoTwinInputs, "caffeineHalfLifeH" | "personalOffsetMin">;

export function pickRaw(i: ChronoTwinInputs): RawInputs {
  const { caffeineHalfLifeH: _h, personalOffsetMin: _o, ...raw } = i;
  void _h;
  void _o;
  return raw;
}

export const loadInputs = () => read<Partial<RawInputs>>(KEY_INPUTS);
export const saveInputs = (i: RawInputs) => write(KEY_INPUTS, i);

/* ── 예측 기록 ── */
export interface LogEntry {
  /** 그 밤이 시작된 날(기기 시간 기준 YYYY-MM-DD). */
  date: string;
  /** 모형이 낸 위상 지연(분) — 개인 보정을 빼고 저장해 보정이 스스로를 먹지 않게 한다. */
  predicted: number;
  /** 다음 날 아침 직접 적은 "평소보다 몇 분 늦게 잠들었나". */
  actual?: number;
}

export function loadLog(): LogEntry[] {
  const raw = read<LogEntry[]>(KEY_LOG);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.date === "string" && typeof e.predicted === "number")
    .map((e) => ({
      date: e.date,
      predicted: e.predicted,
      actual: typeof e.actual === "number" ? e.actual : undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-60);
}
export const saveLog = (log: LogEntry[]) => write(KEY_LOG, log);

/** "밤의 날짜" — 새벽 5시 전이면 아직 어젯밤이 이어지는 중이라 어제 날짜로 센다. */
export function todayKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 5 ? 1 : 0));
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 아직 실제 값을 안 적은 가장 최근의 "지난 밤" 기록. */
export function pendingEntry(log: LogEntry[], today = todayKey()): LogEntry | null {
  const past = log.filter((e) => e.actual === undefined && e.date < today);
  return past.length ? past[past.length - 1] : null;
}

export interface Calibration {
  n: number;
  meanError: number;
  offsetMin: number;
}

/**
 * 예측-실제 차이의 평균을 n/(n+3) 만큼만 반영한다(기록이 적을수록 조심스럽게).
 * 한 번 틀렸다고 모형이 크게 흔들리지 않게 ±45분으로 묶는다.
 */
export function calibrationFrom(log: LogEntry[]): Calibration {
  const done = log.filter((e) => e.actual !== undefined);
  const n = done.length;
  if (n === 0) return { n: 0, meanError: 0, offsetMin: 0 };
  const meanError = done.reduce((s, e) => s + ((e.actual as number) - e.predicted), 0) / n;
  const offsetMin = clamp(meanError * (n / (n + 3)), -45, 45);
  return { n, meanError, offsetMin };
}

export function formatDateKo(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${m}월 ${d}일`;
}
