"""
Fitbit Web API 클라이언트 (OAuth 2.0 Authorization Code + PKCE)
=============================================================
https://dev.fitbit.com/build/reference/web-api/

용도 (Chrono-Twin) — 이정욱 자료조사 "웨어러블 오픈 API 연동"
  · 수면 세션: 수면 단계(N1/N2/N3/REM), 입면·기상 시각, 효율
  · 심박수: 수면 중 HR 변화, 안정시 심박수(RHR)
  · 활동: 걸음수 → 운동 여부(공변량) 교차검증

인증 구조
  스마트폰/서버가 아닌 '고교 연구' 맥락이므로 PKCE(Proof Key for Code Exchange)
  방식이 안전하다(클라이언트 시크릿 없이 동작 가능).
    1) build_authorize_url() 로 사용자 브라우저에서 동의
    2) 리디렉트로 받은 code → exchange_code() 로 access/refresh 토큰
    3) 토큰 만료(8h) 시 refresh()
  ※ 토큰 발급/저장은 사용자 개입이 필요 — 자동 테스트에서는 '엔드포인트 도달 +
    미인증 401' 까지만 검증하고, 실제 호출은 FITBIT_ACCESS_TOKEN 환경변수가
    있을 때만 수행한다.

발견 사항 (2026-09-04 테스트)
  · api.fitbit.com 은 미인증 시 401 UNAUTHENTICATED (Google 인증 게이트웨이 경유).
    → 엔드포인트 생존 확인용으로 이 401 을 '정상'으로 간주.
  · Rate limit: 사용자당 시간당 150 requests.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
import urllib.parse
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from ._http import HttpClient, HttpResult

AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
TOKEN_URL = "https://api.fitbit.com/oauth2/token"
API_BASE = "https://api.fitbit.com"

DEFAULT_SCOPES = ("sleep", "heartrate", "activity", "profile", "settings")
TOKEN_STORE = Path(__file__).parent / ".fitbit_token.json"   # gitignore 대상


# ────────────────────────────────────────────────────────────────────
# PKCE 유틸
# ────────────────────────────────────────────────────────────────────
def make_pkce_pair() -> tuple[str, str]:
    """(code_verifier, code_challenge) — S256."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


@dataclass
class FitbitToken:
    access_token: str
    refresh_token: str
    scope: str
    token_type: str
    user_id: str
    expires_at: float          # epoch seconds

    @property
    def expired(self) -> bool:
        return time.time() >= self.expires_at - 60

    @classmethod
    def from_response(cls, d: dict) -> "FitbitToken":
        return cls(
            access_token=d["access_token"],
            refresh_token=d["refresh_token"],
            scope=d.get("scope", ""),
            token_type=d.get("token_type", "Bearer"),
            user_id=d.get("user_id", ""),
            expires_at=time.time() + float(d.get("expires_in", 28800)),
        )

    def save(self, path: Path = TOKEN_STORE) -> None:
        path.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path = TOKEN_STORE) -> Optional["FitbitToken"]:
        if not path.exists():
            return None
        return cls(**json.loads(path.read_text(encoding="utf-8")))


# ────────────────────────────────────────────────────────────────────
# OAuth 흐름
# ────────────────────────────────────────────────────────────────────
class FitbitOAuth:
    def __init__(self, client_id: Optional[str] = None,
                 redirect_uri: str = "http://localhost:8080/callback",
                 http: Optional[HttpClient] = None) -> None:
        self.client_id = client_id or os.environ.get("FITBIT_CLIENT_ID", "")
        self.redirect_uri = redirect_uri
        self.http = http or HttpClient()

    def build_authorize_url(self, scopes: tuple[str, ...] = DEFAULT_SCOPES) -> tuple[str, str, str]:
        """returns (authorize_url, code_verifier, state).
        code_verifier·state 는 콜백 검증 때까지 보관."""
        verifier, challenge = make_pkce_pair()
        state = secrets.token_urlsafe(16)
        q = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(scopes),
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
        }
        return f"{AUTH_URL}?{urllib.parse.urlencode(q)}", verifier, state

    def exchange_code(self, code: str, code_verifier: str) -> FitbitToken:
        res = self.http.post(TOKEN_URL, data={
            "client_id": self.client_id,
            "grant_type": "authorization_code",
            "redirect_uri": self.redirect_uri,
            "code": code,
            "code_verifier": code_verifier,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        return self._token_or_raise(res)

    def refresh(self, token: FitbitToken) -> FitbitToken:
        res = self.http.post(TOKEN_URL, data={
            "client_id": self.client_id,
            "grant_type": "refresh_token",
            "refresh_token": token.refresh_token,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        return self._token_or_raise(res)

    @staticmethod
    def _token_or_raise(res: HttpResult) -> FitbitToken:
        if not res.ok or not res.json:
            raise RuntimeError(f"토큰 요청 실패: status={res.status} {res.text[:200]} {res.json}")
        return FitbitToken.from_response(res.json)


# ────────────────────────────────────────────────────────────────────
# 데이터 클라이언트
# ────────────────────────────────────────────────────────────────────
@dataclass
class SleepSummary:
    date: str
    onset: Optional[str]
    wake: Optional[str]
    minutes_asleep: Optional[int]
    efficiency: Optional[int]
    minutes_deep: Optional[int]
    minutes_light: Optional[int]
    minutes_rem: Optional[int]
    minutes_wake: Optional[int]

    def to_chrono_twin_fields(self) -> dict[str, Any]:
        """Chrono-Twin DailyRecord 필드로 매핑 (sleep_onset/sleep_wake 소스)."""
        return {
            "sleep_onset": self.onset,
            "sleep_wake": self.wake,
            "sleep_duration_min": self.minutes_asleep,
            "_fitbit_efficiency": self.efficiency,
            "_fitbit_stage_min": {
                "deep": self.minutes_deep, "light": self.minutes_light,
                "rem": self.minutes_rem, "wake": self.minutes_wake,
            },
        }


class FitbitClient:
    def __init__(self, token: Optional[FitbitToken] = None,
                 oauth: Optional[FitbitOAuth] = None,
                 http: Optional[HttpClient] = None) -> None:
        self.token = token
        self.oauth = oauth or FitbitOAuth(http=http)
        self.http = http or HttpClient()

    # 인증 헤더 (필요 시 자동 refresh) --------------------------------
    def _auth_headers(self) -> dict[str, str]:
        if self.token is None:
            env = os.environ.get("FITBIT_ACCESS_TOKEN")
            if env:
                return {"Authorization": f"Bearer {env}"}
            raise RuntimeError("Fitbit 토큰 없음 — FITBIT_ACCESS_TOKEN 환경변수 또는 OAuth 필요")
        if self.token.expired:
            self.token = self.oauth.refresh(self.token)
            self.token.save()
        return {"Authorization": f"Bearer {self.token.access_token}"}

    def _get(self, path: str) -> HttpResult:
        return self.http.get(f"{API_BASE}{path}", headers=self._auth_headers())

    # 엔드포인트 ---------------------------------------------------
    def sleep_for(self, on_date: date | str) -> SleepSummary:
        d = on_date.isoformat() if isinstance(on_date, date) else on_date
        res = self._get(f"/1.2/user/-/sleep/date/{d}.json")
        if not res.ok or not res.json:
            raise RuntimeError(f"수면 조회 실패: {res.status} {res.error}")
        return self._parse_sleep(d, res.json)

    def resting_heart_rate(self, on_date: date | str) -> Optional[int]:
        d = on_date.isoformat() if isinstance(on_date, date) else on_date
        res = self._get(f"/1/user/-/activities/heart/date/{d}/1d.json")
        if not res.ok or not res.json:
            return None
        arr = res.json.get("activities-heart", [])
        if arr and arr[0].get("value", {}).get("restingHeartRate"):
            return int(arr[0]["value"]["restingHeartRate"])
        return None

    def steps(self, on_date: date | str) -> Optional[int]:
        d = on_date.isoformat() if isinstance(on_date, date) else on_date
        res = self._get(f"/1/user/-/activities/date/{d}.json")
        if not res.ok or not res.json:
            return None
        return int(res.json.get("summary", {}).get("steps", 0))

    @staticmethod
    def _parse_sleep(d: str, payload: dict) -> SleepSummary:
        main = next((s for s in payload.get("sleep", []) if s.get("isMainSleep")), None) \
            or (payload.get("sleep") or [None])[0]
        summ = payload.get("summary", {})
        stages = summ.get("stages", {}) if isinstance(summ, dict) else {}
        if not main:
            return SleepSummary(d, None, None, None, None, None, None, None, None)
        return SleepSummary(
            date=d,
            onset=main.get("startTime"),
            wake=main.get("endTime"),
            minutes_asleep=main.get("minutesAsleep"),
            efficiency=main.get("efficiency"),
            minutes_deep=stages.get("deep"),
            minutes_light=stages.get("light"),
            minutes_rem=stages.get("rem"),
            minutes_wake=stages.get("wake"),
        )

    # 헬스체크: 미인증이어도 엔드포인트 생존 확인 --------------------
    def endpoint_reachable(self) -> HttpResult:
        """토큰 없이 호출 → 401 이면 '엔드포인트 정상 + 인증 필요'."""
        return self.http.get(f"{API_BASE}/1.2/user/-/sleep/date/2024-01-01.json")
