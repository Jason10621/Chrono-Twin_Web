"""
광생물학 보정 — X1(스마트폰 블루라이트) + LED 조명 환경(신규)
=============================================================

1) 스마트폰 블루라이트 보정  (활동보고서 3-2, 생명공학 파트)
       blAdj = 노출시간(분) × (0.4 + 0.8 × 밝기비율)
     · 밝기 20%  → 노출 효과 56 %
     · 밝기 100% → 노출 효과 120 %

2) LED 조명 환경 → 멜라토닌 억제 압력 (신규, led_lux · led_color_temp 사용)
   근거: 전윤서 파트 "6200K 가 3000K 보다 어린이에서 유의하게 큰 멜라토닌 억제",
        홍서준 파트 "446–477 nm 단파장에서 억제 최대".

   (a) mel-DER (melanopic Daylight Efficacy Ratio) 를 CCT 의 1차 근사로:
          mDER(CCT) ≈ 0.45 + (CCT − 2700) × (0.90 − 0.45) / (6500 − 2700)
          → 2700K≈0.45,  4000K≈0.60,  6500K≈0.90   (physiologically plausible, [0.3, 1.05] 클립)
   (b) melanopic lux = led_lux × mDER
   (c) 저녁 멜라토닌 억제 압력 (Zeisler 계열 로그-선형 용량반응):
          load = log10(1 + melanopic_lux / LUX_HALF)          , LUX_HALF = 100
   (d) 청소년 취약성 가중 (전윤서: 성인 대비 큰 억제) → × ADOLESCENT_GAIN

   주의: 이 계수들은 고교 연구 모듈용 '스케일링 근사'이며 임상 측정값이 아니다
   (팀 활동보고서가 β 계수를 '선행연구 기반 스케일링' 으로 규정한 것과 동일 원칙).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# 블루라이트 보정 계수
BL_BASE = 0.4
BL_BRIGHTNESS_GAIN = 0.8

# LED 멜라토닌 모델 상수
CCT_REF_LOW, CCT_REF_HIGH = 2700, 6500
MDER_AT_LOW, MDER_AT_HIGH = 0.45, 0.90
MDER_CLIP = (0.30, 1.05)
LUX_HALF = 100.0
ADOLESCENT_GAIN = 1.15


def bluelight_adjusted_min(duration_min: float, brightness_ratio: float) -> float:
    """스마트폰 블루라이트 유효 노출량(분). 회귀 X1."""
    if duration_min < 0:
        raise ValueError(f"duration_min 음수: {duration_min}")
    b = min(1.0, max(0.0, brightness_ratio))
    return round(duration_min * (BL_BASE + BL_BRIGHTNESS_GAIN * b), 2)


def mel_der(color_temp_k: float) -> float:
    """상관색온도(K) → mel-DER 근사값."""
    if color_temp_k <= 0:
        raise ValueError(f"color_temp_k 비정상: {color_temp_k}")
    slope = (MDER_AT_HIGH - MDER_AT_LOW) / (CCT_REF_HIGH - CCT_REF_LOW)
    raw = MDER_AT_LOW + (color_temp_k - CCT_REF_LOW) * slope
    return round(min(MDER_CLIP[1], max(MDER_CLIP[0], raw)), 4)


def melanopic_lux(led_lux: float, color_temp_k: float) -> float:
    """실내 조도 + 색온도 → 멜라놉틱(생체시계 유효) 조도."""
    if led_lux < 0:
        raise ValueError(f"led_lux 음수: {led_lux}")
    return round(led_lux * mel_der(color_temp_k), 2)


def led_evening_load(
    led_lux: float,
    color_temp_k: float,
    adolescent: bool = True,
) -> float:
    """저녁 LED 조명에 의한 멜라토닌 억제 압력 지수(로그 스케일, 0~ ~1.5)."""
    m_lux = melanopic_lux(led_lux, color_temp_k)
    load = math.log10(1.0 + m_lux / LUX_HALF)
    if adolescent:
        load *= ADOLESCENT_GAIN
    return round(load, 4)


@dataclass
class LightingAssessment:
    led_lux: float
    color_temp_k: int
    mel_der: float
    melanopic_lux: float
    evening_load: float
    verdict: str
    recommendation: str


def assess_lighting(led_lux: float, color_temp_k: int, adolescent: bool = True) -> LightingAssessment:
    """대시보드 카드용 종합 평가 — 윤지후 HCL 제언과 연결되는 문구 생성."""
    m_der = mel_der(color_temp_k)
    m_lux = melanopic_lux(led_lux, color_temp_k)
    load = led_evening_load(led_lux, color_temp_k, adolescent)

    if load < 0.35:
        verdict = "양호 — 저녁 조명 환경이 멜라토닌 분비를 크게 방해하지 않음"
        rec = "현 수준 유지. 취침 1시간 전 추가로 조도를 낮추면 이상적."
    elif load < 0.75:
        verdict = "주의 — 저녁 조명이 위상 지연에 중간 정도 기여"
        rec = "취침 2시간 전부터 3000K 이하 · 100 lux 이하로 전환 권장 (HCL 저녁 모드)."
    else:
        verdict = "경고 — 고색온도·고조도 조명이 멜라토닌을 강하게 억제"
        rec = "취침 전 청색광 강한 전등 소등, 간접 조명(2700K)만 사용. 정책 파트 HCL 제언의 근거 구간."

    return LightingAssessment(
        led_lux=round(led_lux, 1),
        color_temp_k=int(color_temp_k),
        mel_der=m_der,
        melanopic_lux=m_lux,
        evening_load=load,
        verdict=verdict,
        recommendation=rec,
    )
