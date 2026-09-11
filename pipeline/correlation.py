"""
상관분석 (사전 탐색)  —  실험계획서 §5-2
========================================

목적
----
· Y 와 X₁·X₂·X₃ 의 상관계수(r) 산출 — 회귀 전 예비 탐색
· 상관행렬 히트맵으로 변수 간 관계 확인
· 다중공선성 예비 점검: X 변수 간 |r| > 0.8 이면 통합 처리 검토

방법 선택 (실험계획서 §5-1 정규성 검정 연계)
-------------------------------------------
· Shapiro-Wilk 검정 (표본 3~5000) 으로 각 연속변수의 정규성 판정
· Y·X 모두 정규(p > 0.05) → 피어슨(Pearson) r
· 하나라도 비정규 → 스피어만(Spearman) ρ 를 주 계수로 사용
· 두 계수를 모두 계산해 함께 보고(강건성 확인)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import numpy as np
import pandas as pd

try:
    from scipy import stats
    _HAS_SCIPY = True
except Exception:  # pragma: no cover
    _HAS_SCIPY = False

# §5-2 다중공선성 예비 점검 임계값 (X 변수 간)
MULTICOLLINEARITY_R = 0.8
# §5-3 상관분석(사전) 에서 참고하는 VIF 경고선
VIF_WARN = 5.0


@dataclass
class NormalityResult:
    column: str
    n: int
    W: float | None
    p: float | None
    is_normal: bool          # p > 0.05
    note: str = ""


@dataclass
class PairCorr:
    a: str
    b: str
    pearson_r: float
    pearson_p: float
    spearman_r: float
    spearman_p: float

    @property
    def flagged(self) -> bool:
        return abs(self.spearman_r) > MULTICOLLINEARITY_R or abs(self.pearson_r) > MULTICOLLINEARITY_R


@dataclass
class CorrelationAnalysis:
    target: str
    variables: list[str]                       # target 제외, X + 공변량
    method: str                                # "pearson" | "spearman"
    method_reason: str
    normality: list[NormalityResult]
    target_corr: list[PairCorr]                # Y vs 각 변수
    pearson_matrix: list[list[float]]
    spearman_matrix: list[list[float]]
    matrix_labels: list[str]                   # target + variables
    predictor_pairs: list[PairCorr]            # X-X (공변량 포함) 쌍 전체
    high_pairs: list[PairCorr]                 # |r| > 0.8
    verdict: str

    def to_dict(self) -> dict:
        def pc(p: PairCorr) -> dict:
            return {"a": p.a, "b": p.b,
                    "pearson_r": round(p.pearson_r, 3), "pearson_p": _rp(p.pearson_p),
                    "spearman_r": round(p.spearman_r, 3), "spearman_p": _rp(p.spearman_p),
                    "flagged": p.flagged}
        return {
            "target": self.target,
            "variables": self.variables,
            "method": self.method,
            "method_reason": self.method_reason,
            "multicollinearity_threshold": MULTICOLLINEARITY_R,
            "normality": [
                {"column": n.column, "n": n.n,
                 "W": _rp(n.W), "p": _rp(n.p), "is_normal": n.is_normal, "note": n.note}
                for n in self.normality
            ],
            "target_corr": [pc(p) for p in self.target_corr],
            "matrix_labels": self.matrix_labels,
            "pearson_matrix": [[round(v, 3) for v in row] for row in self.pearson_matrix],
            "spearman_matrix": [[round(v, 3) for v in row] for row in self.spearman_matrix],
            "high_pairs": [pc(p) for p in self.high_pairs],
            "verdict": self.verdict,
        }


def _rp(x) -> float | None:
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 4)


def _pearsonr(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    if _HAS_SCIPY:
        r, p = stats.pearsonr(x, y)
        return float(r), float(p)
    r = float(np.corrcoef(x, y)[0, 1])
    n = len(x)
    if abs(r) >= 1 or n < 3:
        return r, 0.0 if abs(r) >= 1 else 1.0
    t = r * np.sqrt((n - 2) / (1 - r ** 2))
    from math import erfc, sqrt
    return r, float(erfc(abs(t) / sqrt(2)))


def _spearmanr(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    if _HAS_SCIPY:
        r, p = stats.spearmanr(x, y)
        return float(r), float(p)
    rx = pd.Series(x).rank().to_numpy()
    ry = pd.Series(y).rank().to_numpy()
    return _pearsonr(rx, ry)


def _shapiro(v: np.ndarray) -> tuple[float | None, float | None, str]:
    v = v[np.isfinite(v)]
    if len(np.unique(v)) < 3:
        return None, None, "고유값 3 미만 — 정규성 검정 생략(비연속)"
    if not (3 <= len(v) <= 5000):
        return None, None, f"표본 {len(v)} — Shapiro-Wilk 적용 범위(3~5000) 밖"
    if not _HAS_SCIPY:  # pragma: no cover
        return None, None, "scipy 미설치 — 정규성 검정 생략"
    W, p = stats.shapiro(v)
    return float(W), float(p), ""


def correlation_analysis(
    df: pd.DataFrame,
    target: str,
    predictors: Sequence[str],
    covariates: Sequence[str] = (),
    vif_lookup: dict[str, float] | None = None,
) -> CorrelationAnalysis:
    variables = list(predictors) + list(covariates)
    cols = [target] + variables
    sub = df[cols].copy()
    for c in cols:
        if sub[c].dtype == bool:
            sub[c] = sub[c].astype(float)
    sub = sub.replace([np.inf, -np.inf], np.nan).dropna()

    # 정규성 (연속변수만 의미 있음)
    normality: list[NormalityResult] = []
    for c in cols:
        W, p, note = _shapiro(sub[c].to_numpy())
        is_norm = bool(p is not None and p > 0.05)
        normality.append(NormalityResult(c, len(sub), W, p, is_norm, note))

    testable = [n for n in normality if n.p is not None]
    non_normal = [n.column for n in testable if not n.is_normal]
    if not testable:
        method, reason = "spearman", "정규성 검정 불가 — 비모수(스피어만) 기본 사용"
    elif non_normal:
        method = "spearman"
        reason = f"{', '.join(non_normal)} 비정규(Shapiro p<0.05) → 스피어만 ρ 사용 (§5-2)"
    else:
        method, reason = "pearson", "모든 변수 정규(Shapiro p>0.05) → 피어슨 r 사용"

    # 행렬
    P = sub[cols].corr("pearson")
    S = sub[cols].corr("spearman")

    def pair(a: str, b: str) -> PairCorr:
        x, y = sub[a].to_numpy(), sub[b].to_numpy()
        pr, pp = _pearsonr(x, y)
        sr, sp = _spearmanr(x, y)
        return PairCorr(a, b, pr, pp, sr, sp)

    target_corr = [pair(target, v) for v in variables]
    predictor_pairs = [pair(variables[i], variables[j])
                       for i in range(len(variables)) for j in range(i + 1, len(variables))]
    high_pairs = [p for p in predictor_pairs if p.flagged]

    # 판정문
    lines = []
    strongest = max(target_corr, key=lambda p: abs(p.spearman_r if method == "spearman" else p.pearson_r),
                    default=None)
    if strongest:
        rv = strongest.spearman_r if method == "spearman" else strongest.pearson_r
        lines.append(f"Y 와 가장 강한 상관: {strongest.b} ({method} r={rv:+.3f})")
    if high_pairs:
        for p in high_pairs:
            v = f"pearson {p.pearson_r:+.2f} · spearman {p.spearman_r:+.2f}"
            extra = ""
            if vif_lookup:
                va, vb = vif_lookup.get(p.a), vif_lookup.get(p.b)
                if va and vb:
                    extra = f"  (VIF {va:.1f} / {vb:.1f})"
            lines.append(f"⚠ 다중공선성: {p.a} ↔ {p.b}  {v}{extra} — |r|>{MULTICOLLINEARITY_R}, 통합/제거 검토 (§5-2)")
    else:
        lines.append(f"X 변수 간 |r| > {MULTICOLLINEARITY_R} 쌍 없음 — 다중공선성 예비 점검 통과")

    return CorrelationAnalysis(
        target=target,
        variables=variables,
        method=method,
        method_reason=reason,
        normality=normality,
        target_corr=target_corr,
        pearson_matrix=P.values.tolist(),
        spearman_matrix=S.values.tolist(),
        matrix_labels=cols,
        predictor_pairs=predictor_pairs,
        high_pairs=high_pairs,
        verdict="\n".join(lines),
    )
