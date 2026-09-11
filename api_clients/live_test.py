"""
무료 API 3종 실제 호출 테스트 + PASS/FAIL 리포트
================================================

    python -m api_clients.live_test [--json] [--date YYYY-MM-DD]

각 API에 대해:
  · 실제 네트워크 호출 수행
  · 응답 구조·값 검증
  · Chrono-Twin 파이프라인에서 쓸 파생값 1개 이상 산출해 보기
  · PASS / WARN / FAIL 판정 + 근거

인증이 필요한 항목(Fitbit)은 토큰이 없으면 '엔드포인트 도달 + 401' 까지만
검증하고 WARN 으로 표시(실패 아님).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable

from ._http import HttpClient
from .fitbit import FitbitClient
from .foodsafety import FoodSafetyClient, FoodSafetyError
from .sunrise_sunset import SunriseSunsetClient, YONGIN_HAFS

RESET, BOLD = "\033[0m", "\033[1m"
GREEN, YELLOW, RED, DIM = "\033[32m", "\033[33m", "\033[31m", "\033[2m"


@dataclass
class Check:
    api: str
    name: str
    status: str = "PASS"           # PASS | WARN | FAIL
    detail: str = ""
    latency_s: float | None = None
    data: dict[str, Any] = field(default_factory=dict)


def _c(status: str) -> str:
    return {"PASS": GREEN, "WARN": YELLOW, "FAIL": RED}.get(status, "") + status + RESET


# ────────────────────────────────────────────────────────────────────
def test_sunrise_sunset(on_date: str) -> list[Check]:
    out: list[Check] = []
    client = SunriseSunsetClient()

    raw = client.raw(on_date)
    out.append(Check(
        "sunrise-sunset", "HTTP 200 + status=OK",
        "PASS" if (raw.ok and raw.json and raw.json.get("status") == "OK") else "FAIL",
        f"status={raw.status}, api_status={(raw.json or {}).get('status')}, attempts={raw.attempts}",
        raw.elapsed_s,
    ))
    # urllib 기본 UA 는 403 으로 차단됨을 재현 (자료조사 때 원인 미상이던 실패의 정체)
    bare = HttpClient(user_agent="Python-urllib/3.14")
    b = bare.get("https://api.sunrise-sunset.org/json",
                 params={"lat": YONGIN_HAFS[0], "lng": YONGIN_HAFS[1], "date": on_date, "formatted": 0})
    out.append(Check(
        "sunrise-sunset", "urllib 기본 UA 차단 재현",
        "PASS" if b.status == 403 else "WARN",
        f"'Python-urllib/*' UA → HTTP {b.status} (requests·curl·명시적 UA 는 200). "
        f"표준 urllib 로 호출하면 403 → 반드시 UA 헤더 지정 필요",
        b.elapsed_s,
    ))

    try:
        day = client.fetch(on_date)
        morning = day.morning_light_window_min("07:00")
        dark_evening = day.dark_evening_window_min("00:30")
        ok = day.day_length_min > 0 and day.sunrise_kst < day.sunset_kst
        out.append(Check(
            "sunrise-sunset", "파생값 산출 (아침 광/저녁 암기)",
            "PASS" if ok else "FAIL",
            f"일출 {day.sunrise_kst:%H:%M} · 일몰 {day.sunset_kst:%H:%M} KST · "
            f"낮길이 {day.day_length_min:.0f}분 | 07:00 기상→정오까지 {morning:.0f}분 · "
            f"00:30 취침 시 암전 저녁 {dark_evening:.0f}분 · DLMO추정 {day.estimated_dlmo_kst():%H:%M}",
            data={"day_length_min": day.day_length_min,
                  "morning_light_min": morning, "dark_evening_min": dark_evening},
        ))
    except Exception as e:
        out.append(Check("sunrise-sunset", "파생값 산출", "FAIL", f"{type(e).__name__}: {e}"))
    return out


def test_foodsafety() -> list[Check]:
    out: list[Check] = []
    client = FoodSafetyClient()
    mode = "sample 키" if client.using_sample else "발급 키"

    hc = client.healthcheck()
    recipe_ok = bool(hc.ok and hc.json and "COOKRCP01" in hc.json)
    total = (hc.json or {}).get("COOKRCP01", {}).get("total_count") if hc.json else None
    out.append(Check(
        "식품안전나라", f"연결/인증 ({mode}) — COOKRCP01",
        "PASS" if recipe_ok else "FAIL",
        f"status={hc.status} total_count={total}",
        hc.elapsed_s,
    ))

    # 카페인 조회 (I2570) — sample 키는 09~19시 제한
    try:
        rows = client.search_nutrition("커피", limit=5)
        caf = next((r for r in rows if r.caffeine_mg is not None), None)
        if caf:
            out.append(Check(
                "식품안전나라", "카페인 함량 조회 (I2570)", "PASS",
                f"{caf.name} · {caf.maker} · 카페인 {caf.caffeine_mg} mg / {caf.serving}",
                data={"food": caf.name, "caffeine_mg": caf.caffeine_mg},
            ))
        else:
            out.append(Check(
                "식품안전나라", "카페인 함량 조회 (I2570)", "WARN",
                f"{len(rows)}건 조회되었으나 카페인 필드 없음 — 다른 검색어 필요",
            ))
    except FoodSafetyError as e:
        restricted = "제한" in e.message or e.code == "ERROR-310"
        out.append(Check(
            "식품안전나라", "카페인 함량 조회 (I2570)",
            "WARN" if restricted else "FAIL",
            (f"sample 키 09~19시(KST) 제한: \"{e.message}\" "
             f"→ 무료 키 발급 시 상시 가능" if restricted else str(e)),
        ))
    return out


def test_fitbit(on_date: str) -> list[Check]:
    out: list[Check] = []
    client = FitbitClient()

    reach = client.endpoint_reachable()
    # 미인증 → 401 이 '정상'
    ok = reach.status in (401, 403)
    out.append(Check(
        "fitbit", "엔드포인트 도달 (미인증 401 기대)",
        "PASS" if ok else "FAIL",
        f"status={reach.status} — {'인증 필요(정상)' if ok else '예상외 응답'} "
        f"{json.dumps((reach.json or {}).get('error', {}), ensure_ascii=False)[:120]}",
        reach.elapsed_s,
    ))

    import os
    if os.environ.get("FITBIT_ACCESS_TOKEN"):
        try:
            s = client.sleep_for(on_date)
            out.append(Check(
                "fitbit", "수면 세션 조회 (인증됨)", "PASS",
                f"{s.date}: {s.minutes_asleep}분 수면 · 효율 {s.efficiency} · "
                f"deep {s.minutes_deep}/rem {s.minutes_rem}",
                data=s.to_chrono_twin_fields(),
            ))
        except Exception as e:
            out.append(Check("fitbit", "수면 세션 조회 (인증됨)", "FAIL", f"{type(e).__name__}: {e}"))
    else:
        oauth_url, _, _ = client.oauth.build_authorize_url()
        out.append(Check(
            "fitbit", "OAuth 흐름 준비", "WARN",
            "FITBIT_ACCESS_TOKEN 미설정 — 실제 데이터 호출 생략. "
            f"동의 URL 생성은 정상: {oauth_url[:90]}…",
        ))
    return out


# ────────────────────────────────────────────────────────────────────
def run_all(on_date: str) -> list[Check]:
    checks: list[Check] = []
    for label, fn in [("Sunrise-Sunset", lambda: test_sunrise_sunset(on_date)),
                      ("식품안전나라", test_foodsafety),
                      ("Fitbit", lambda: test_fitbit(on_date))]:
        try:
            checks += fn()
        except Exception as e:  # 클라이언트 자체 크래시
            checks.append(Check(label, "실행", "FAIL",
                                f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=2)}"))
    return checks


def print_report(checks: list[Check]) -> int:
    print(f"\n{BOLD}Chrono-Twin · 무료 API 3종 실측 테스트{RESET}")
    print(f"{DIM}실행 시각: {dt.datetime.now():%Y-%m-%d %H:%M:%S} (로컬){RESET}\n")
    cur = None
    for c in checks:
        if c.api != cur:
            cur = c.api
            print(f"{BOLD}▸ {cur}{RESET}")
        lat = f" {DIM}{c.latency_s:.2f}s{RESET}" if c.latency_s else ""
        print(f"  [{_c(c.status)}] {c.name}{lat}")
        if c.detail:
            for line in c.detail.splitlines():
                print(f"        {DIM}{line}{RESET}")
    n_pass = sum(c.status == "PASS" for c in checks)
    n_warn = sum(c.status == "WARN" for c in checks)
    n_fail = sum(c.status == "FAIL" for c in checks)
    print(f"\n{BOLD}합계{RESET}  {GREEN}PASS {n_pass}{RESET} · {YELLOW}WARN {n_warn}{RESET} · {RED}FAIL {n_fail}{RESET}")
    print(f"{DIM}WARN = 인증/시간대 제한 등 예상된 조건. FAIL = 실제 문제.{RESET}")
    return 1 if n_fail else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=(dt.date.today() - dt.timedelta(days=1)).isoformat())
    ap.add_argument("--json", action="store_true", help="결과를 JSON 으로 출력")
    args = ap.parse_args(argv)

    checks = run_all(args.date)
    if args.json:
        print(json.dumps([{
            "api": c.api, "name": c.name, "status": c.status,
            "detail": c.detail, "latency_s": c.latency_s, "data": c.data,
        } for c in checks], ensure_ascii=False, indent=2))
        return 1 if any(c.status == "FAIL" for c in checks) else 0
    return print_report(checks)


if __name__ == "__main__":
    sys.exit(main())
