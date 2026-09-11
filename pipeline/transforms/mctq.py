"""
MCTQ (뮌헨 수면 위상 설문지) 알고리즘 — 이정욱 파트 핵심 구현
============================================================

구현 공식 (실험계획서 §2-4)
    MSF    = 수면 개시 시각(휴일) + 수면 지속 시간(휴일) / 2
    MSFsc  = MSF − (SD_f − SD_w) / 2            ...(A) 실험계획서 표기
    MSFsc  = MSF − (SD_f − SD_week) / 2          ...(B) Roenneberg 정본

  · SD_w    = 등교일(주중) 평균 수면 시간
  · SD_f    = 휴일(주말) 평균 수면 시간
  · SD_week = 주간 전체 평균 = (SD_w·n_w + SD_f·n_f) / (n_w + n_f)
  · 보정은 SD_f > SD_w 일 때만 (휴일에 더 잔 = 수면 부채 상환) 적용

두 변형을 모두 제공하되 기본값은 (A) — 팀 보고서/모듈과 표기를 일치시키기 위함.
MSFsc 가 클수록(늦을수록) 수면 위상이 더 뒤로 밀린 것.

수면 부채(X3)  (실험계획서 §3-2)
    일별 부족량 = max(0, 480 − 당일 실제 수면 분)
    X3(D)       = Σ_{k=1..5}  일별 부족량(D-k)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from statistics import mean
from typing import Iterable, Literal, Optional, Sequence

MSFScVariant = Literal["exp_plan", "roenneberg"]


@dataclass(frozen=True)
class SleepNight:
    """MSFsc 계산 입력용 최소 표현."""
    night_of: date
    onset_clock_min: float   # 야간 연속 축(분): 00:30 → 1470
    duration_min: float
    day_type: Literal["work", "free"]


@dataclass
class MSFscResult:
    subject_id: str
    n_work: int
    n_free: int
    sd_w_min: float
    sd_f_min: float
    sd_week_min: float
    msf_min: float           # 자정 기준 분 (예: 1650 = 03:30)
    msfsc_min: float
    correction_applied: bool
    variant: MSFScVariant
    warnings: tuple[str, ...] = ()

    @property
    def msfsc_clock(self) -> str:
        return _min_to_clock(self.msfsc_min)

    @property
    def msf_clock(self) -> str:
        return _min_to_clock(self.msf_min)


def _min_to_clock(m: float) -> str:
    m = m % 1440
    return f"{int(m // 60):02d}:{int(round(m % 60)):02d}"


def daily_sleep_deficit(actual_sleep_min: float, recommended_min: float = 480.0) -> float:
    """일별 수면 부족량 = max(0, 권장 − 실제)."""
    if actual_sleep_min is None:
        raise ValueError("actual_sleep_min 이 None")
    return max(0.0, recommended_min - float(actual_sleep_min))


def rolling_sleep_debt(
    ordered_durations: Sequence[float],
    window: int = 5,
    recommended_min: float = 480.0,
    valid: Optional[Sequence[bool]] = None,
    max_invalid_in_window: int = 1,
) -> list[Optional[float]]:
    """날짜 오름차순 수면시간(분) 시퀀스 → 각 날짜의 직전 `window`일 누적 부채.

    앞쪽 `window`일은 창이 안 차므로 None. 실험계획서: "D5부터 계산 가능".

    valid : 각 날짜의 수면 시간이 '측정값'인지(True) '대체값'인지(False).
            창 안에 대체값이 `max_invalid_in_window` 개를 초과하면 그 날의
            부채는 신뢰할 수 없으므로 None 으로 둔다 (imputed 밤이 5일치
            부채를 오염시켜 β₃ 를 축소시키는 문제를 차단).
    """
    deficits = [daily_sleep_deficit(d, recommended_min) for d in ordered_durations]
    if valid is None:
        valid = [True] * len(deficits)
    valid = list(valid)
    out: list[Optional[float]] = []
    for i in range(len(deficits)):
        if i < window:
            out.append(None)
            continue
        w_valid = valid[i - window:i]
        if w_valid.count(False) > max_invalid_in_window:
            out.append(None)
        else:
            out.append(float(sum(deficits[i - window:i])))
    return out


def compute_msfsc(
    subject_id: str,
    nights: Iterable[SleepNight],
    variant: MSFScVariant = "exp_plan",
) -> MSFscResult:
    """피험자 1명의 2주치 야간 데이터 → MSF / MSFsc.

    휴일 데이터가 없으면 계산 불가 → ValueError.
    휴일이 1박뿐이면 경고를 달되 계산은 진행(고교 관찰연구 현실 반영).
    """
    nights = list(nights)
    work = [n for n in nights if n.day_type == "work"]
    free = [n for n in nights if n.day_type == "free"]
    warnings: list[str] = []

    if not free:
        raise ValueError(f"{subject_id}: 휴일(free) 야간 데이터가 없어 MSFsc 계산 불가")
    if not work:
        raise ValueError(f"{subject_id}: 등교일(work) 야간 데이터가 없어 SD_w 계산 불가")
    if len(free) < 2:
        warnings.append("휴일 표본 1박 — MSFsc 신뢰도 낮음")
    if len(work) < 3:
        warnings.append("등교일 표본 3박 미만 — SD_w 불안정")

    sd_w = mean(n.duration_min for n in work)
    sd_f = mean(n.duration_min for n in free)
    n_w, n_f = len(work), len(free)
    sd_week = (sd_w * n_w + sd_f * n_f) / (n_w + n_f)

    # MSF: 휴일 취침시각 평균 + 휴일 수면시간 평균 / 2
    mean_free_onset = mean(n.onset_clock_min for n in free)
    msf = mean_free_onset + sd_f / 2.0

    # 보정항: 휴일에 더 잔 경우에만
    if sd_f > sd_w:
        anchor = sd_w if variant == "exp_plan" else sd_week
        msfsc = msf - (sd_f - anchor) / 2.0
        corrected = True
    else:
        msfsc = msf
        corrected = False
        warnings.append("SD_f ≤ SD_w — 수면부채 보정 미적용 (MSFsc = MSF)")

    return MSFscResult(
        subject_id=subject_id,
        n_work=n_w,
        n_free=n_f,
        sd_w_min=round(sd_w, 1),
        sd_f_min=round(sd_f, 1),
        sd_week_min=round(sd_week, 1),
        msf_min=round(msf, 1),
        msfsc_min=round(msfsc, 1),
        correction_applied=corrected,
        variant=variant,
        warnings=tuple(warnings),
    )


def personal_reference_bedtime_min(onset_clock_mins: Sequence[float]) -> float:
    """개인 기준 취침 시각 = 2주 평균 취침 시각(분). 종속변수 Y 계산의 기준선
    (실험계획서 §3-2: "개인 기준 취침 시각(2주 평균값)")."""
    vals = [v for v in onset_clock_mins if v is not None]
    if not vals:
        raise ValueError("취침 시각 표본이 비어 개인 기준선 계산 불가")
    return float(mean(vals))
