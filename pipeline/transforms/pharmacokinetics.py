"""
카페인 약동학 — X2(카페인 잔류 농도) 계산
=========================================

핵심 공식 (실험계획서 §2-3, 유가빈 파트)
    C(t) = C0 × (1/2) ^ (t / t½)
      C0  = 섭취량(mg)
      t   = 섭취 후 경과 시간(h) = (취침 시각 − 섭취 시각)
      t½  = 반감기 ≈ 5.5 h

여러 번 섭취했으면 각 섭취분의 취침 시점 잔류량을 합산한다.
'18시 이후' 섭취만 X2 에 포함(실험계획서 정의). 그 이전 섭취는
당일 수면 압력에 거의 영향이 없다고 보고 제외하되, 원자료에는 남긴다.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from typing import Iterable

HALF_LIFE_H = 5.5
EVENING_CUTOFF = time(18, 0)


@dataclass(frozen=True)
class CaffeineDose:
    taken_at: datetime
    mg: float
    label: str = ""


def residue_at(dose_mg: float, hours_elapsed: float, half_life_h: float = HALF_LIFE_H) -> float:
    """단일 섭취분의 t시간 후 잔류량(mg). 경과시간 음수는 0으로 클립(미래 섭취 방지)."""
    if dose_mg < 0:
        raise ValueError(f"dose_mg 음수: {dose_mg}")
    if hours_elapsed <= 0:
        return float(dose_mg)
    return float(dose_mg) * (0.5 ** (hours_elapsed / half_life_h))


def caffeine_residue_at_bedtime(
    doses: Iterable[CaffeineDose],
    bedtime: datetime,
    half_life_h: float = HALF_LIFE_H,
    evening_only: bool = True,
) -> float:
    """취침 시점 혈중 카페인 잔류 총량(mg) 추산 → 회귀 X2."""
    total = 0.0
    for d in doses:
        if evening_only and d.taken_at.time() < EVENING_CUTOFF:
            continue
        hours = (bedtime - d.taken_at).total_seconds() / 3600.0
        total += residue_at(d.mg, hours, half_life_h)
    return round(total, 2)


def decay_curve(
    dose_mg: float,
    hours: Iterable[float],
    half_life_h: float = HALF_LIFE_H,
) -> list[tuple[float, float]]:
    """(경과시간h, 잔류mg) 시계열 — 대시보드 감쇠 곡선용."""
    return [(float(h), round(residue_at(dose_mg, float(h), half_life_h), 2)) for h in hours]


def doses_from_checklist(
    items: dict[str, int],
    taken_at: datetime,
    caffeine_table_mg: dict[str, float],
) -> list[CaffeineDose]:
    """{'americano': 1, 'energy_drink': 2} + 섭취시각 → CaffeineDose 리스트.
    표에 없는 항목은 무시하고 경고 대신 label 에 '(unknown)' 표시."""
    out: list[CaffeineDose] = []
    for key, count in items.items():
        if count <= 0:
            continue
        mg_each = caffeine_table_mg.get(key)
        if mg_each is None:
            continue
        out.append(CaffeineDose(taken_at=taken_at, mg=mg_each * count, label=f"{key}×{count}"))
    return out
