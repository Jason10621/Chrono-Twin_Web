"""
Chrono-Twin 외부 API 클라이언트 (EURIF 정보학 파트)
==================================================

무료 API 3종 — 지난 자료조사에서 "실제로 되는지" 코드로 검증한 결과 반영:

  sunrise_sunset : api.sunrise-sunset.org   (키 불필요, 무료)  → 아침 광 가용시간
  foodsafety     : 식품안전나라 오픈 API     (sample 또는 무료 키) → 카페인 함량
  fitbit         : Fitbit Web API (OAuth2 PKCE)               → 수면 단계·심박·활동

실행:
    python -m api_clients.live_test          # 3종 실제 호출 + PASS/FAIL 리포트
"""
from ._http import HttpClient, HttpResult  # noqa: F401
from .foodsafety import FoodSafetyClient  # noqa: F401
from .fitbit import FitbitClient, FitbitOAuth, FitbitToken  # noqa: F401
from .sunrise_sunset import SunriseSunsetClient  # noqa: F401
