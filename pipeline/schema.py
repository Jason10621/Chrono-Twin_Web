"""
Chrono-Twin 데이터 수집 스키마 (정보학 파트 · 이정욱)
==================================================

EURIF 실험계획서 §2-2 "데이터 수집 스키마 구조" 를 코드로 확정한 모듈.

레이어
------
1. RawSurveyResponse : 구글 폼에서 그대로 내려온 1행 (전부 문자열, 노이즈 포함)
2. SubjectProfile    : 사전 설문 1회 (MEQ 크로노타입 · 학년 · 성별)
3. DailyRecord       : 정제된 1인-1일 표준 레코드  ← 분석의 최소 단위
4. ChronoTwinRecord  : 파생 피처까지 결합된 분석용 최종 행

원본 6개 필드(활동보고서 2-1) 대비 추가된 필드
------------------------------------------------
  led_lux         : float  취침 전 실내(책상/눈높이) 조도 [lux]      ← 신규
  led_color_temp  : int    실내 조명 상관색온도(CCT) [K]             ← 신규

추가 근거: 윤지후(정책) HCL(Human Centric Lighting) 제언 + 전윤서(생명공학)
6200K vs 3000K 멜라토닌 억제 차이. 스마트폰 블루라이트(bluelight_duration)와
별개로 '방 전체 조명 환경' 을 독립적으로 잡기 위한 변수.
"""
from __future__ import annotations

import math
import re
import uuid
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, time, timedelta
from enum import Enum
from typing import Any, Optional


# ────────────────────────────────────────────────────────────────────
# 상수 (실험계획서 §3-2, §4-3 기준)
# ────────────────────────────────────────────────────────────────────
RECOMMENDED_SLEEP_MIN = 480          # 권장 수면 8h = 480분
CAFFEINE_HALF_LIFE_H = 5.5           # 카페인 반감기 (Drake 2013)
SLEEP_DEBT_WINDOW_DAYS = 5           # 수면 부채 누적 창 (직전 5일)
Z_THRESHOLD = 3.0                    # Z-score 이상치 제거 기준 |Z| > 3.0

# 음료·식품별 카페인 함량 표 (유가빈 파트, 실험계획서 §3-2 X2)
CAFFEINE_TABLE_MG = {
    "americano": 125,       # 아메리카노 300 mL
    "can_coffee": 74,       # 캔 커피 175 mL
    "energy_drink": 80,     # 에너지드링크 250 mL
    "cola": 35,             # 콜라 350 mL
    "tea": 40,              # 녹차/홍차 200 mL (30~50 중앙값)
    "dark_chocolate": 20,   # 다크초콜릿 30 g
}

# Z-score 판별 이전에 적용하는 물리적 하드 범위 (실험계획서 §4-3)
HARD_RANGES = {
    # 원자료
    "bluelight_duration_min": (0.0, 480.0),
    "caffeine_intake_mg": (0.0, 1000.0),
    "sleep_debt_min": (0.0, 3000.0),
    "phase_delay_min": (-180.0, 180.0),
    "led_lux": (0.0, 2000.0),          # 실내 조명 물리 상한
    "led_color_temp_k": (1500, 10000), # 광원 CCT 물리 범위
    # 파생 변수(회귀 입력) — 실험계획서 §4-3 의 ①~④ 에 대응
    "bluelight_adj_min": (0.0, 600.0),      # 480분 × 최대 가중 1.2 + 여유
    "caffeine_residue_mg": (0.0, 1000.0),
    "led_melanopic_lux": (0.0, 2000.0),
}

# 표준화 β* 계산용 참조 SD (활동보고서 3-2)
SD_REFERENCE = {
    "bluelight_adj_min": 35.0,
    "caffeine_residue_mg": 60.0,
    "sleep_debt_min": 150.0,
    "led_melanopic_lux": 45.0,   # 신규 항목 참조 SD (더미 분포 기반)
}


class DayType(str, Enum):
    WORK = "work"   # 등교일 (평일)
    FREE = "free"   # 휴일 (주말·공휴일)


class Sex(str, Enum):
    MALE = "M"
    FEMALE = "F"
    OTHER = "X"


class Chronotype(str, Enum):
    """MEQ 5단계. 괄호 값은 개인 기준 취침시각 보정량(분)."""
    DEFINITE_MORNING = "definite_morning"    # -90
    MODERATE_MORNING = "moderate_morning"    # -45
    INTERMEDIATE = "intermediate"            #   0
    MODERATE_EVENING = "moderate_evening"    # +45
    DEFINITE_EVENING = "definite_evening"    # +90


CHRONOTYPE_OFFSET_MIN = {
    Chronotype.DEFINITE_MORNING: -90,
    Chronotype.MODERATE_MORNING: -45,
    Chronotype.INTERMEDIATE: 0,
    Chronotype.MODERATE_EVENING: 45,
    Chronotype.DEFINITE_EVENING: 90,
}


# ────────────────────────────────────────────────────────────────────
# 검증 예외
# ────────────────────────────────────────────────────────────────────
class SchemaError(ValueError):
    """스키마 검증 실패. 어떤 필드가 왜 틀렸는지 message 에 담는다."""


# ────────────────────────────────────────────────────────────────────
# 파싱 유틸 — 구글 폼의 지저분한 문자열을 표준 타입으로
# ────────────────────────────────────────────────────────────────────
_TIME_PATTERNS = [
    (re.compile(r"^\s*(\d{1,2}):(\d{2})\s*$"), "hm"),
    (re.compile(r"^\s*(\d{1,2})\s*시\s*(\d{1,2})?\s*분?\s*$"), "korean"),
    (re.compile(r"^\s*(오전|오후)\s*(\d{1,2})\s*시\s*(\d{1,2})?\s*분?\s*$"), "korean_ampm"),
    (re.compile(r"^\s*(\d{1,2})\.(\d{2})\s*$"), "hm"),
    (re.compile(r"^\s*(\d{3,4})\s*$"), "hhmm"),
]


def parse_clock(raw: Any) -> Optional[time]:
    """'25:30', '1시 40분', '오전 1시', '0130' 등을 datetime.time 으로.

    24시를 넘는 표기(예: 25:30 = 새벽 1:30)는 % 24 로 접는다.
    파싱 불가 시 None (호출측이 결측 처리).
    """
    if raw is None:
        return None
    if isinstance(raw, time):
        return raw
    if isinstance(raw, datetime):
        return raw.time()
    s = str(raw).strip()
    if not s or s.lower() in {"nan", "none", "-", "미기재", "무응답"}:
        return None

    for pat, kind in _TIME_PATTERNS:
        m = pat.match(s)
        if not m:
            continue
        if kind == "hm":
            h, mnt = int(m.group(1)), int(m.group(2))
        elif kind == "hhmm":
            digits = m.group(1).zfill(4)
            h, mnt = int(digits[:2]), int(digits[2:])
        elif kind == "korean":
            h = int(m.group(1))
            mnt = int(m.group(2)) if m.group(2) else 0
        elif kind == "korean_ampm":
            h = int(m.group(2)) % 12
            if m.group(1) == "오후":
                h += 12
            mnt = int(m.group(3)) if m.group(3) else 0
        else:  # pragma: no cover
            continue
        if not (0 <= mnt < 60):
            return None
        h = h % 24
        return time(hour=h, minute=mnt)
    return None


def parse_float(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)) and not (isinstance(raw, float) and math.isnan(raw)):
        return float(raw)
    s = str(raw).strip().replace(",", "")
    if not s or s.lower() in {"nan", "none", "-", "미기재", "무응답"}:
        return None
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


def parse_bool(raw: Any) -> Optional[bool]:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    s = str(raw).strip().lower()
    if s in {"예", "y", "yes", "true", "1", "o", "함", "했음"}:
        return True
    if s in {"아니오", "아니요", "n", "no", "false", "0", "x", "안함", "안했음"}:
        return False
    return None


def combine_night(onset: time, wake: time, base_date: date) -> tuple[datetime, datetime]:
    """취침·기상 시각을 절대 datetime 으로. 취침이 정오 이후면 base_date,
    정오 이전이면 다음날로 본다(자정을 넘겨 자는 청소년 패턴). 기상은
    취침보다 뒤가 되도록 필요 시 +1일."""
    onset_dt = datetime.combine(base_date, onset)
    if onset.hour < 12:
        onset_dt += timedelta(days=1)
    wake_dt = datetime.combine(onset_dt.date(), wake)
    if wake_dt <= onset_dt:
        wake_dt += timedelta(days=1)
    return onset_dt, wake_dt


# ────────────────────────────────────────────────────────────────────
# 레이어 1 — 원본 응답
# ────────────────────────────────────────────────────────────────────
@dataclass
class RawSurveyResponse:
    """구글 폼 1행. 모든 값은 폼에서 온 원문(주로 str)."""
    respondent_key: str                 # 익명 식별 키(이름 아님)
    timestamp: str                      # 폼 제출 시각 문자열
    survey_date: str                    # 응답 대상 날짜(전날)
    bed_time: str                       # 취침 시각
    wake_time: str                      # 기상 시각
    bluelight_min: str                  # 취침 전 2h 스마트폰 사용(분)
    screen_brightness_pct: str          # 화면 밝기(%)
    caffeine_items: str                 # 카페인 체크리스트 원문 "americano:1;energy_drink:2"
    caffeine_last_hour: str             # 마지막 카페인 섭취 시각
    led_lux: str                        # 실내 조명 조도(lux)   ← 신규
    led_color_temp: str                 # 실내 조명 색온도(K)   ← 신규
    exercised: str                      # 당일 30분 이상 운동 여부
    sleep_aid: str = ""                 # 수면유도제/멜라토닌 복용(선택)
    note: str = ""                      # 자유 기입

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ────────────────────────────────────────────────────────────────────
# 레이어 2 — 사전 설문
# ────────────────────────────────────────────────────────────────────
@dataclass
class SubjectProfile:
    subject_id: str
    chronotype: Chronotype
    meq_score: int                      # 16~86 (MEQ 원점수)
    grade: int                          # 1~3
    sex: Sex
    consent: bool = True

    def __post_init__(self) -> None:
        if not self.consent:
            raise SchemaError(f"{self.subject_id}: 동의서 미수령 레코드는 저장 금지 (실험계획서 §3-1)")
        if self.grade not in (1, 2, 3):
            raise SchemaError(f"{self.subject_id}: grade 는 1~3 이어야 함 (got {self.grade})")
        if not (16 <= self.meq_score <= 86):
            raise SchemaError(f"{self.subject_id}: MEQ 원점수 범위 16~86 벗어남 (got {self.meq_score})")

    @property
    def chronotype_offset_min(self) -> int:
        return CHRONOTYPE_OFFSET_MIN[self.chronotype]


# ────────────────────────────────────────────────────────────────────
# 레이어 3 — 정제된 1인-1일 표준 레코드
# ────────────────────────────────────────────────────────────────────
@dataclass
class DailyRecord:
    # ── 식별 ──
    record_id: str
    subject_id: str
    survey_date: date
    day_type: DayType

    # ── 수면 (오픈 API / 설문) ──
    sleep_onset: datetime               # ISO 8601
    sleep_wake: datetime                # ISO 8601
    sleep_duration_min: float           # 파생: (wake - onset) 분

    # ── 독립변수 원자료 ──
    bluelight_duration_min: float       # X1 원자료 (약학/생명공학 파트 연계)
    screen_brightness_ratio: float      # 0.0~1.0 (blAdj 보정용)
    caffeine_intake_mg: float           # X2 원자료: 18시 이후 총 카페인(mg)
    caffeine_last_intake_at: Optional[datetime]

    # ── 조명 환경 (신규) ──
    led_lux: float                      # 취침 전 실내 조도 [lux]
    led_color_temp_k: int               # 실내 조명 CCT [K]

    # ── 공변량 ──
    brain_peak_score: float             # 뇌과학 파트: 인지 최고점 시간대(0~24 h)
    exercised: bool
    sleep_aid: Optional[str] = None

    # ── 품질 플래그 ──
    imputed_fields: list[str] = field(default_factory=list)
    quality_flags: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._validate_ranges()

    def _validate_ranges(self) -> None:
        checks = {
            "bluelight_duration_min": self.bluelight_duration_min,
            "caffeine_intake_mg": self.caffeine_intake_mg,
            "led_lux": self.led_lux,
            "led_color_temp_k": self.led_color_temp_k,
        }
        for name, val in checks.items():
            lo, hi = HARD_RANGES.get(name, (-math.inf, math.inf))
            if val is None or not (lo <= val <= hi):
                # 하드 범위 이탈은 즉시 예외가 아니라 플래그 (Z-score 단계에서 최종 판정)
                self.quality_flags.append(f"out_of_hard_range:{name}={val}")
        if not (0.0 <= self.screen_brightness_ratio <= 1.0):
            raise SchemaError(
                f"{self.record_id}: screen_brightness_ratio 는 0~1 (got {self.screen_brightness_ratio})"
            )
        if self.sleep_wake <= self.sleep_onset:
            raise SchemaError(f"{self.record_id}: 기상 시각이 취침 시각보다 빠름")

    # 파생 편의 속성 -------------------------------------------------
    @property
    def sleep_onset_clock_min(self) -> float:
        """야간 연속 축의 취침 시각(분). 00:30 → 1470, 23:00 → 1380.
        자정 이전이면 그대로, 정오 이전이면 +1440 하여 '늦게 잘수록 큰 값'."""
        return _clock_min(self.sleep_onset)

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        d["survey_date"] = self.survey_date.isoformat()
        d["day_type"] = self.day_type.value
        d["sleep_onset"] = self.sleep_onset.isoformat()
        d["sleep_wake"] = self.sleep_wake.isoformat()
        d["caffeine_last_intake_at"] = (
            self.caffeine_last_intake_at.isoformat() if self.caffeine_last_intake_at else None
        )
        d["imputed_fields"] = ";".join(self.imputed_fields)
        d["quality_flags"] = ";".join(self.quality_flags)
        return d


def _clock_min(dt: datetime) -> float:
    """자정 기준 시각(분), 야간 표기: 12:00 이전이면 +1440 하여 연속 축으로."""
    m = dt.hour * 60 + dt.minute
    return float(m + 1440 if dt.hour < 12 else m)


# ────────────────────────────────────────────────────────────────────
# 레이어 4 — 분석용 최종 행 (파생 피처 결합)
# ────────────────────────────────────────────────────────────────────
@dataclass
class ChronoTwinRecord:
    record_id: str
    subject_id: str
    survey_date: date
    day_type: DayType

    # 종속변수
    phase_delay_min: float              # Y = 당일 취침시각 - 개인 기준 취침시각

    # 독립변수 (전처리 완료)
    bluelight_adj_min: float            # X1 = 노출분 × (0.4 + 0.8·밝기비)
    caffeine_residue_mg: float          # X2 = Σ C0·(1/2)^(t/5.5)
    sleep_debt_min: float               # X3 = 직전 5일 Σ max(0, 480 - 실제수면)

    # 조명 파생 (신규)
    led_melanopic_lux: float            # led_lux × mel-DER(CCT)
    led_evening_load: float             # 저녁 멜라토닌 억제 압력 지수 (log 스케일)

    # 공변량
    chronotype_offset_min: int
    exercised: bool
    sleep_aid_flag: bool

    # 메타
    is_outlier: bool = False
    outlier_reasons: list[str] = field(default_factory=list)

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        d["survey_date"] = self.survey_date.isoformat()
        d["day_type"] = self.day_type.value
        d["outlier_reasons"] = ";".join(self.outlier_reasons)
        return d


# ────────────────────────────────────────────────────────────────────
# 스키마 자기 문서화 — 보고서 "데이터 수집 스키마 구조" 표 자동 생성
# ────────────────────────────────────────────────────────────────────
SCHEMA_FIELD_DOC = [
    # (필드, 타입, 설명, 소스 파트)
    ("record_id",              "String (UUID)", "레코드 고유 식별자",                     "시스템 자동 생성"),
    ("subject_id",             "String (UUID)", "고유 피험자 식별자(익명)",               "시스템 자동 생성"),
    ("survey_date",            "Date",          "응답 대상 날짜",                         "설문"),
    ("day_type",               "Enum(work|free)", "등교일/휴일 구분 (MSFsc 계산용)",       "설문 · 달력"),
    ("sleep_onset",            "Timestamp",     "실제 취침 입면 시각 (ISO 8601)",         "오픈 API / 설문"),
    ("sleep_wake",             "Timestamp",     "실제 기상 시각 (ISO 8601)",              "오픈 API / 설문"),
    ("sleep_duration_min",     "Float (min)",   "실제 수면 시간(파생)",                   "파생"),
    ("caffeine_intake_mg",     "Float (mg)",    "18시 이후 카페인 총 섭취량",             "약학 파트 데이터"),
    ("caffeine_last_intake_at","Timestamp",     "마지막 카페인 섭취 시각",                "설문"),
    ("bluelight_duration_min", "Integer (min)", "취침 전 2h 스마트폰 노출 시간",          "생명공학 파트 데이터"),
    ("screen_brightness_ratio","Float (0~1)",   "화면 밝기 비율 (blAdj 보정)",            "설문(스크린타임)"),
    ("led_lux",                "Float (lux)",   "취침 전 실내 조도 (책상/눈높이)",        "정책 파트(HCL) · 신규"),
    ("led_color_temp_k",       "Integer (K)",   "실내 조명 상관색온도 CCT",               "생명공학 파트 · 신규"),
    ("brain_peak_score",       "Float (0~24)",  "뇌과학적 인지 기능 최고점 시간대",       "뇌과학 파트 데이터"),
    ("exercised",              "Boolean",       "당일 30분 이상 운동 여부",              "설문(보조 변수)"),
    ("sleep_aid",              "String",        "수면유도제/멜라토닌 복용 내역(선택)",    "약학 파트 데이터"),
]


def schema_markdown_table() -> str:
    header = "| 필드명 | 데이터 타입 | 설명 | 소스 파트 |\n|---|---|---|---|\n"
    rows = "\n".join(f"| `{f}` | {t} | {d} | {s} |" for f, t, d, s in SCHEMA_FIELD_DOC)
    return header + rows


def new_id() -> str:
    return str(uuid.uuid4())
