"""상관분석 (§5-2) 테스트."""
import numpy as np
import pandas as pd
import pytest

from pipeline import correlation as corr
from pipeline import dummy_data, regression
from pipeline.etl import run_etl
from pipeline.outliers import remove_outliers


@pytest.fixture(scope="module")
def clean_df():
    ds = dummy_data.generate(24, 14, seed=7)
    res = run_etl(ds.responses, ds.profiles)
    clean, _ = remove_outliers(res.analysis)
    return clean


def test_flags_high_correlation_pair():
    # X3(수면부채)와 크로노타입은 구조적으로 강한 상관 → 경보 대상
    n = 300
    rng = np.random.default_rng(0)
    chrono = rng.normal(0, 45, n)
    debt = 2.0 * chrono + rng.normal(0, 20, n)     # r ≈ 0.9
    df = pd.DataFrame({
        "phase_delay_min": 0.1 * debt + rng.normal(0, 10, n),
        "bluelight_adj_min": rng.normal(60, 20, n),
        "caffeine_residue_mg": rng.gamma(2, 15, n),
        "sleep_debt_min": debt,
        "chronotype_offset_min": chrono,
        "exercised": rng.integers(0, 2, n).astype(bool),
        "led_evening_load": rng.normal(0.3, 0.1, n),
    })
    ca = corr.correlation_analysis(df, "phase_delay_min",
                                   ["bluelight_adj_min", "caffeine_residue_mg", "sleep_debt_min"],
                                   ["chronotype_offset_min", "exercised", "led_evening_load"])
    pairs = {frozenset((p.a, p.b)) for p in ca.high_pairs}
    assert frozenset(("sleep_debt_min", "chronotype_offset_min")) in pairs
    assert "다중공선성" in ca.verdict


def test_no_high_pairs_when_independent():
    n = 200
    rng = np.random.default_rng(1)
    df = pd.DataFrame({
        "phase_delay_min": rng.normal(0, 10, n),
        "bluelight_adj_min": rng.normal(60, 20, n),
        "caffeine_residue_mg": rng.gamma(2, 15, n),
        "sleep_debt_min": rng.normal(400, 150, n),
    })
    ca = corr.correlation_analysis(df, "phase_delay_min",
                                   ["bluelight_adj_min", "caffeine_residue_mg", "sleep_debt_min"])
    assert ca.high_pairs == []
    assert "통과" in ca.verdict


def test_method_switches_to_spearman_on_nonnormal():
    n = 200
    rng = np.random.default_rng(2)
    df = pd.DataFrame({
        "phase_delay_min": rng.normal(0, 10, n),
        "caffeine_residue_mg": rng.exponential(30, n),   # 강한 우편향 → 비정규
        "bluelight_adj_min": rng.normal(60, 20, n),
        "sleep_debt_min": rng.normal(400, 120, n),
    })
    ca = corr.correlation_analysis(df, "phase_delay_min",
                                   ["bluelight_adj_min", "caffeine_residue_mg", "sleep_debt_min"])
    assert ca.method == "spearman"
    assert any(not n.is_normal for n in ca.normality if n.p is not None)


def test_matrix_shape_and_diag(clean_df):
    ca = corr.correlation_analysis(clean_df, regression.TARGET,
                                   regression.DEFAULT_PREDICTORS, regression.DEFAULT_COVARIATES)
    k = len(ca.matrix_labels)
    assert len(ca.pearson_matrix) == k and len(ca.spearman_matrix[0]) == k
    for i in range(k):
        assert ca.pearson_matrix[i][i] == pytest.approx(1.0, abs=1e-6)
    d = ca.to_dict()
    assert d["method"] in ("pearson", "spearman")
    assert "matrix_labels" in d and len(d["target_corr"]) == k - 1


def test_target_corr_has_both_coefficients(clean_df):
    ca = corr.correlation_analysis(clean_df, regression.TARGET, regression.DEFAULT_PREDICTORS)
    for p in ca.target_corr:
        assert -1 <= p.pearson_r <= 1 and -1 <= p.spearman_r <= 1
        assert 0 <= p.pearson_p <= 1
