"""
ETL 프로세스 — 로우 데이터 정제  (실험계획서 §3)
================================================

  E (Extract)   : 구글 폼 응답(문자열 표) 로드
  T (Transform) : 타입 파싱 → 결측 처리 → 파생 피처 계산 → 조인
  L (Load)      : 분석용 테이블(ChronoTwinRecord) 로 적재

결측치 처리 (실험계획서 §3-1)
  · 수치형: 같은 피험자의 같은 요일유형(work/free) 중앙값으로 1차 대체,
           그래도 없으면 전체 중앙값. (KNN Imputation 은 "여유 있으면" 항목이라
           옵션으로 열어둠 — impute_method="knn")
  · 시각형: 파싱 불가/결측이면 그 레코드의 수면 관련 파생은 계산하되
           quality_flags 에 남기고, onset/wake 둘 다 없으면 레코드 격리(quarantine).

모든 단계는 ETLReport 에 로그를 축적 → run_pipeline 이 출력.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from .schema import (
    CAFFEINE_TABLE_MG,
    DayType,
    DailyRecord,
    RawSurveyResponse,
    SchemaError,
    SubjectProfile,
    combine_night,
    new_id,
    parse_bool,
    parse_clock,
    parse_float,
)
from .transforms import mctq, pharmacokinetics as pk, photobiology as photo


@dataclass
class ETLReport:
    n_raw: int = 0
    n_parsed: int = 0
    n_quarantined: int = 0
    parse_errors: dict[str, int] = field(default_factory=dict)
    imputed: dict[str, int] = field(default_factory=dict)
    quarantine_rows: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)

    def log(self, msg: str) -> None:
        self.steps.append(msg)

    def bump(self, bucket: dict[str, int], key: str, n: int = 1) -> None:
        bucket[key] = bucket.get(key, 0) + n

    def summary_lines(self) -> list[str]:
        out = ["[ETL 리포트]"]
        out.append(f"  원본 {self.n_raw}행 → 파싱 성공 {self.n_parsed}행 · 격리 {self.n_quarantined}행")
        if self.parse_errors:
            out.append("  파싱 오류(필드별): " + ", ".join(f"{k}={v}" for k, v in self.parse_errors.items()))
        if self.imputed:
            out.append("  결측 대체(필드별): " + ", ".join(f"{k}={v}" for k, v in self.imputed.items()))
        for w in self.warnings:
            out.append(f"  ⚠ {w}")
        return out


# ────────────────────────────────────────────────────────────────────
# E — Extract
# ────────────────────────────────────────────────────────────────────
def extract(responses: list[RawSurveyResponse]) -> pd.DataFrame:
    """RawSurveyResponse 리스트 → DataFrame (전부 object/str 유지)."""
    df = pd.DataFrame([r.to_dict() for r in responses])
    return df


def extract_csv(path: str) -> pd.DataFrame:
    """구글 폼 CSV export 로드. 컬럼명은 한글일 수 있으므로 매핑 테이블 사용."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    return df.rename(columns=_KOREAN_HEADER_MAP)


_KOREAN_HEADER_MAP = {
    "타임스탬프": "timestamp",
    "응답 대상 날짜": "survey_date",
    "취침 시각": "bed_time",
    "기상 시각": "wake_time",
    "취침 전 2시간 스마트폰 사용(분)": "bluelight_min",
    "화면 밝기(%)": "screen_brightness_pct",
    "카페인 섭취(체크)": "caffeine_items",
    "마지막 카페인 섭취 시각": "caffeine_last_hour",
    "실내 조명 조도(lux)": "led_lux",
    "실내 조명 색온도(K)": "led_color_temp",
    "당일 30분 이상 운동": "exercised",
    "수면유도제/멜라토닌": "sleep_aid",
}


# ────────────────────────────────────────────────────────────────────
# T — Transform: 파싱
# ────────────────────────────────────────────────────────────────────
def _parse_caffeine_items(raw: str) -> dict[str, int]:
    """'americano:1;energy_drink:2' → {'americano':1,'energy_drink':2}."""
    out: dict[str, int] = {}
    if not raw:
        return out
    for chunk in str(raw).replace(",", ";").split(";"):
        chunk = chunk.strip()
        if not chunk or ":" not in chunk:
            continue
        k, v = chunk.split(":", 1)
        k = k.strip()
        try:
            n = int(float(v.strip()))
        except ValueError:
            continue
        if k in CAFFEINE_TABLE_MG and n > 0:
            out[k] = out.get(k, 0) + n
    return out


def parse_rows(df: pd.DataFrame, report: ETLReport) -> pd.DataFrame:
    """문자열 표 → 타입 파싱된 중간 표. 파싱 불가 셀은 NaN/None 으로."""
    report.n_raw = len(df)
    rec = []
    for _, row in df.iterrows():
        sd = _parse_date(row.get("survey_date"))
        onset_t = parse_clock(row.get("bed_time"))
        wake_t = parse_clock(row.get("wake_time"))
        bl = parse_float(row.get("bluelight_min"))
        br = parse_float(row.get("screen_brightness_pct"))
        lux = parse_float(row.get("led_lux"))
        cct = parse_float(row.get("led_color_temp"))
        exercised = parse_bool(row.get("exercised"))
        caf_items = _parse_caffeine_items(row.get("caffeine_items", ""))
        caf_hour = parse_clock(row.get("caffeine_last_hour"))

        for fld, val in [("bed_time", onset_t), ("wake_time", wake_t),
                         ("survey_date", sd)]:
            if val is None and str(row.get(fld, "")).strip():
                report.bump(report.parse_errors, fld)

        rec.append({
            "respondent_key": row.get("respondent_key") or row.get("subject_id"),
            "survey_date": sd,
            "onset_t": onset_t,
            "wake_t": wake_t,
            "bluelight_duration_min": bl,
            "screen_brightness_pct": br,
            "led_lux": lux,
            "led_color_temp_k": cct,
            "exercised": exercised,
            "caffeine_items": caf_items,
            "caffeine_last_hour": caf_hour,
            "sleep_aid": (row.get("sleep_aid") or "").strip() or None,
        })
    return pd.DataFrame(rec)


def _parse_date(raw) -> Optional[date]:
    if raw is None:
        return None
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    try:
        return pd.to_datetime(s).date()
    except Exception:
        return None


# ────────────────────────────────────────────────────────────────────
# T — Transform: 결측 처리
# ────────────────────────────────────────────────────────────────────
NUMERIC_IMPUTE_COLS = [
    "bluelight_duration_min",
    "screen_brightness_pct",
    "led_lux",
    "led_color_temp_k",
]


def impute_missing(
    df: pd.DataFrame,
    profiles: dict[str, SubjectProfile],
    report: ETLReport,
    method: str = "group_median",   # "group_median" | "knn"
) -> pd.DataFrame:
    df = df.copy()
    df["day_type"] = df["survey_date"].apply(
        lambda d: DayType.FREE.value if (d and d.weekday() >= 5) else DayType.WORK.value
    )

    df["_imputed"] = [[] for _ in range(len(df))]

    if method == "knn":
        df = _impute_knn(df, report)
    else:
        for col in NUMERIC_IMPUTE_COLS:
            if col not in df.columns:
                continue
            miss = df[col].isna()
            if not miss.any():
                continue
            grp = df.groupby(["respondent_key", "day_type"])[col].transform("median")
            df.loc[miss, col] = grp[miss]
            still = df[col].isna()
            if still.any():
                df.loc[still, col] = df[col].median()
            for i in df.index[miss]:
                df.at[i, "_imputed"].append(col)
            report.bump(report.imputed, col, int(miss.sum()))

    # 밝기(%) → 0~1 비율
    df["screen_brightness_ratio"] = (df["screen_brightness_pct"].fillna(60) / 100.0).clip(0, 1)
    return df


def _impute_knn(df: pd.DataFrame, report: ETLReport) -> pd.DataFrame:
    try:
        from sklearn.impute import KNNImputer
    except Exception:
        report.warnings.append("sklearn 미설치 — KNN 대신 group_median 사용")
        return impute_missing(df, {}, report, method="group_median")
    cols = [c for c in NUMERIC_IMPUTE_COLS if c in df.columns]
    na_mask = df[cols].isna()
    before = na_mask.sum().to_dict()
    imp = KNNImputer(n_neighbors=5, weights="distance")
    df[cols] = imp.fit_transform(df[cols])
    for c in cols:
        for i in df.index[na_mask[c]]:
            df.at[i, "_imputed"].append(f"{c}(knn)")
        if before.get(c):
            report.bump(report.imputed, f"{c}(knn)", int(before[c]))
    return df


# ────────────────────────────────────────────────────────────────────
# T/L — 파생 피처 + ChronoTwinRecord 적재
# ────────────────────────────────────────────────────────────────────
@dataclass
class LoadResult:
    daily: pd.DataFrame          # DailyRecord 수준 (정제 원자료 + 파생)
    analysis: pd.DataFrame       # ChronoTwinRecord 수준 (회귀 입력)
    msfsc: pd.DataFrame          # 피험자별 MSF/MSFsc
    report: ETLReport


def transform_load(
    parsed: pd.DataFrame,
    profiles: dict[str, SubjectProfile],
    report: ETLReport,
    recommended_sleep_min: float = 480.0,
) -> LoadResult:
    daily_rows: list[dict] = []

    parsed = parsed.sort_values(["respondent_key", "survey_date"], na_position="last")

    for _, r in parsed.iterrows():
        sid = r["respondent_key"]
        sd = r["survey_date"]
        flags: list[str] = []
        imputed_here: list[str] = list(r.get("_imputed", []) or [])

        if sid is None or sd is None or (r["onset_t"] is None and r["wake_t"] is None):
            report.n_quarantined += 1
            report.quarantine_rows.append({
                "respondent_key": sid, "survey_date": str(sd),
                "reason": "필수 식별자 또는 수면 시각 전부 결측",
            })
            continue

        onset_t = r["onset_t"] or time(1, 0)
        wake_t = r["wake_t"] or time(7, 0)
        if r["onset_t"] is None:
            flags.append("onset_imputed_default_01:00")
        if r["wake_t"] is None:
            flags.append("wake_imputed_default_07:00")

        try:
            onset_dt, wake_dt = combine_night(onset_t, wake_t, sd)
        except Exception as e:  # pragma: no cover
            report.n_quarantined += 1
            report.quarantine_rows.append({"respondent_key": sid, "survey_date": str(sd),
                                           "reason": f"combine_night 실패: {e}"})
            continue

        dur_min = (wake_dt - onset_dt).total_seconds() / 60.0
        dtype = DayType(r["day_type"])

        # 카페인 잔류
        caf_hour = r["caffeine_last_hour"] or time(20, 0)
        caf_at = datetime.combine(sd, caf_hour)
        doses = pk.doses_from_checklist(r["caffeine_items"], caf_at, CAFFEINE_TABLE_MG)
        caf_total_mg = sum(d.mg for d in doses)
        caf_residue = pk.caffeine_residue_at_bedtime(doses, onset_dt)

        # 블루라이트 보정
        bl_min = float(r["bluelight_duration_min"]) if not _isna(r["bluelight_duration_min"]) else 0.0
        br = float(r["screen_brightness_ratio"])
        bl_adj = photo.bluelight_adjusted_min(bl_min, br)

        # LED 조명
        lux = float(r["led_lux"]) if not _isna(r["led_lux"]) else 0.0
        cct = int(r["led_color_temp_k"]) if not _isna(r["led_color_temp_k"]) else 4000
        led_mel_lux = photo.melanopic_lux(lux, cct)
        led_load = photo.led_evening_load(lux, cct, adolescent=True)

        prof = profiles.get(sid)
        chrono_offset = prof.chronotype_offset_min if prof else 0
        brain_peak = 9.0 + (chrono_offset / 60.0) * 3.0

        try:
            dr = DailyRecord(
                record_id=new_id(),
                subject_id=sid,
                survey_date=sd,
                day_type=dtype,
                sleep_onset=onset_dt,
                sleep_wake=wake_dt,
                sleep_duration_min=round(dur_min, 1),
                bluelight_duration_min=bl_min,
                screen_brightness_ratio=br,
                caffeine_intake_mg=round(caf_total_mg, 1),
                caffeine_last_intake_at=caf_at if doses else None,
                led_lux=round(lux, 1),
                led_color_temp_k=cct,
                brain_peak_score=round(brain_peak, 2),
                exercised=bool(r["exercised"]) if r["exercised"] is not None else False,
                sleep_aid=r["sleep_aid"],
                imputed_fields=imputed_here,
                quality_flags=flags,
            )
        except SchemaError as e:
            report.n_quarantined += 1
            report.quarantine_rows.append({"respondent_key": sid, "survey_date": str(sd),
                                           "reason": f"스키마 검증 실패: {e}"})
            continue

        night_valid = (
            not any("imputed" in f for f in flags)
            and 180.0 <= dur_min <= 720.0
        )

        row = dr.to_row()
        row.update({
            "sleep_onset_clock_min": dr.sleep_onset_clock_min,
            "bluelight_adj_min": bl_adj,
            "caffeine_residue_mg": caf_residue,
            "led_melanopic_lux": led_mel_lux,
            "led_evening_load": led_load,
            "chronotype_offset_min": chrono_offset,
            "night_valid": night_valid,
        })
        daily_rows.append(row)

    daily = pd.DataFrame(daily_rows)
    report.n_parsed = len(daily)
    if daily.empty:
        report.warnings.append("정제 후 남은 레코드가 0 — 입력/파싱 점검 필요")
        return LoadResult(daily, pd.DataFrame(), pd.DataFrame(), report)

    # ── 개인 기준 취침시각 · 수면 부채 · MSFsc ──
    daily = daily.sort_values(["subject_id", "survey_date"]).reset_index(drop=True)
    daily["personal_ref_bedtime_min"] = daily.groupby("subject_id")["sleep_onset_clock_min"].transform("mean")
    daily["phase_delay_min"] = daily["sleep_onset_clock_min"] - daily["personal_ref_bedtime_min"]

    debt_vals: list[Optional[float]] = []
    n_debt_blocked = 0
    for _, sub in daily.groupby("subject_id"):
        col = mctq.rolling_sleep_debt(
            sub["sleep_duration_min"].tolist(),
            window=5,
            recommended_min=recommended_sleep_min,
            valid=sub["night_valid"].tolist(),
            max_invalid_in_window=0,
        )
        n_debt_blocked += sum(1 for i, v in enumerate(col) if i >= 5 and v is None)
        debt_vals += col
    daily["sleep_debt_min"] = debt_vals
    if n_debt_blocked:
        report.log(f"수면부채: 대체(imputed) 밤이 낀 창 {n_debt_blocked}건을 신뢰불가로 제외(None)")

    msfsc = _compute_all_msfsc(daily, report)

    # ── ChronoTwinRecord (회귀 입력) ──
    analysis = daily.dropna(subset=["sleep_debt_min"]).copy()
    analysis = analysis[[
        "record_id", "subject_id", "survey_date", "day_type",
        "phase_delay_min", "bluelight_adj_min", "caffeine_residue_mg", "sleep_debt_min",
        "led_melanopic_lux", "led_evening_load", "chronotype_offset_min",
        "exercised", "sleep_aid",
    ]].copy()
    analysis["exercised"] = analysis["exercised"].astype(bool)
    analysis["sleep_aid_flag"] = analysis["sleep_aid"].notna() & (analysis["sleep_aid"] != "")
    report.log(f"회귀 입력 표본: {len(analysis)}행 (수면부채 창 미충족 {len(daily) - len(analysis)}행 제외)")

    return LoadResult(daily=daily, analysis=analysis, msfsc=msfsc, report=report)


def _compute_all_msfsc(daily: pd.DataFrame, report: ETLReport) -> pd.DataFrame:
    rows = []
    for sid, sub in daily.groupby("subject_id"):
        nights = [
            mctq.SleepNight(
                night_of=pd.to_datetime(r["survey_date"]).date(),
                onset_clock_min=r["sleep_onset_clock_min"],
                duration_min=r["sleep_duration_min"],
                day_type=r["day_type"],
            )
            for _, r in sub.iterrows()
        ]
        try:
            res = mctq.compute_msfsc(sid, nights, variant="exp_plan")
            rows.append({
                "subject_id": sid, "n_work": res.n_work, "n_free": res.n_free,
                "sd_w_min": res.sd_w_min, "sd_f_min": res.sd_f_min, "sd_week_min": res.sd_week_min,
                "msf_clock": res.msf_clock, "msfsc_min": res.msfsc_min, "msfsc_clock": res.msfsc_clock,
                "correction_applied": res.correction_applied,
                "warnings": "; ".join(res.warnings),
            })
        except ValueError as e:
            report.warnings.append(f"MSFsc 계산 불가 [{sid}]: {e}")
    return pd.DataFrame(rows)


def _isna(v) -> bool:
    try:
        return v is None or (isinstance(v, float) and math.isnan(v))
    except TypeError:
        return False


# ────────────────────────────────────────────────────────────────────
# 오케스트레이션 헬퍼
# ────────────────────────────────────────────────────────────────────
def run_etl(
    responses: list[RawSurveyResponse],
    profiles: list[SubjectProfile],
    impute_method: str = "group_median",
    recommended_sleep_min: float = 480.0,
) -> LoadResult:
    report = ETLReport()
    prof_map = {p.subject_id: p for p in profiles}

    raw_df = extract(responses)
    report.log(f"Extract: {len(raw_df)}행 로드")

    parsed = parse_rows(raw_df, report)
    report.log("Transform: 타입 파싱 완료")

    parsed = impute_missing(parsed, prof_map, report, method=impute_method)
    report.log(f"Transform: 결측 대체 완료 (method={impute_method})")

    result = transform_load(parsed, prof_map, report, recommended_sleep_min)
    result.report.log("Load: ChronoTwinRecord 적재 완료")
    return result
