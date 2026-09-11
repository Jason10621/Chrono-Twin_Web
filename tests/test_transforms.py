"""MCTQ · 약동학 · 광생물학 파생 계산 테스트."""
import math
from datetime import date, datetime, time

import pytest

from pipeline.transforms import mctq
from pipeline.transforms import pharmacokinetics as pk
from pipeline.transforms import photobiology as photo


# ── MCTQ ────────────────────────────────────────────────────────────
def test_daily_sleep_deficit():
    assert mctq.daily_sleep_deficit(420) == 60      # 7h → 60분 부족
    assert mctq.daily_sleep_deficit(510) == 0       # 8.5h → 부족 없음


def test_rolling_sleep_debt_window():
    durs = [420, 360, 390, 450, 300, 480, 470]      # 부족: 60,120,90,30,180,0,10
    debt = mctq.rolling_sleep_debt(durs, window=5)
    assert debt[:5] == [None] * 5
    assert debt[5] == pytest.approx(60 + 120 + 90 + 30 + 180)   # 480
    assert debt[6] == pytest.approx(120 + 90 + 30 + 180 + 0)    # 420


def test_rolling_sleep_debt_blocks_imputed_window():
    durs = [400] * 7
    valid = [True, True, False, True, True, True, True]
    debt = mctq.rolling_sleep_debt(durs, window=5, valid=valid, max_invalid_in_window=0)
    assert debt[5] is None       # 창(0..4)에 imputed 밤 포함
    assert debt[6] is None       # 창(1..5)에 imputed 밤 포함
    debt2 = mctq.rolling_sleep_debt(durs, window=5, valid=valid, max_invalid_in_window=1)
    assert debt2[5] == pytest.approx(400)   # 1개 허용


def test_msfsc_correction_applied():
    # 등교일 6h(360), 휴일 9h(540), 휴일 취침 02:00(=1560분)
    nights = (
        [mctq.SleepNight(date(2026, 3, 2), 1500, 360, "work") for _ in range(5)]
        + [mctq.SleepNight(date(2026, 3, 7), 1560, 540, "free") for _ in range(2)]
    )
    r = mctq.compute_msfsc("S1", nights, variant="exp_plan")
    assert r.sd_w_min == 360 and r.sd_f_min == 540
    # MSF = 1560 + 540/2 = 1830 ; MSFsc = 1830 - (540-360)/2 = 1740
    assert r.msf_min == pytest.approx(1830)
    assert r.msfsc_min == pytest.approx(1740)
    assert r.correction_applied is True


def test_msfsc_no_correction_when_free_not_longer():
    nights = (
        [mctq.SleepNight(date(2026, 3, 2), 1500, 480, "work") for _ in range(5)]
        + [mctq.SleepNight(date(2026, 3, 7), 1500, 460, "free") for _ in range(2)]
    )
    r = mctq.compute_msfsc("S1", nights)
    assert r.correction_applied is False
    assert r.msfsc_min == pytest.approx(r.msf_min)


def test_msfsc_requires_free_days():
    nights = [mctq.SleepNight(date(2026, 3, 2), 1500, 400, "work")]
    with pytest.raises(ValueError):
        mctq.compute_msfsc("S1", nights)


# ── 약동학 ──────────────────────────────────────────────────────────
def test_residue_half_life():
    assert pk.residue_at(200, 5.5) == pytest.approx(100)          # 1 반감기
    assert pk.residue_at(200, 11.0) == pytest.approx(50)          # 2 반감기
    assert pk.residue_at(200, 0) == 200


def test_residue_matches_exp_plan_example():
    # 실험계획서 §2-3: 200mg, 6h 후 → ≈ 94mg
    assert pk.residue_at(200, 6) == pytest.approx(94, abs=1.5)


def test_caffeine_residue_evening_only_filter():
    bed = datetime(2026, 3, 3, 1, 0)
    doses = [
        pk.CaffeineDose(datetime(2026, 3, 2, 14, 0), 125, "점심 커피"),   # 18시 이전 → 제외
        pk.CaffeineDose(datetime(2026, 3, 2, 21, 0), 80, "에너지드링크"),  # 포함
    ]
    total = pk.caffeine_residue_at_bedtime(doses, bed, evening_only=True)
    # 21:00 → 01:00 = 4h 경과
    assert total == pytest.approx(pk.residue_at(80, 4), abs=0.1)


def test_doses_from_checklist_skips_unknown():
    at = datetime(2026, 3, 2, 20, 0)
    doses = pk.doses_from_checklist({"americano": 2, "mystery": 5}, at, {"americano": 125})
    assert len(doses) == 1 and doses[0].mg == 250


# ── 광생물학 ────────────────────────────────────────────────────────
def test_bluelight_adjusted_matches_report_examples():
    # blAdj = 시간 × (0.4 + 0.8·밝기)  → 밝기 20% ⇒ ×0.56, 100% ⇒ ×1.2
    assert photo.bluelight_adjusted_min(100, 0.2) == pytest.approx(56)
    assert photo.bluelight_adjusted_min(100, 1.0) == pytest.approx(120)


def test_mel_der_monotonic_in_cct():
    assert photo.mel_der(3000) < photo.mel_der(4500) < photo.mel_der(6500)
    assert 0.3 <= photo.mel_der(2700) <= 1.05


def test_melanopic_lux_and_load_increase_with_cct():
    warm = photo.led_evening_load(200, 3000)
    cool = photo.led_evening_load(200, 6000)
    assert cool > warm > 0


def test_assess_lighting_verdicts():
    good = photo.assess_lighting(30, 2700)
    bad = photo.assess_lighting(400, 6500)
    assert "양호" in good.verdict
    assert "경고" in bad.verdict
    assert bad.evening_load > good.evening_load


def test_photobiology_rejects_bad_input():
    with pytest.raises(ValueError):
        photo.mel_der(0)
    with pytest.raises(ValueError):
        photo.bluelight_adjusted_min(-5, 0.5)
