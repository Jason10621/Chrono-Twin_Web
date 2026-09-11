"""Z-score 이상치 판별 테스트."""
import numpy as np
import pandas as pd
import pytest

from pipeline.outliers import remove_outliers, scan_dataframe, zscore_flags

rng = np.random.default_rng(7)
NORMAL = list(np.round(rng.normal(50, 4, 40), 2))     # 안정적 μ,σ 를 위한 정상 표본


def test_zscore_flags_basic():
    vals = NORMAL + [250.0]        # 명백한 통계적 이상치
    rep = zscore_flags(vals, "caffeine_residue_mg", threshold=3.0)
    assert rep.flagged_index == [len(vals) - 1]
    assert rep.n_zscore == 1


def test_hard_range_masked_before_mu_sigma():
    # 카페인 2000mg 은 하드범위(0~1000) 초과 → μ,σ 계산에서 제외되어야
    vals = NORMAL + [2000.0]
    rep = zscore_flags(vals, "caffeine_residue_mg")
    assert (len(vals) - 1) in rep.flagged_index
    assert rep.mu < 100          # 2000 이 평균을 오염시키지 않음
    assert rep.n_hard_range == 1


def test_derived_column_has_hard_range():
    # bluelight_adj_min 도 하드범위(0~600)가 정의돼 있어야 (실험계획서 §4-3 ①)
    vals = NORMAL + [900.0]
    rep = zscore_flags(vals, "bluelight_adj_min")
    assert rep.n_hard_range == 1


def test_zero_sigma_no_flag():
    rep = zscore_flags([5, 5, 5, 5], "phase_delay_min")
    assert rep.flagged_index == []
    assert rep.sigma == 0.0


def test_modified_zscore_robust_with_mad_zero():
    vals = [10, 10, 10, 10, 10, 10, 40]      # MAD=0 → meanAD 폴백
    rep = zscore_flags(vals, "phase_delay_min", threshold=3.5, method="modified")
    assert 6 in rep.flagged_index


def test_modified_zscore_robust_general():
    vals = list(np.round(rng.normal(10, 1.5, 30), 2)) + [80.0]
    rep = zscore_flags(vals, "phase_delay_min", threshold=3.5, method="modified")
    assert (len(vals) - 1) in rep.flagged_index


def test_scan_dataframe_row_reasons():
    base = list(np.round(rng.normal(50, 3, 25), 2))
    df = pd.DataFrame({
        "bluelight_adj_min": base + [900.0],          # 마지막 행 하드범위 초과
        "caffeine_residue_mg": [10.0] * 25 + [500.0],  # 마지막 행 Z 초과
        "phase_delay_min": list(np.round(rng.normal(0, 5, 26), 2)),
    })
    res = scan_dataframe(df, ["bluelight_adj_min", "caffeine_residue_mg", "phase_delay_min"])
    last = len(df) - 1
    assert res.row_is_outlier[last] is True
    assert "bluelight_adj_min" in res.row_reasons[last]
    assert "caffeine_residue_mg" in res.row_reasons[last]


def test_remove_outliers_helper():
    base = list(np.round(rng.normal(50, 3, 30), 2))
    df = pd.DataFrame({
        "bluelight_adj_min": base + [700.0],
        "caffeine_residue_mg": [20.0] * 30 + [900.0],
        "sleep_debt_min": [300.0] * 31,
        "phase_delay_min": list(np.round(rng.normal(0, 6, 31), 2)),
        "led_melanopic_lux": [120.0] * 31,
    })
    clean, scan = remove_outliers(df)
    assert len(clean) == 30
    assert scan.n_outlier_rows == 1
    assert "is_outlier" not in clean.columns


def test_scan_dataframe_grouped_sigma_smaller():
    df = pd.DataFrame({
        "subject_id": ["A"] * 6 + ["B"] * 6,
        "phase_delay_min": [40, 42, 38, 41, 39, 43] + [-40, -42, -38, -41, -39, -43],
    })
    pooled = scan_dataframe(df, ["phase_delay_min"])
    grouped = scan_dataframe(df, ["phase_delay_min"], group_col="subject_id")
    assert grouped.n_outlier_rows == 0
    assert grouped.column_reports["phase_delay_min"].sigma < \
        pooled.column_reports["phase_delay_min"].sigma
