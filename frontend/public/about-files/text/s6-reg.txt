"""
다중선형회귀분석 — 메인 통계 분석  (실험계획서 §5-3)
==================================================

모형
    Y = β₀ + β₁·X₁(블루라이트 보정) + β₂·X₂(카페인 잔류)
          + β₃·X₃(수면 부채) + Σ γ·(공변량) + ε

산출물 (실험계획서 §5-4 해석 기준)
    · β, 표준오차, t, p-value
    · R², 조정 R², F, F의 p
    · 표준화 β* (β* = β · SD_X / SD_Y)   → 변수 간 영향력 상대 비교
    · VIF (< 5 권장, 엄격 < 2)           → 다중공선성 진단
    · 단순 모형 3개(X₁,X₂,X₃ 각각) vs 통합 모형 R² 비교 (H4 검증)

statsmodels 를 쓰되, 없으면 numpy 최소 구현으로 폴백.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np

try:
    import statsmodels.api as sm
    from statsmodels.stats.outliers_influence import variance_inflation_factor
    _HAS_SM = True
except Exception:  # pragma: no cover
    _HAS_SM = False


DEFAULT_PREDICTORS = ["bluelight_adj_min", "caffeine_residue_mg", "sleep_debt_min"]
DEFAULT_COVARIATES = ["chronotype_offset_min", "exercised", "led_evening_load"]
TARGET = "phase_delay_min"


@dataclass
class Term:
    name: str
    beta: float
    se: float
    t: float
    p: float
    beta_std: Optional[float] = None
    vif: Optional[float] = None

    @property
    def significant(self) -> bool:
        return self.p < 0.05


@dataclass
class RegressionResult:
    model_label: str
    n_obs: int
    terms: list[Term]
    r2: float
    r2_adj: float
    f_stat: float
    f_pvalue: float
    target: str = TARGET
    notes: list[str] = field(default_factory=list)

    def term(self, name: str) -> Optional[Term]:
        return next((t for t in self.terms if t.name == name), None)

    @property
    def dominant_predictor(self) -> Optional[Term]:
        cand = [t for t in self.terms if t.name != "const" and t.beta_std is not None]
        return max(cand, key=lambda t: abs(t.beta_std), default=None)

    def to_text(self) -> str:
        lines = [
            f"── {self.model_label} " + "─" * max(0, 46 - len(self.model_label)),
            f"   N={self.n_obs}   R²={self.r2:.3f}   adjR²={self.r2_adj:.3f}   "
            f"F={self.f_stat:.2f} (p={self.f_pvalue:.4g})",
            f"   {'term':<22}{'β':>12}{'SE':>10}{'t':>8}{'p':>10}{'β*':>9}{'VIF':>8}",
        ]
        for t in self.terms:
            bs = f"{t.beta_std:+.3f}" if t.beta_std is not None else "   –  "
            vif = f"{t.vif:.2f}" if t.vif is not None else "  – "
            star = " *" if t.significant and t.name != "const" else ""
            lines.append(
                f"   {t.name:<22}{t.beta:>12.4f}{t.se:>10.4f}{t.t:>8.2f}"
                f"{t.p:>10.4g}{bs:>9}{vif:>8}{star}"
            )
        for n in self.notes:
            lines.append(f"   ▸ {n}")
        return "\n".join(lines)


# ────────────────────────────────────────────────────────────────────
def _standardized_betas(X: np.ndarray, y: np.ndarray, betas: np.ndarray, names: Sequence[str]) -> dict[str, float]:
    sd_y = y.std(ddof=1)
    out: dict[str, float] = {}
    for j, name in enumerate(names):
        if name == "const":
            continue
        sd_x = X[:, j].std(ddof=1)
        out[name] = float(betas[j] * sd_x / sd_y) if sd_y > 0 else float("nan")
    return out


def _vifs(X: np.ndarray, names: Sequence[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for j, name in enumerate(names):
        if name == "const":
            continue
        if _HAS_SM:
            try:
                out[name] = float(variance_inflation_factor(X, j))
                continue
            except Exception:
                pass
        # 폴백: VIF_j = 1 / (1 - R²_j),  X_j ~ 나머지 X
        mask = [k for k in range(X.shape[1]) if k != j]
        Xo, xj = X[:, mask], X[:, j]
        coef, *_ = np.linalg.lstsq(Xo, xj, rcond=None)
        resid = xj - Xo @ coef
        ss_res = float(resid @ resid)
        ss_tot = float(((xj - xj.mean()) ** 2).sum())
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
        out[name] = float("inf") if r2 >= 1 else 1.0 / (1.0 - r2)
    return out


def _ols_numpy(X: np.ndarray, y: np.ndarray, names: Sequence[str], label: str) -> RegressionResult:
    n, k = X.shape
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    df_resid = n - k
    ss_res = float(resid @ resid)
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    r2_adj = 1 - (1 - r2) * (n - 1) / df_resid if df_resid > 0 else float("nan")
    sigma2 = ss_res / df_resid if df_resid > 0 else float("nan")
    xtx_inv = np.linalg.pinv(X.T @ X)
    se = np.sqrt(np.diag(xtx_inv) * sigma2)
    tvals = beta / se
    # t → p (양측), 정규근사 대신 scipy 사용 가능하면 사용
    try:
        from scipy import stats
        pvals = 2 * (1 - stats.t.cdf(np.abs(tvals), df_resid))
        f_stat = (r2 / (k - 1)) / ((1 - r2) / df_resid) if k > 1 and r2 < 1 else float("nan")
        f_p = float(1 - stats.f.cdf(f_stat, k - 1, df_resid)) if np.isfinite(f_stat) else float("nan")
    except Exception:  # pragma: no cover
        from math import erfc, sqrt
        pvals = np.array([erfc(abs(t) / sqrt(2)) for t in tvals])
        f_stat = f_p = float("nan")

    bstd = _standardized_betas(X, y, beta, names)
    vif = _vifs(X, names)
    terms = [
        Term(nm, float(beta[j]), float(se[j]), float(tvals[j]), float(pvals[j]),
             bstd.get(nm), vif.get(nm))
        for j, nm in enumerate(names)
    ]
    return RegressionResult(label, n, terms, r2, r2_adj, f_stat, f_p)


def fit_ols(
    df,
    predictors: Sequence[str] = DEFAULT_PREDICTORS,
    covariates: Sequence[str] = (),
    target: str = TARGET,
    label: str = "OLS",
) -> RegressionResult:
    """DataFrame → 회귀 결과. bool 컬럼은 0/1 로 캐스팅. 결측행은 목록 제외."""
    import pandas as pd

    cols = list(predictors) + list(covariates) + [target]
    sub = df[cols].copy()
    for c in cols:
        if sub[c].dtype == bool:
            sub[c] = sub[c].astype(float)
    sub = sub.replace([np.inf, -np.inf], np.nan).dropna()
    if len(sub) <= len(cols):
        raise ValueError(f"{label}: 유효 표본({len(sub)}) 이 파라미터 수보다 적어 회귀 불가")

    names = ["const"] + list(predictors) + list(covariates)
    y = sub[target].to_numpy(dtype="float64")
    X = np.column_stack([np.ones(len(sub))] + [sub[c].to_numpy(dtype="float64")
                                               for c in list(predictors) + list(covariates)])

    if _HAS_SM:
        model = sm.OLS(y, X).fit()
        bstd = _standardized_betas(X, y, model.params, names)
        vif = _vifs(X, names)
        terms = [
            Term(nm, float(model.params[j]), float(model.bse[j]), float(model.tvalues[j]),
                 float(model.pvalues[j]), bstd.get(nm), vif.get(nm))
            for j, nm in enumerate(names)
        ]
        res = RegressionResult(
            label, int(model.nobs), terms,
            float(model.rsquared), float(model.rsquared_adj),
            float(model.fvalue), float(model.f_pvalue), target,
        )
    else:  # pragma: no cover
        res = _ols_numpy(X, y, names, label)
        res.notes.append("statsmodels 미설치 — numpy 폴백 사용")

    _annotate(res)
    return res


def fit_within(
    df,
    predictors: Sequence[str] = DEFAULT_PREDICTORS,
    covariates: Sequence[str] = (),
    target: str = TARGET,
    subject_col: str = "subject_id",
    label: str = "피험자 고정효과(within)",
) -> RegressionResult:
    """피험자 고정효과(within) 추정량.

    반복측정(1인 여러 밤) 자료에서 pooled OLS 는 시불변 개인차(크로노타입 등)
    때문에 시변 계수가 축소·편향된다. 각 변수를 피험자 평균으로 차분(demean)한
    뒤 절편 없이 OLS → 개인 baseline 을 흡수하고 '그날의' 효과만 식별.
    시불변 변수(demean 후 0)는 자동 탈락시키고 note 에 기록한다.
    (실험계획서 §5-3 의 pooled 회귀에 대한 보완 — 보고서 한계점 항목과 연결)
    """
    import pandas as pd

    reg_cols = list(predictors) + list(covariates)
    cols = reg_cols + [target, subject_col]
    sub = df[cols].copy()
    for c in reg_cols + [target]:
        if sub[c].dtype == bool:
            sub[c] = sub[c].astype(float)
    sub = sub.replace([np.inf, -np.inf], np.nan).dropna()
    n_groups = sub[subject_col].nunique()

    dem = sub.copy()
    for c in reg_cols + [target]:
        dem[c] = sub[c] - sub.groupby(subject_col)[c].transform("mean")

    dropped = [c for c in reg_cols if float(dem[c].abs().max()) < 1e-9]
    kept = [c for c in reg_cols if c not in dropped]
    if not kept:
        raise ValueError(f"{label}: demean 후 남는 시변 변수가 없음")

    y = dem[target].to_numpy(dtype="float64")
    X = np.column_stack([dem[c].to_numpy(dtype="float64") for c in kept])
    n, k = X.shape
    df_resid = n - n_groups - k

    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    ss_res = float(resid @ resid)
    ss_tot = float((y ** 2).sum())              # demean 됨 → 평균 0
    r2_within = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    r2_adj = 1 - (1 - r2_within) * (n - 1) / df_resid if df_resid > 0 else float("nan")
    sigma2 = ss_res / df_resid if df_resid > 0 else float("nan")
    xtx_inv = np.linalg.pinv(X.T @ X)
    se = np.sqrt(np.diag(xtx_inv) * sigma2)
    tvals = beta / se
    try:
        from scipy import stats
        pvals = 2 * (1 - stats.t.cdf(np.abs(tvals), max(df_resid, 1)))
        f_stat = (r2_within / k) / ((1 - r2_within) / df_resid) if df_resid > 0 and r2_within < 1 else float("nan")
        f_p = float(1 - stats.f.cdf(f_stat, k, df_resid)) if np.isfinite(f_stat) else float("nan")
    except Exception:  # pragma: no cover
        from math import erfc, sqrt
        pvals = np.array([erfc(abs(t) / sqrt(2)) for t in tvals])
        f_stat = f_p = float("nan")

    sd_y = y.std(ddof=1)
    bstd = {c: float(beta[j] * X[:, j].std(ddof=1) / sd_y) if sd_y > 0 else float("nan")
            for j, c in enumerate(kept)}
    vif = _vifs(X, kept)
    terms = [Term(c, float(beta[j]), float(se[j]), float(tvals[j]), float(pvals[j]),
                  bstd.get(c), vif.get(c)) for j, c in enumerate(kept)]
    res = RegressionResult(label, n, terms, r2_within, r2_adj, f_stat, f_p, target)
    res.notes.append(f"피험자 {n_groups}명의 고정효과 흡수 (df_resid={df_resid})")
    if dropped:
        res.notes.append(f"시불변으로 탈락: {', '.join(dropped)} — 개인 baseline/MSFsc 모형에서 다룰 것")
    res.notes.append("R² 는 within R² (개인차 제거 후 설명분산 비율)")
    _annotate(res, check_r2=False)
    return res


def _annotate(res: RegressionResult, check_r2: bool = True) -> None:
    for t in res.terms:
        if t.name == "const":
            continue
        if t.vif is not None and t.vif >= 5:
            res.notes.append(f"{t.name}: VIF={t.vif:.1f} ≥ 5 — 다중공선성 의심 (실험계획서 §5-4)")
    if check_r2 and res.r2 < 0.30:
        res.notes.append("R² < 0.30 — 설명력이 약함 (실험계획서 기준: 0.30 이상이면 의미 있는 설명력)")
    dom = res.dominant_predictor
    if dom:
        res.notes.append(f"표준화 β* 최대 예측 변수: {dom.name} (β*={dom.beta_std:+.3f})")


def compare_models(
    df,
    predictors: Sequence[str] = DEFAULT_PREDICTORS,
    covariates: Sequence[str] = DEFAULT_COVARIATES,
    target: str = TARGET,
) -> dict[str, RegressionResult]:
    """H4 검증용: 단순 모형 3개 + 공변량만 + 통합 모형(+공변량)."""
    out: dict[str, RegressionResult] = {}
    for p in predictors:
        out[f"단순: {p}"] = fit_ols(df, [p], (), target, label=f"단순 모형 — {p}")
    out["통합: X1+X2+X3"] = fit_ols(df, predictors, (), target, label="통합 모형 — X₁+X₂+X₃")
    out["통합+공변량"] = fit_ols(df, predictors, covariates, target,
                              label="통합 모형 + 공변량 (크로노타입·운동·LED)")
    return out


def h4_verdict(models: dict[str, RegressionResult],
               predictors: Sequence[str] = DEFAULT_PREDICTORS) -> str:
    best_simple = max((models[f"단순: {p}"].r2 for p in predictors), default=0.0)
    full = models.get("통합: X1+X2+X3")
    if not full:
        return "통합 모형 없음"
    delta = full.r2 - best_simple
    ok = "지지됨 ✓" if delta > 0.02 else "판단 보류"
    return (f"H4(통합 모형 우월성): 최고 단순 R²={best_simple:.3f} → 통합 R²={full.r2:.3f} "
            f"(ΔR²={delta:+.3f})  ⇒ {ok}")
