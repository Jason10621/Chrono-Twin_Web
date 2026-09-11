"""
더미 데이터 생성기 — "데이터 없이 파이프라인 미리 돌려보고 오류 잡기"
====================================================================

구글 폼 응답을 흉내낸 RawSurveyResponse 를 생성한다. 두 가지 목적:

  1. 파이프라인 전 구간(ETL → Z-score → MSFsc → 회귀)을 실제 데이터 없이 검증
  2. '알려진 정답(ground truth)' β 계수로 데이터를 생성 → 회귀가 그 값을
     근사 복원하는지 확인 (파이프라인 정확성 회귀 테스트)

의도적으로 심는 노이즈
  · 결측 셀 (blank)                    → ETL 결측 처리 경로 검증
  · 깨진 시각 표기 ("25:70", "몰라")    → parse_clock 견고성 검증
  · 생리학적 불가능값 (수면 0분 등)      → 하드범위 + Z-score 검증
  · 통계적 이상치 (카페인 1 500 mg)     → Z-score 검증
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Optional

import numpy as np

from .schema import (
    CAFFEINE_TABLE_MG,
    CHRONOTYPE_OFFSET_MIN,
    Chronotype,
    RawSurveyResponse,
    Sex,
    SubjectProfile,
)

# ── 생성 모형의 '정답' 계수 (회귀가 복원해야 하는 목표) ──────────────
#
# 종속변수 Y(phase_delay) 는 '개인 기준 취침시각으로부터의 당일 편차' 이므로
# 정의상 피험자 내(within-subject) 로 중심화된 값이다. 따라서 daily 모형의
# 드라이버는 '그날 그날 달라지는' 시변(time-varying) 변수여야 한다:
#   · blAdj, 카페인 잔류, 수면 부채, LED 저녁부하 → 시변 → Y 를 움직임
#   · 크로노타입/성별/학년 → 시불변 → 개인 baseline 에 흡수 (Y 엔 영향 X)
# 크로노타입은 '기준 취침시각(baseline)' 자체를 당기고/미는 방식으로만 반영.
GROUND_TRUTH = {
    "beta_bluelight_adj": 0.18,      # 활동보고서 β₁  (blAdj 1분 → 위상지연 0.18분)
    "beta_caffeine_residue": 0.22,   # 활동보고서 β₂  (잔류 1mg → 0.22분)
    "beta_sleep_debt": 0.045,        # 활동보고서 β₃  (부채 1분 → 0.045분)
    "gamma_led_load": 14.0,          # 신규: LED evening_load(0~1.5) → 분
    "gamma_exercise": -6.0,          # 운동한 날 위상 소폭 전진
    "intercept": 0.0,                # within-중심화라 절편은 0 근방
    "noise_sd": 9.0,                 # ε 표준편차 (분)
    # baseline(개인 기준선) 에만 쓰이는 계수 — daily Y 회귀로는 복원 불가
    "baseline_chronotype_gain": 1.0,   # 크로노타입 오프셋(분) → 기준 취침시각(분)
}

MEQ_BY_CHRONO = {
    Chronotype.DEFINITE_MORNING: 72,
    Chronotype.MODERATE_MORNING: 62,
    Chronotype.INTERMEDIATE: 52,
    Chronotype.MODERATE_EVENING: 40,
    Chronotype.DEFINITE_EVENING: 30,
}


@dataclass
class SyntheticDataset:
    profiles: list[SubjectProfile]
    responses: list[RawSurveyResponse]
    ground_truth: dict
    start_date: date
    n_days: int
    injected_defects: dict[str, int]
    truth_rows: list[dict]        # (subject, date) 별 정답 Y·X (회귀 복원 검증용)


def _pick_chronotype(rng: random.Random) -> Chronotype:
    # 청소년은 저녁형 쪽으로 치우침
    return rng.choices(
        list(Chronotype),
        weights=[0.08, 0.17, 0.30, 0.30, 0.15],
    )[0]


def _weekday_type(d: date) -> str:
    return "free" if d.weekday() >= 5 else "work"


def _fmt_clock(t: time) -> str:
    return f"{t.hour:02d}:{t.minute:02d}"


def _clock_from_minutes(m: float) -> time:
    m = int(round(m)) % 1440
    return time(m // 60, m % 60)


def generate(
    n_subjects: int = 40,
    n_days: int = 14,
    start_date: date = date(2026, 3, 2),   # 월요일
    seed: int = 20260904,
    defect_rate: float = 0.06,
) -> SyntheticDataset:
    rng = random.Random(seed)
    npr = np.random.default_rng(seed)
    gt = GROUND_TRUTH

    profiles: list[SubjectProfile] = []
    responses: list[RawSurveyResponse] = []
    truth_rows: list[dict] = []
    defects = {"missing_cell": 0, "broken_clock": 0, "impossible_value": 0, "stat_outlier": 0}

    for s in range(n_subjects):
        sid = f"S{s+1:03d}"
        chrono = _pick_chronotype(rng)
        offset = CHRONOTYPE_OFFSET_MIN[chrono] + rng.gauss(0, 12)
        profiles.append(SubjectProfile(
            subject_id=sid,
            chronotype=chrono,
            meq_score=int(np.clip(MEQ_BY_CHRONO[chrono] + rng.gauss(0, 4), 16, 86)),
            grade=rng.choice([1, 2, 3]),
            sex=rng.choice([Sex.MALE, Sex.FEMALE]),
            consent=True,
        ))

        # 개인 기준선: 크로노타입만 반영 (시불변). 자정 ± 크로노타입.
        base_bed_min = 24 * 60 + 5 + gt["baseline_chronotype_gain"] * offset
        # LED: 피험자 성향(따뜻/차가움)은 약하게만, 대부분은 그날그날 달라짐
        led_cct_bias = rng.gauss(0, 500)
        led_lux_bias = rng.gauss(0, 25)

        recent_durations: list[float] = []            # 수면 부채용

        for day in range(n_days):
            d = start_date + timedelta(days=day)
            dtype = _weekday_type(d)

            # ── 독립변수 원자료 생성 (전부 '그날' 값) ──
            bl_min = float(np.clip(npr.gamma(2.2, 26) + (18 if dtype == "work" else 34), 0, 175))
            brightness = float(np.clip(npr.normal(0.62, 0.18), 0.05, 1.0))
            bl_adj = bl_min * (0.4 + 0.8 * brightness)

            # 카페인: 18시 이후 섭취 확률 (등교일에 더 높음)
            caf_items: dict[str, int] = {}
            p_caf = 0.42 if dtype == "work" else 0.22
            if rng.random() < p_caf:
                choice = rng.choices(
                    ["americano", "can_coffee", "energy_drink", "cola", "tea"],
                    weights=[0.30, 0.15, 0.28, 0.17, 0.10],
                )[0]
                caf_items[choice] = rng.choice([1, 1, 2])
            caf_hour = rng.choice([19, 20, 20, 21, 22])
            caf_last_at = datetime.combine(d, time(caf_hour, rng.choice([0, 15, 30])))
            caf_mg_total = sum(CAFFEINE_TABLE_MG[k] * v for k, v in caf_items.items())

            # LED 조명 — 방/스탠드/취침등을 매일 다르게 씀 → 주로 피험자 내 변동
            night_bright_room = rng.random() < 0.30     # 그날 밝은 방에서 늦게까지 공부
            led_cct = int(np.clip(
                rng.gauss(3800 + led_cct_bias, 550) + (1400 if night_bright_room else 0),
                2200, 6800))
            led_lux = float(np.clip(
                rng.gauss(130 + led_lux_bias, 45) + (140 if night_bright_room else 0),
                15, 480))
            mder = 0.45 + (led_cct - 2700) * (0.90 - 0.45) / (6500 - 2700)
            mder = min(1.05, max(0.30, mder))
            led_load = np.log10(1 + (led_lux * mder) / 100.0) * 1.15

            exercised = rng.random() < (0.25 if dtype == "work" else 0.4)

            # 카페인 잔류(취침 시점) 근사: '기준' 취침시각(base_bed_min) 기준으로 역산.
            # 실제 취침시각(base + phase_delay)을 쓰면 residue→phase_delay→residue 순환이
            # 되므로 여기선 baseline 으로 근사. → 파이프라인 값과 ~3mg(4%) 차이는 정상이며,
            # 파이프라인 쪽(실제 취침시각 사용)이 오히려 더 정확하다.
            approx_bed_dt = datetime.combine(d, time(0, 0)) + timedelta(minutes=base_bed_min)
            t_elapsed_h = max(0.0, (approx_bed_dt - caf_last_at).total_seconds() / 3600.0)
            caf_residue = caf_mg_total * (0.5 ** (t_elapsed_h / 5.5))

            debt = sum(max(0.0, 480 - x) for x in recent_durations[-5:]) if len(recent_durations) >= 5 else 0.0

            # ── 위상 지연 Y = 개인 baseline 대비 '그날의' 편차 (크로노타입 항 없음) ──
            phase_delay = (
                gt["intercept"]
                + gt["beta_bluelight_adj"] * bl_adj
                + gt["beta_caffeine_residue"] * caf_residue
                + gt["beta_sleep_debt"] * debt
                + gt["gamma_led_load"] * led_load
                + gt["gamma_exercise"] * (1 if exercised else 0)
                + rng.gauss(0, gt["noise_sd"])
            )
            bed_min = base_bed_min + phase_delay
            bed_t = _clock_from_minutes(bed_min)

            # 기상: 등교일 06:40~07:20, 휴일 08:30~10:30
            if dtype == "work":
                wake_min = 7 * 60 + rng.randint(-20, 20)
            else:
                wake_min = 9 * 60 + rng.randint(-40, 80)
            # 실제 수면 시간
            dur = (wake_min + 1440) - (bed_min % 1440) if (bed_min % 1440) > 12 * 60 else wake_min - (bed_min % 1440)
            dur = float(np.clip(dur, 150, 720))
            recent_durations.append(dur)
            wake_t = _clock_from_minutes(wake_min)

            brain_peak = float(np.clip(9 + (offset / 60.0) * 3 + rng.gauss(0, 1.0), 6, 23))

            truth_rows.append({
                "subject_id": sid,
                "survey_date": d.isoformat(),
                "day_type": dtype,
                "phase_delay_true": round(phase_delay, 3),
                "bl_adj_true": round(bl_adj, 3),
                "caf_residue_true": round(caf_residue, 3),
                "sleep_debt_true": round(debt, 3),
                "led_load_true": round(float(led_load), 4),
                "exercised_true": bool(exercised),
            })

            # ── 원본 문자열로 직렬화 (구글 폼 흉내) ──
            def s_or_blank(val: str, p_missing: float = defect_rate) -> str:
                nonlocal defects
                if rng.random() < p_missing:
                    defects["missing_cell"] += 1
                    return ""
                return val

            bl_field = s_or_blank(str(int(bl_min)))
            bright_field = s_or_blank(f"{int(brightness*100)}")
            lux_field = s_or_blank(f"{led_lux:.0f}")
            cct_field = s_or_blank(str(led_cct))

            bed_field = _fmt_clock(bed_t)
            if rng.random() < defect_rate * 0.5:
                defects["broken_clock"] += 1
                bed_field = rng.choice(["25:70", "몰라요", "아침 7시쯤", "-", "1시 반"])

            # 의도적 불가능/이상치 주입
            if rng.random() < defect_rate * 0.4:
                pick = rng.random()
                if pick < 0.4:
                    defects["impossible_value"] += 1
                    wake_t = bed_t  # 수면 0분
                elif pick < 0.7:
                    defects["stat_outlier"] += 1
                    caf_items = {"energy_drink": 18}  # ~1440 mg
                else:
                    defects["impossible_value"] += 1
                    bl_field = "600"

            caf_str = ";".join(f"{k}:{v}" for k, v in caf_items.items())

            responses.append(RawSurveyResponse(
                respondent_key=sid,
                timestamp=(datetime.combine(d, time(9, 30)) + timedelta(days=1)).isoformat(),
                survey_date=d.isoformat(),
                bed_time=bed_field,
                wake_time=_fmt_clock(wake_t),
                bluelight_min=bl_field,
                screen_brightness_pct=bright_field,
                caffeine_items=caf_str,
                caffeine_last_hour=_fmt_clock(caf_last_at.time()) if caf_str else "",
                led_lux=lux_field,
                led_color_temp=cct_field,
                exercised=rng.choice(["예", "아니오"]) if exercised else "아니오",
                sleep_aid=rng.choice(["", "", "", "멜라토닌 3mg", "테아닌"]),
                note="",
            ))

    return SyntheticDataset(
        profiles=profiles,
        responses=responses,
        ground_truth=gt,
        start_date=start_date,
        n_days=n_days,
        injected_defects=defects,
        truth_rows=truth_rows,
    )


def truth_to_dataframe(ds: SyntheticDataset):
    import pandas as pd
    return pd.DataFrame(ds.truth_rows)


def responses_to_dataframe(ds: SyntheticDataset):
    import pandas as pd
    return pd.DataFrame([r.to_dict() for r in ds.responses])


def profiles_to_dataframe(ds: SyntheticDataset):
    import pandas as pd
    return pd.DataFrame([
        {
            "subject_id": p.subject_id,
            "chronotype": p.chronotype.value,
            "meq_score": p.meq_score,
            "chronotype_offset_min": p.chronotype_offset_min,
            "grade": p.grade,
            "sex": p.sex.value,
        }
        for p in ds.profiles
    ])
