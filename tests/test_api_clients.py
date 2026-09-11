"""
API 클라이언트 테스트
=====================
· 순수 로직(파싱·PKCE·태양 기하) : 항상 실행
· 실제 네트워크 호출              : @pytest.mark.live — 실패 시 skip (오프라인 대비)

    pytest tests/test_api_clients.py                # 로직만
    pytest tests/test_api_clients.py -m live        # 네트워크 포함
"""
from datetime import datetime, timezone, timedelta

import pytest

from api_clients.fitbit import FitbitClient, FitbitOAuth, FitbitToken, make_pkce_pair
from api_clients.foodsafety import FoodSafetyClient, NutritionRow
from api_clients.sunrise_sunset import SolarDay, SunriseSunsetClient

KST = timezone(timedelta(hours=9))


# ── 순수 로직 ───────────────────────────────────────────────────────
def test_pkce_pair_valid():
    v, c = make_pkce_pair()
    assert 43 <= len(v) <= 128
    assert "=" not in c and "+" not in c and "/" not in c   # URL-safe, unpadded


def test_pkce_pair_unique():
    assert make_pkce_pair()[0] != make_pkce_pair()[0]


def test_fitbit_authorize_url():
    oauth = FitbitOAuth(client_id="ABC123", redirect_uri="http://localhost:8080/cb")
    url, verifier, state = oauth.build_authorize_url(scopes=("sleep", "heartrate"))
    assert url.startswith("https://www.fitbit.com/oauth2/authorize?")
    assert "code_challenge_method=S256" in url
    assert "client_id=ABC123" in url
    assert "scope=sleep+heartrate" in url
    assert verifier and state


def test_fitbit_token_expiry():
    tok = FitbitToken("a", "r", "sleep", "Bearer", "U1", expires_at=0)
    assert tok.expired is True
    tok2 = FitbitToken.from_response({"access_token": "a", "refresh_token": "r",
                                      "expires_in": 28800, "user_id": "U1"})
    assert tok2.expired is False


def test_fitbit_sleep_parse():
    payload = {
        "sleep": [{
            "isMainSleep": True, "startTime": "2026-03-02T00:41:00.000",
            "endTime": "2026-03-02T07:12:00.000", "minutesAsleep": 372, "efficiency": 91,
        }],
        "summary": {"stages": {"deep": 60, "light": 210, "rem": 80, "wake": 25}},
    }
    s = FitbitClient._parse_sleep("2026-03-02", payload)
    assert s.minutes_asleep == 372 and s.minutes_rem == 80
    cf = s.to_chrono_twin_fields()
    assert cf["sleep_onset"].startswith("2026-03-02T00:41")


def test_nutrition_row_caffeine_parse():
    row = NutritionRow.from_api({
        "DESC_KOR": "아메리카노(테이크아웃)", "MAKER_NM": "OO커피",
        "SERVING_SIZE": "355", "CAFFEINE": "150", "ENERGY": "10",
    })
    assert row.caffeine_mg == 150.0 and row.energy_kcal == 10.0


def test_nutrition_row_missing_caffeine():
    row = NutritionRow.from_api({"DESC_KOR": "생수", "SERVING_SIZE": "500"})
    assert row.caffeine_mg is None


def test_solar_day_derived_windows():
    d = SolarDay(
        date="2026-03-02", lat=37.2, lng=127.2,
        sunrise_kst=datetime(2026, 3, 2, 6, 50, tzinfo=KST),
        sunset_kst=datetime(2026, 3, 2, 18, 20, tzinfo=KST),
        solar_noon_kst=datetime(2026, 3, 2, 12, 35, tzinfo=KST),
        civil_twilight_begin_kst=datetime(2026, 3, 2, 6, 24, tzinfo=KST),
        civil_twilight_end_kst=datetime(2026, 3, 2, 18, 46, tzinfo=KST),
        day_length_min=690.0,
    )
    # 07:00 기상 → 정오까지 약 335분의 아침 시간
    assert d.morning_light_window_min("07:00") == pytest.approx(335, abs=1)
    # 00:30 취침 → 18:46 시민박명 종료부터 약 5h44m
    assert d.dark_evening_window_min("00:30") == pytest.approx(344, abs=1)
    assert d.estimated_dlmo_kst().hour == 20


def test_foodsafety_client_defaults_to_sample():
    c = FoodSafetyClient()
    assert c.using_sample is True


# ── 네트워크 (live) ────────────────────────────────────────────────
@pytest.mark.live
def test_live_sunrise_sunset():
    try:
        day = SunriseSunsetClient().fetch("2026-06-21")   # 하지
    except Exception as e:
        pytest.skip(f"네트워크 불가: {e}")
    assert day.day_length_min > 13 * 60          # 하지엔 낮이 길다
    assert day.sunrise_kst < day.solar_noon_kst < day.sunset_kst


@pytest.mark.live
def test_live_foodsafety_recipe():
    try:
        hc = FoodSafetyClient().healthcheck()
    except Exception as e:
        pytest.skip(f"네트워크 불가: {e}")
    assert hc.ok and hc.json and "COOKRCP01" in hc.json


@pytest.mark.live
def test_live_fitbit_endpoint_reachable():
    try:
        r = FitbitClient().endpoint_reachable()
    except Exception as e:
        pytest.skip(f"네트워크 불가: {e}")
    assert r.status in (401, 403)     # 미인증이면 401 이 정상
