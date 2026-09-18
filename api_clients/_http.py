"""
공용 HTTP 세션 — User-Agent, 타임아웃, 재시도, 레이트리밋 백오프
===============================================================

발견 사항(2026-09-04 실측):
  · api.sunrise-sunset.org 는 'Python-urllib/*' User-Agent 를 403 으로 차단한다
    (requests·curl·명시적 UA 는 200). 표준 라이브러리 urllib 로 그냥 호출하면
    실패 → 반드시 식별 가능한 UA 헤더를 붙인다.
  · 식품안전나라 sample 키는 09~19시(KST) 일부 서비스가 제한된다("ERROR-310").
    → 429/5xx 뿐 아니라 애플리케이션 레벨 에러도 재시도 대상에 포함.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

import requests

DEFAULT_UA = "ULIF-ChronoTwin/0.2 (high-school research; contact: ulif.team@example.org)"
DEFAULT_TIMEOUT = 15.0


@dataclass
class HttpResult:
    ok: bool
    status: int
    url: str
    elapsed_s: float
    json: Optional[Any] = None
    text: str = ""
    error: str = ""
    attempts: int = 1


class HttpClient:
    def __init__(
        self,
        user_agent: str = DEFAULT_UA,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = 3,
        backoff_base_s: float = 1.5,
    ) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent, "Accept": "application/json"})
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base_s = backoff_base_s

    def get(
        self,
        url: str,
        params: Optional[dict] = None,
        headers: Optional[dict] = None,
        parse_json: bool = True,
        retry_on: tuple[int, ...] = (429, 500, 502, 503, 504),
    ) -> HttpResult:
        last_err = ""
        for attempt in range(1, self.max_retries + 1):
            t0 = time.monotonic()
            try:
                r = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
                elapsed = time.monotonic() - t0
            except requests.RequestException as e:
                last_err = f"{type(e).__name__}: {e}"
                self._sleep(attempt)
                continue

            body_json = None
            if parse_json:
                try:
                    body_json = r.json()
                except ValueError:
                    body_json = None

            if r.status_code in retry_on and attempt < self.max_retries:
                last_err = f"HTTP {r.status_code} (재시도 대상)"
                self._sleep(attempt, retry_after=r.headers.get("Retry-After"))
                continue

            return HttpResult(
                ok=r.ok,
                status=r.status_code,
                url=r.url,
                elapsed_s=round(elapsed, 3),
                json=body_json,
                text=r.text if body_json is None else "",
                error="" if r.ok else f"HTTP {r.status_code}",
                attempts=attempt,
            )

        return HttpResult(ok=False, status=0, url=url, elapsed_s=0.0,
                          error=last_err or "요청 실패", attempts=self.max_retries)

    def post(self, url: str, data: Optional[dict] = None, headers: Optional[dict] = None,
             parse_json: bool = True) -> HttpResult:
        t0 = time.monotonic()
        try:
            r = self.session.post(url, data=data, headers=headers, timeout=self.timeout)
        except requests.RequestException as e:
            return HttpResult(False, 0, url, round(time.monotonic() - t0, 3),
                              error=f"{type(e).__name__}: {e}")
        body_json = None
        if parse_json:
            try:
                body_json = r.json()
            except ValueError:
                body_json = None
        return HttpResult(r.ok, r.status_code, r.url, round(time.monotonic() - t0, 3),
                          json=body_json, text=r.text if body_json is None else "",
                          error="" if r.ok else f"HTTP {r.status_code}")

    def _sleep(self, attempt: int, retry_after: Optional[str] = None) -> None:
        if retry_after:
            try:
                time.sleep(min(float(retry_after), 30))
                return
            except (TypeError, ValueError):
                pass
        time.sleep(self.backoff_base_s ** attempt)
