"""
Chrono-Twin API 스키마 (Pydantic v2)
====================================

파이프라인(pipeline/schema.py)의 dataclass 스키마를 API 경계용 Pydantic 모델로
반영. 원본 6필드(활동보고서 2-1)에 조명 환경 2필드를 추가한 v0.2.

    v0.1 필드 : user_id, sleep_onset, sleep_wake, caffeine_intake,
                bluelight_duration, brain_peak_score
    v0.2 추가 : led_lux, led_color_temp   ← 정책 파트 HCL · 생명공학 파트 6200K/3000K

FastAPI 스키마 문서(/api/v1/openapi.json)로 자동 노출된다.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

SCHEMA_VERSION = "0.2.0"

RECOMMENDED_SLEEP_MIN = 480
CAFFEINE_HALF_LIFE_H = 5.5


class DayType(str, Enum):
    work = "work"
    free = "free"


class Sex(str, Enum):
    M = "M"
    F = "F"
    X = "X"


class Chronotype(str, Enum):
    definite_morning = "definite_morning"
    moderate_morning = "moderate_morning"
    intermediate = "intermediate"
    moderate_evening = "moderate_evening"
    definite_evening = "definite_evening"


_CHRONO_OFFSET = {
    Chronotype.definite_morning: -90,
    Chronotype.moderate_morning: -45,
    Chronotype.intermediate: 0,
    Chronotype.moderate_evening: 45,
    Chronotype.definite_evening: 90,
}


class LightingEnvironment(BaseModel):
    """취침 전 실내 조명 환경 (신규). 스마트폰 블루라이트와 별개로 방 전체 광 환경."""

    led_lux: float = Field(
        ..., ge=0, le=2000,
        description="취침 전 책상/눈높이 조도 [lux]. 조도계 앱 또는 스마트폰 라이트센서.",
        examples=[45, 150, 320],
    )
    led_color_temp: int = Field(
        ..., ge=1500, le=10000,
        description="실내 주 조명의 상관색온도 CCT [K]. 전구색 2700 · 주백색 4000 · 주광색 6500.",
        examples=[2700, 4000, 6500],
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def mel_der(self) -> float:
        """CCT 1차 근사 melanopic Daylight Efficacy Ratio (0.30~1.05)."""
        raw = 0.45 + (self.led_color_temp - 2700) * (0.90 - 0.45) / (6500 - 2700)
        return round(min(1.05, max(0.30, raw)), 4)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def melanopic_lux(self) -> float:
        return round(self.led_lux * self.mel_der, 2)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def evening_load(self) -> float:
        """저녁 멜라토닌 억제 압력 지수(로그 스케일). 청소년 가중 ×1.15."""
        import math
        return round(math.log10(1 + self.melanopic_lux / 100.0) * 1.15, 4)


class SubjectProfileIn(BaseModel):
    subject_id: str = Field(..., description="익명 UUID")
    chronotype: Chronotype
    meq_score: int = Field(..., ge=16, le=86, description="MEQ 원점수")
    grade: int = Field(..., ge=1, le=3)
    sex: Sex
    consent: bool = Field(..., description="참여 동의서 수령 여부 (false 면 거부)")

    @model_validator(mode="after")
    def _require_consent(self):
        if not self.consent:
            raise ValueError("동의서 미수령 레코드는 저장 금지 (실험계획서 §3-1)")
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def chronotype_offset_min(self) -> int:
        return _CHRONO_OFFSET[self.chronotype]


class DailyRecordIn(BaseModel):
    """구글 폼/웨어러블에서 수집된 1인-1일 레코드 (수집 스키마 = 데이터 인지션 입력)."""

    subject_id: str
    survey_date: date
    day_type: DayType

    sleep_onset: datetime = Field(..., description="실제 취침 입면 시각 (ISO 8601)")
    sleep_wake: datetime = Field(..., description="실제 기상 시각 (ISO 8601)")

    caffeine_intake: float = Field(0, ge=0, le=1000, description="18시 이후 카페인 총 섭취량 [mg]")
    caffeine_last_intake_at: Optional[datetime] = None
    bluelight_duration: int = Field(0, ge=0, le=480, description="취침 전 2h 스마트폰 노출 [min]")
    screen_brightness_ratio: float = Field(0.6, ge=0, le=1)

    lighting: LightingEnvironment

    brain_peak_score: float = Field(9.0, ge=0, le=24, description="인지 기능 최고점 시간대 [h]")
    exercised: bool = False
    sleep_aid: Optional[str] = Field(None, description="수면유도제/멜라토닌 복용 내역")

    @field_validator("sleep_wake")
    @classmethod
    def _wake_after_onset(cls, v: datetime, info):
        onset = info.data.get("sleep_onset")
        if onset and v <= onset:
            raise ValueError("기상 시각이 취침 시각보다 빠름")
        return v

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sleep_duration_min(self) -> float:
        return round((self.sleep_wake - self.sleep_onset).total_seconds() / 60.0, 1)


class ChronoTwinRecord(BaseModel):
    """분석용 최종 행 — 파생 피처 결합 후 (다중선형회귀 입력)."""

    record_id: str
    subject_id: str
    survey_date: date
    day_type: DayType

    phase_delay_min: float = Field(..., description="Y: 당일 취침시각 − 개인 기준 취침시각")

    bluelight_adj_min: float = Field(..., description="X₁ = 노출분 × (0.4 + 0.8·밝기비)")
    caffeine_residue_mg: float = Field(..., description="X₂ = Σ C₀·(1/2)^(t/5.5)")
    sleep_debt_min: Optional[float] = Field(None, description="X₃ = 직전 5일 Σ max(0, 480 − 실제수면)")

    led_melanopic_lux: float
    led_evening_load: float

    chronotype_offset_min: int
    exercised: bool
    sleep_aid_flag: bool = False

    is_outlier: bool = False
    outlier_reasons: list[str] = Field(default_factory=list)


class SchemaFieldDoc(BaseModel):
    field: str
    type: str
    description: str
    source: str
    since: str = "0.1.0"


SCHEMA_DOC: list[SchemaFieldDoc] = [
    SchemaFieldDoc(field="subject_id", type="string(uuid)", description="고유 피험자 식별자(익명)", source="시스템"),
    SchemaFieldDoc(field="survey_date", type="date", description="응답 대상 날짜", source="설문"),
    SchemaFieldDoc(field="day_type", type="enum(work|free)", description="등교일/휴일 (MSFsc용)", source="설문·달력"),
    SchemaFieldDoc(field="sleep_onset", type="timestamp", description="실제 취침 입면 시각", source="오픈 API/설문"),
    SchemaFieldDoc(field="sleep_wake", type="timestamp", description="실제 기상 시각", source="오픈 API/설문"),
    SchemaFieldDoc(field="caffeine_intake", type="float(mg)", description="18시 이후 카페인 총량", source="약학 파트"),
    SchemaFieldDoc(field="bluelight_duration", type="int(min)", description="취침 전 2h 스마트폰 노출", source="생명공학 파트"),
    SchemaFieldDoc(field="led_lux", type="float(lux)", description="취침 전 실내 조도", source="정책 파트(HCL)", since="0.2.0"),
    SchemaFieldDoc(field="led_color_temp", type="int(K)", description="실내 조명 색온도 CCT", source="생명공학 파트", since="0.2.0"),
    SchemaFieldDoc(field="brain_peak_score", type="float(0~24)", description="인지 기능 최고점 시간대", source="뇌과학 파트"),
    SchemaFieldDoc(field="exercised", type="bool", description="당일 30분 이상 운동", source="설문(보조)"),
]
