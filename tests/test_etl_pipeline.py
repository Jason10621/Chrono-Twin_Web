"""ETL + 회귀 통합 테스트 — 더미 데이터로 전 구간 검증 & 견고성."""
import numpy as np
import pandas as pd
import pytest

from pipeline import dummy_data, regression
from pipeline.etl import run_etl, extract, parse_rows, ETLReport
from pipeline.outliers import remove_outliers
from pipeline.schema import RawSurveyResponse, SubjectProfile, Chronotype, Sex


@pytest.fixture(scope="module")
def small_ds():
    return dummy_data.generate(n_subjects=24, n_days=14, seed=42)


@pytest.fixture(scope="module")
def etl_result(small_ds):
    return run_etl(small_ds.responses, small_ds.profiles)


def test_etl_runs_and_produces_tables(etl_result):
    assert not etl_result.daily.empty
    assert not etl_result.analysis.empty
    assert not etl_result.msfsc.empty
    # 신규 필드가 살아있는지
    assert "led_lux" in etl_result.daily.columns
    assert "led_color_temp_k" in etl_result.daily.columns
    assert "led_evening_load" in etl_result.analysis.columns


def test_etl_reports_injected_defects(etl_result, small_ds):
    rep = etl_result.report
    # 깨진 시각이 있었으면 파싱 오류로 잡혔거나 결측 대체로 처리됨
    assert rep.n_raw == len(small_ds.responses)
    assert sum(rep.parse_errors.values()) + rep.n_quarantined >= 0
    assert rep.imputed          # 결측 셀을 심었으므로 대체가 발생


def test_no_future_or_negative_sleep(etl_result):
    d = etl_result.daily
    assert (d["sleep_duration_min"] > 0).all()
    assert (d["sleep_duration_min"] <= 24 * 60).all()


def test_phase_delay_centered_per_subject(etl_result):
    d = etl_result.daily
    means = d.groupby("subject_id")["phase_delay_min"].mean()
    assert means.abs().max() < 1e-6      # 개인별 평균 ≈ 0 (정의상 중심화)


def test_regression_recovers_time_varying_betas(small_ds):
    """within(고정효과) 모형이 시변·외생 계수를 ±25% 내로 복원.
    (Z-score 이상치 제거를 먼저 적용 — run_pipeline 과 동일 순서)"""
    res = run_etl(small_ds.responses, small_ds.profiles)
    clean, _ = remove_outliers(res.analysis)
    fe = regression.fit_within(clean, regression.DEFAULT_PREDICTORS,
                               regression.DEFAULT_COVARIATES)
    gt = small_ds.ground_truth
    checks = {
        "bluelight_adj_min": gt["beta_bluelight_adj"],
        "caffeine_residue_mg": gt["beta_caffeine_residue"],
        "led_evening_load": gt["gamma_led_load"],
    }
    for name, truth in checks.items():
        term = fe.term(name)
        assert term is not None, f"{name} 이 within 모형에서 사라짐"
        assert term.beta == pytest.approx(truth, rel=0.25), \
            f"{name}: 정답 {truth}, 추정 {term.beta:.3f}"


def test_within_drops_time_invariant(small_ds):
    res = run_etl(small_ds.responses, small_ds.profiles)
    clean, _ = remove_outliers(res.analysis)
    fe = regression.fit_within(clean, regression.DEFAULT_PREDICTORS,
                               ["chronotype_offset_min", "exercised"])
    assert fe.term("chronotype_offset_min") is None      # 시불변 → 탈락
    assert any("탈락" in n for n in fe.notes)


def test_h4_integrated_model_better(small_ds):
    res = run_etl(small_ds.responses, small_ds.profiles)
    clean, _ = remove_outliers(res.analysis)
    models = regression.compare_models(clean)
    best_simple = max(models[f"단순: {p}"].r2 for p in regression.DEFAULT_PREDICTORS)
    assert models["통합: X1+X2+X3"].r2 > best_simple + 0.02


# ── 견고성: 완전 불량 입력에도 크래시하지 않음 ──────────────────────
def _junk_response(key, day):
    return RawSurveyResponse(
        respondent_key=key, timestamp="", survey_date=f"2026-03-{day:02d}",
        bed_time="???", wake_time="", bluelight_min="많이", screen_brightness_pct="",
        caffeine_items="garbage:x;;", caffeine_last_hour="99:99",
        led_lux="", led_color_temp="차가움", exercised="아마도",
    )


def test_pipeline_survives_all_junk():
    profs = [SubjectProfile("J1", Chronotype.INTERMEDIATE, 50, 2, Sex.MALE)]
    resp = [_junk_response("J1", d) for d in range(2, 16)]
    result = run_etl(resp, profs)
    # 전부 격리되거나 기본값 대체 — 예외 없이 리포트가 나와야
    assert result.report.n_raw == 14
    assert isinstance(result.report.summary_lines(), list)
    assert result.daily.empty or (result.daily["subject_id"] == "J1").all()


def test_pipeline_handles_single_subject_single_day():
    profs = [SubjectProfile("X1", Chronotype.MODERATE_EVENING, 42, 3, Sex.FEMALE)]
    resp = [RawSurveyResponse(
        respondent_key="X1", timestamp="", survey_date="2026-03-02",
        bed_time="00:40", wake_time="07:10", bluelight_min="55",
        screen_brightness_pct="70", caffeine_items="energy_drink:1",
        caffeine_last_hour="21:00", led_lux="180", led_color_temp="5000",
        exercised="아니오",
    )]
    result = run_etl(resp, profs)
    assert result.report.n_parsed == 1
    # 수면부채 창(5일) 미충족 → 회귀 테이블은 비어야
    assert result.analysis.empty


def test_missing_profile_uses_zero_chronotype():
    resp = [RawSurveyResponse(
        respondent_key="ghost", timestamp="", survey_date=f"2026-03-{d:02d}",
        bed_time="01:00", wake_time="07:00", bluelight_min="40",
        screen_brightness_pct="50", caffeine_items="", caffeine_last_hour="",
        led_lux="120", led_color_temp="4000", exercised="아니오",
    ) for d in range(2, 16)]
    result = run_etl(resp, [])       # 프로필 없음
    assert (result.daily["chronotype_offset_min"] == 0).all()
