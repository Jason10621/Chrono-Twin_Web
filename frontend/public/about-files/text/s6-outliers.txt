"""
이상치(Outlier) 제거 — Z-Score 판별식  (이정욱 파트 방법론)
=========================================================

    |Z| = |X − μ| / σ  > 3.0   →  해당 데이터 포인트 분석 제외   (실험계획서 §4-3)

특징
----
· 표본 표준편차(ddof=1) 사용. σ = 0 (모든 값 동일) 이면 Z = 0 처리.
· 물리적 하드 범위(HARD_RANGES) 이탈은 Z 와 무관하게 우선 제외
  (예: 수면 0분, 카페인 2 000 mg — 평균을 오염시키므로 μ,σ 계산 전에 마스킹).
· '수정된 Z-score'(MAD 기반) 도 옵션 제공 — 표본이 작고 왜도가 큰 변수용.
· 결과는 원본을 파괴하지 않고 불리언 마스크 + 사유 문자열로 반환.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np

from .schema import HARD_RANGES, Z_THRESHOLD


@dataclass
class ColumnOutlierReport:
    column: str
    n_total: int
    n_hard_range: int
    n_zscore: int
    mu: float
    sigma: float
    threshold: float
    method: str
    flagged_index: list[int] = field(default_factory=list)
    detail: list[str] = field(default_factory=list)

    @property
    def n_flagged(self) -> int:
        return len(self.flagged_index)


def _hard_range_mask(values: np.ndarray, column: str) -> np.ndarray:
    lo, hi = HARD_RANGES.get(column, (-np.inf, np.inf))
    with np.errstate(invalid="ignore"):
        return (values < lo) | (values > hi)


def zscore_flags(
    values: Sequence[float],
    column: str,
    threshold: float = Z_THRESHOLD,
    method: str = "standard",           # "standard" | "modified"
    respect_hard_range: bool = True,
) -> ColumnOutlierReport:
    """한 컬럼의 이상치 판정.

    Returns
    -------
    ColumnOutlierReport : flagged_index 가 '제외 대상' 행 인덱스.
    """
    arr = np.asarray(values, dtype="float64")
    n = arr.size
    finite = np.isfinite(arr)

    hard_mask = np.zeros(n, dtype=bool)
    if respect_hard_range:
        hard_mask = _hard_range_mask(arr, column) & finite

    # μ, σ 는 하드범위 이탈·결측을 뺀 값으로만 계산
    basis = arr[finite & ~hard_mask]
    detail: list[str] = []

    if basis.size < 2:
        mu = float(basis.mean()) if basis.size else float("nan")
        sigma = 0.0
        z_mask = np.zeros(n, dtype=bool)
        detail.append("표본 < 2 — Z-score 계산 생략, 하드범위만 적용")
    elif method == "modified":
        med = float(np.median(basis))
        mad = float(np.median(np.abs(basis - med)))
        mu, sigma = med, mad
        if mad > 0:
            z = 0.6745 * (arr - med) / mad          # Iglewicz-Hoaglin
        else:
            # MAD=0 (값 절반 이상이 동일) → 평균절대편차로 폴백
            mean_ad = float(np.mean(np.abs(basis - med)))
            if mean_ad > 0:
                z = (arr - med) / (1.253314 * mean_ad)
                detail.append("MAD=0 → meanAD 폴백 사용")
            else:
                z = np.zeros(n)
        z_mask = (np.abs(z) > threshold) & finite & ~hard_mask
        for i in np.where(z_mask)[0]:
            detail.append(f"row {i}: X={arr[i]:.2f}  modZ={z[i]:+.2f}")
    else:
        mu = float(basis.mean())
        sigma = float(basis.std(ddof=1))
        if sigma == 0:
            z = np.zeros(n)
        else:
            z = (arr - mu) / sigma
        z_mask = (np.abs(z) > threshold) & finite & ~hard_mask
        for i in np.where(z_mask)[0]:
            detail.append(f"row {i}: X={arr[i]:.2f}  Z={z[i]:+.2f}")

    for i in np.where(hard_mask)[0]:
        lo, hi = HARD_RANGES[column]
        detail.append(f"row {i}: X={arr[i]:.2f}  하드범위[{lo},{hi}] 이탈")

    flagged = sorted(set(np.where(hard_mask)[0].tolist()) | set(np.where(z_mask)[0].tolist()))

    return ColumnOutlierReport(
        column=column,
        n_total=n,
        n_hard_range=int(hard_mask.sum()),
        n_zscore=int(z_mask.sum()),
        mu=round(mu, 3) if np.isfinite(mu) else float("nan"),
        sigma=round(sigma, 3),
        threshold=threshold,
        method=method,
        flagged_index=flagged,
        detail=detail,
    )


ANALYSIS_OUTLIER_COLS = [
    "bluelight_adj_min",
    "caffeine_residue_mg",
    "sleep_debt_min",
    "phase_delay_min",
    "led_melanopic_lux",
]


@dataclass
class OutlierScanResult:
    row_is_outlier: list[bool]
    row_reasons: list[list[str]]
    column_reports: dict[str, ColumnOutlierReport]

    @property
    def n_outlier_rows(self) -> int:
        return sum(self.row_is_outlier)

    def summary_lines(self) -> list[str]:
        out = [
            f"[Z-score 이상치 스캔]  임계값 |Z| > {next(iter(self.column_reports.values())).threshold}"
            if self.column_reports else "[Z-score 이상치 스캔]"
        ]
        for col, rep in self.column_reports.items():
            out.append(
                f"  · {col:<22} μ={rep.mu:>9.2f}  σ={rep.sigma:>8.2f}  "
                f"하드범위 {rep.n_hard_range}건 · Z초과 {rep.n_zscore}건"
            )
        out.append(f"  ⇒ 제외 대상 행: {self.n_outlier_rows}행")
        return out


def scan_dataframe(
    df,
    columns: Sequence[str],
    threshold: float = Z_THRESHOLD,
    method: str = "standard",
    group_col: Optional[str] = None,
) -> OutlierScanResult:
    """pandas DataFrame 의 여러 컬럼을 훑어 행 단위 이상치 마스크를 만든다.

    group_col 지정 시(예: 'subject_id') 그룹별로 μ,σ 를 따로 계산 —
    개인차가 큰 변수(취침시각 등)에서 집단 평균으로 판정하는 왜곡을 방지.
    여기서는 실험계획서 기준(전체 집단 μ,σ)을 기본으로 두고 옵션만 제공.
    """
    import pandas as pd  # 지역 import — 스키마/트랜스폼은 pandas 무의존 유지

    n = len(df)
    row_flags = [False] * n
    row_reasons: list[list[str]] = [[] for _ in range(n)]
    reports: dict[str, ColumnOutlierReport] = {}

    positions = {idx: i for i, idx in enumerate(df.index)}

    for col in columns:
        if col not in df.columns:
            continue
        if group_col and group_col in df.columns:
            merged_detail: list[str] = []
            n_hard = n_z = 0
            mus, sigmas = [], []
            flagged_positions: set[int] = set()
            for _, sub in df.groupby(group_col):
                rep = zscore_flags(sub[col].to_numpy(), col, threshold, method)
                sub_positions = [positions[idx] for idx in sub.index]
                for local_i in rep.flagged_index:
                    flagged_positions.add(sub_positions[local_i])
                merged_detail += rep.detail
                n_hard += rep.n_hard_range
                n_z += rep.n_zscore
                if rep.sigma:
                    mus.append(rep.mu)
                    sigmas.append(rep.sigma)
            rep = ColumnOutlierReport(
                column=col, n_total=n, n_hard_range=n_hard, n_zscore=n_z,
                mu=round(float(np.mean(mus)), 3) if mus else float("nan"),
                sigma=round(float(np.mean(sigmas)), 3) if sigmas else 0.0,
                threshold=threshold, method=f"{method}(group={group_col})",
                flagged_index=sorted(flagged_positions), detail=merged_detail,
            )
        else:
            rep = zscore_flags(df[col].to_numpy(), col, threshold, method)

        reports[col] = rep
        for pos in rep.flagged_index:
            row_flags[pos] = True
            row_reasons[pos].append(col)

    return OutlierScanResult(row_flags, row_reasons, reports)


def remove_outliers(
    df,
    columns: Sequence[str] = ANALYSIS_OUTLIER_COLS,
    threshold: float = Z_THRESHOLD,
    method: str = "standard",
    group_col: Optional[str] = None,
):
    """분석 테이블 → (이상치 제거된 테이블, 스캔 리포트).

    실험계획서 §4-3 의 Z-score 제거 단계를 한 줄로. run_pipeline 과 테스트가
    동일 로직을 공유하도록 하는 편의 함수.
    """
    cols = [c for c in columns if c in df.columns]
    scan = scan_dataframe(df, cols, threshold=threshold, method=method, group_col=group_col)
    out = df.reset_index(drop=True).copy()
    out["is_outlier"] = scan.row_is_outlier
    out["outlier_reasons"] = [";".join(r) for r in scan.row_reasons]
    clean = out[~out["is_outlier"]].drop(columns=["is_outlier"]).reset_index(drop=True)
    return clean, scan
