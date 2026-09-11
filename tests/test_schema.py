"""스키마 파싱·검증 테스트."""
from datetime import date, datetime, time

import pytest

from pipeline.schema import (
    Chronotype,
    DailyRecord,
    DayType,
    SchemaError,
    Sex,
    SubjectProfile,
    combine_night,
    parse_bool,
    parse_clock,
    parse_float,
    schema_markdown_table,
)


@pytest.mark.parametrize("raw,expected", [
    ("23:30", time(23, 30)),
    ("25:30", time(1, 30)),        # 24 넘김 → 접기
    ("1시 40분", time(1, 40)),
    ("오전 1시", time(1, 0)),
    ("오후 11시", time(23, 0)),
    ("0130", time(1, 30)),
    ("1.05", time(1, 5)),
    ("몰라요", None),
    ("", None),
    (None, None),
])
def test_parse_clock(raw, expected):
    assert parse_clock(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("125", 125.0), ("1,250 mg", 1250.0), ("", None), ("없음", None), (3, 3.0),
])
def test_parse_float(raw, expected):
    assert parse_float(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("예", True), ("아니오", False), ("Y", True), ("0", False), ("응?", None),
])
def test_parse_bool(raw, expected):
    assert parse_bool(raw) == expected


def test_combine_night_crosses_midnight():
    onset, wake = combine_night(time(23, 30), time(7, 0), date(2026, 3, 2))
    assert onset == datetime(2026, 3, 2, 23, 30)
    assert wake == datetime(2026, 3, 3, 7, 0)
    assert (wake - onset).total_seconds() / 3600 == 7.5


def test_combine_night_after_midnight_onset():
    onset, wake = combine_night(time(1, 0), time(7, 30), date(2026, 3, 2))
    assert onset.day == 3 and wake.day == 3
    assert (wake - onset).total_seconds() / 60 == 390


def test_subject_profile_rejects_no_consent():
    with pytest.raises(SchemaError):
        SubjectProfile("S1", Chronotype.INTERMEDIATE, 50, 2, Sex.MALE, consent=False)


def test_subject_profile_meq_range():
    with pytest.raises(SchemaError):
        SubjectProfile("S1", Chronotype.INTERMEDIATE, 200, 2, Sex.MALE)


def test_chronotype_offsets_monotonic():
    order = [Chronotype.DEFINITE_MORNING, Chronotype.MODERATE_MORNING,
             Chronotype.INTERMEDIATE, Chronotype.MODERATE_EVENING, Chronotype.DEFINITE_EVENING]
    offs = [SubjectProfile("S", c, 50, 1, Sex.OTHER).chronotype_offset_min for c in order]
    assert offs == sorted(offs)
    assert offs[0] == -90 and offs[-1] == 90


def _daily(**over):
    base = dict(
        record_id="r1", subject_id="S1", survey_date=date(2026, 3, 2),
        day_type=DayType.WORK,
        sleep_onset=datetime(2026, 3, 3, 0, 30), sleep_wake=datetime(2026, 3, 3, 7, 0),
        sleep_duration_min=390.0, bluelight_duration_min=60.0, screen_brightness_ratio=0.6,
        caffeine_intake_mg=80.0, caffeine_last_intake_at=datetime(2026, 3, 2, 20, 0),
        led_lux=150.0, led_color_temp_k=4000, brain_peak_score=9.0, exercised=False,
    )
    base.update(over)
    return DailyRecord(**base)


def test_daily_record_ok():
    dr = _daily()
    assert dr.sleep_onset_clock_min == 24 * 60 + 30      # 00:30 → 1470 (야간 축)
    row = dr.to_row()
    assert row["led_color_temp_k"] == 4000 and row["led_lux"] == 150.0


def test_daily_record_wake_before_onset_raises():
    with pytest.raises(SchemaError):
        _daily(sleep_wake=datetime(2026, 3, 2, 23, 0))


def test_daily_record_brightness_out_of_range():
    with pytest.raises(SchemaError):
        _daily(screen_brightness_ratio=1.4)


def test_hard_range_flag_not_exception():
    dr = _daily(led_lux=9000.0)          # 물리 상한 초과 → 예외 아님, 플래그
    assert any("out_of_hard_range" in f for f in dr.quality_flags)


def test_schema_table_lists_new_led_fields():
    md = schema_markdown_table()
    assert "led_lux" in md and "led_color_temp_k" in md
