# 외부 API 클라이언트 — 무료 API 3종 실측 검증

지난 자료조사에서 후보로 잡은 무료 API 3종이 **실제로 되는지 코드로 확인**한 결과와,
Chrono-Twin 파이프라인에 물릴 수 있는 형태의 클라이언트.

```bash
pip install requests
python -m api_clients.live_test           # 3종 실제 호출 + PASS/WARN/FAIL 리포트
python -m api_clients.live_test --json     # 기계 판독용
```

## 1. Sunrise-Sunset  (`sunrise_sunset.py`)

| 항목 | 값 |
|---|---|
| 엔드포인트 | `https://api.sunrise-sunset.org/json` |
| 인증 | **불필요** · 무료 · 무제한(과도 호출 자제) |
| 상태 | ✅ **동작 확인** |

- **핵심 발견**: `Python-urllib/*` User-Agent 는 **403 차단**. `requests`·`curl`·명시적 UA 는 200.
  → 자료조사 때 "안 되던" 원인이 이것. 표준 `urllib` 로 호출하면 실패하므로 **UA 헤더 필수**.
- 파생값: `morning_light_window_min` (기상~정오 아침 광 시간), `dark_evening_window_min`
  (시민박명 종료~취침, LED/블루라이트 영향 큰 구간), `estimated_dlmo_kst` (일몰+2h).
- 용인한국외대부고 좌표 기본값 내장 (`YONGIN_HAFS`).

## 2. 식품안전나라 (식약처 오픈 API)  (`foodsafety.py`)

| 항목 | 값 |
|---|---|
| 엔드포인트 | `http://openapi.foodsafetykorea.go.kr/api/{key}/{serviceId}/json/{start}/{end}` |
| 인증 | `sample` 키 또는 무료 발급 키(`FOODSAFETY_API_KEY`) |
| 상태 | ⚠️ **부분 동작** (아래) |

- `sample` 키로 **상시 동작**: `COOKRCP01`(레시피), `I0760`.
- `sample` 키 **09~19시(KST) 제한**: `I2570`(식품영양성분DB·카페인 mg 포함), `C002` 등
  → `"09시~19시에는 서비스가 제한됩니다"` 응답. **무료 키 발급 시 상시 사용 가능**
  ([즉시 발급](https://www.foodsafetykorea.go.kr/api/getOpenApiInfo.do)).
- 용도: 유가빈 파트의 음료별 카페인 mg 표를 하드코딩 대신 API 로 동적 조회
  (`FoodSafetyClient.caffeine_mg_for("아메리카노")`).
- 응답 형태: 정상 `{serviceId:{total_count,row:[...]}}`, 오류 `{serviceId:{RESULT:{CODE:"ERROR-###"}}}`.

## 3. Fitbit Web API  (`fitbit.py`)

| 항목 | 값 |
|---|---|
| 엔드포인트 | `https://api.fitbit.com` |
| 인증 | **OAuth 2.0 Authorization Code + PKCE** (`FITBIT_CLIENT_ID`) |
| 상태 | ✅ **엔드포인트 생존 확인** (미인증 401), 실데이터는 사용자 동의 필요 |

- 미인증 호출 → `401 UNAUTHENTICATED` (Google 인증 게이트웨이 경유). 엔드포인트 정상.
- 흐름: `build_authorize_url()` → 브라우저 동의 → `exchange_code()` → `refresh()` (토큰 8h).
  토큰은 `.fitbit_token.json` 에 저장(gitignore).
- 수집: 수면 단계(N1/N2/N3/REM)·효율·입면/기상 시각, 안정시 심박수, 걸음수.
  `SleepSummary.to_chrono_twin_fields()` 로 `DailyRecord` 필드에 매핑.
- 자동 테스트: `FITBIT_ACCESS_TOKEN` 환경변수가 있으면 실제 수면 호출까지 수행.

## 실측 리포트 (2026-09-04 16:52 KST 실행)

```
▸ sunrise-sunset
  [PASS] HTTP 200 + status=OK
  [PASS] urllib 기본 UA 차단 재현 (403)
  [PASS] 파생값 산출 — 일출 06:01 · 일몰 18:59 KST · DLMO추정 20:59
▸ 식품안전나라
  [PASS] 연결/인증 (sample 키) — COOKRCP01  total_count=1156
  [WARN] 카페인 함량 조회 (I2570) — sample 키 09~19시 제한 → 무료 키 필요
▸ fitbit
  [PASS] 엔드포인트 도달 (미인증 401)
  [WARN] OAuth 흐름 준비 — FITBIT_ACCESS_TOKEN 미설정, 동의 URL 생성은 정상

합계  PASS 5 · WARN 2 · FAIL 0
```

`WARN` = 인증 미설정·시간대 제한 등 **예상된 조건**. `FAIL` = 실제 문제(없음).
