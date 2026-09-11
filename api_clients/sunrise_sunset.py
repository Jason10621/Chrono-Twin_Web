"""
Sunrise-Sunset API 클라이언트
=============================
https://sunrise-sunset.org/api  —  키 불필요, 무료, 무제한(과도한 호출 자제 요청)

용도 (Chrono-Twin)
------------------
· '아침 자연광 가용 시간' 공변량: 기상 시각 − 일출 시각 → 아침 광 노출 기회
· 일몰~취침 사이 '자연광 없는 저녁 시간대' 길이 → LED/블루라이트 노출의 맥락
· DLMO(멜라토닌 분비 시작) 추정 앵커: 통상 일몰 후 2~3시간

발견 사항 (2026-09-04 실측)
------------------------
· 'Python-urllib/*' UA 는 403 차단. requests / 명시적 UA 는 200
  (_http.HttpClient 가 UA 헤더 처리). 자료조사 때 "안 되던" 원인이 이것.
· formatted=0 이면 ISO8601(UTC) 로 반환됨. KST 변환은 클라이언트에서.
· status 필드가 "OK" 여야 유효. 그 외 "INVALID_REQUEST" 등.
· 무료·무인증·무제한(단, 과도한 트래픽 자제 요청). HTTPS 지원.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from ._http import HttpClient, HttpResult

API_URL = "https://api.sunrise-sunset.org/json"
KST = timezone(timedelta(hours=9))

# 용인한국외국어대학교부설고등학교 좌표 (대략)
YONGIN_HAFS = (37.235, 127.208)


@dataclass
class SolarDay:
    date: str
    lat: float
    lng: float
    sunrise_kst: datetime
    sunset_kst: datetime
    solar_noon_kst: datetime
    civil_twilight_begin_kst: datetime
    civil_twilight_end_kst: datetime
    day_length_min: float

    def morning_light_window_min(self, wake_clock: str) -> float:
        """기상 시각(HH:MM) 이후 '해가 떠 있는' 아침 시간(분). 음수면 기상 전 일출."""
        h, m = map(int, wake_clock.split(":"))
        wake_dt = self.sunrise_kst.replace(hour=h, minute=m, second=0, microsecond=0)
        return round((self.solar_noon_kst - wake_dt).total_seconds() / 60.0, 1)

    def dark_evening_window_min(self, bed_clock: str) -> float:
        """일몰(정확히는 시민박명 종료) ~ 취침 시각 사이 '자연광 없는' 시간(분).
        LED·블루라이트 노출이 생체시계에 미치는 영향이 큰 구간."""
        h, m = map(int, bed_clock.split(":"))
        base = self.civil_twilight_end_kst
        bed_dt = base.replace(hour=h, minute=m, second=0, microsecond=0)
        if h < 12:                       # 자정 넘긴 취침
            bed_dt += timedelta(days=1)
        return round((bed_dt - base).total_seconds() / 60.0, 1)

    def estimated_dlmo_kst(self) -> datetime:
        """DLMO 근사 = 일몰 + 2h (개인차 큼, 앵커용)."""
        return self.sunset_kst + timedelta(hours=2)


def _to_kst(iso_utc: str) -> datetime:
    return datetime.fromisoformat(iso_utc).astimezone(KST)


class SunriseSunsetClient:
    def __init__(self, http: Optional[HttpClient] = None) -> None:
        self.http = http or HttpClient()

    def fetch(self, on_date: str, lat: float = YONGIN_HAFS[0],
              lng: float = YONGIN_HAFS[1]) -> SolarDay:
        res = self.http.get(API_URL, params={
            "lat": lat, "lng": lng, "date": on_date, "formatted": 0,
        })
        if not res.ok or not res.json:
            raise RuntimeError(f"Sunrise-Sunset 요청 실패: status={res.status} err={res.error} {res.text[:120]}")
        if res.json.get("status") != "OK":
            raise RuntimeError(f"Sunrise-Sunset API 상태 비정상: {res.json.get('status')}")
        r = res.json["results"]
        return SolarDay(
            date=on_date, lat=lat, lng=lng,
            sunrise_kst=_to_kst(r["sunrise"]),
            sunset_kst=_to_kst(r["sunset"]),
            solar_noon_kst=_to_kst(r["solar_noon"]),
            civil_twilight_begin_kst=_to_kst(r["civil_twilight_begin"]),
            civil_twilight_end_kst=_to_kst(r["civil_twilight_end"]),
            day_length_min=round(float(r["day_length"]) / 60.0, 1),
        )

    def raw(self, on_date: str, lat: float = YONGIN_HAFS[0],
            lng: float = YONGIN_HAFS[1]) -> HttpResult:
        return self.http.get(API_URL, params={"lat": lat, "lng": lng,
                                              "date": on_date, "formatted": 0})
