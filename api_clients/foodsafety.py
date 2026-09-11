"""
식품안전나라(식품의약품안전처) 공공데이터 오픈 API 클라이언트
==============================================================
https://openapi.foodsafetykorea.go.kr/

URL 규격
    http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}[/파라미터명=값]

용도 (Chrono-Twin)
------------------
· 카페인 함량 조회: 유가빈 파트의 '음료별 mg 표'를 하드코딩 대신 API 로 동적 조회.
  - I2570 (식품영양성분DB): 가공식품 영양성분 + 카페인(mg) 필드 포함
· 조리식품 레시피(COOKRCP01): 데모/헬스체크용으로도 사용

실측 발견 사항 (2026-09-04 테스트)
--------------------------------
· keyId="sample" 로 인증 없이 호출 가능하나 **09~19시(KST) 서비스 제한**:
  I2570 · C002 등은 "09시~19시에는 서비스가 제한됩니다" 응답.
  → 09시 이전 / 19시 이후엔 sample 로도 동작. 상시 사용은 무료 키 발급 필요
    (https://www.foodsafetykorea.go.kr/api/getOpenApiInfo.do — 즉시 발급).
· sample 로 상시 동작 확인된 서비스: COOKRCP01, I0760.
· 응답 최상위 키 = serviceId. 정상: {serviceId:{total_count, row:[...]}}
  오류: {serviceId:{RESULT:{CODE:"ERROR-###", MSG:"..."}}}
· 무료 키 rate limit: 일 50,000건(기관/서비스별 상이).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from ._http import HttpClient, HttpResult

BASE = "http://openapi.foodsafetykorea.go.kr/api"
SAMPLE_KEY = "sample"

# 자주 쓰는 서비스 ID
SERVICE_NUTRITION = "I2570"      # 식품영양성분DB (카페인 mg 포함)
SERVICE_RECIPE = "COOKRCP01"     # 조리식품의 레시피 DB
SERVICE_TRACE = "I0760"          # 식품이력추적 (sample 상시 동작)


class FoodSafetyError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message


@dataclass
class NutritionRow:
    name: str                       # 식품명
    maker: str                      # 제조사/유통사
    serving: str                    # 1회 제공량
    caffeine_mg: Optional[float]    # 카페인(mg) — 없으면 None
    energy_kcal: Optional[float]
    raw: dict

    @classmethod
    def from_api(cls, d: dict) -> "NutritionRow":
        def num(*keys: str) -> Optional[float]:
            for k in keys:
                v = str(d.get(k, "")).strip().replace(",", "")
                if v and v not in {"-", "N/A"}:
                    try:
                        return float(v)
                    except ValueError:
                        continue
            return None
        return cls(
            name=d.get("DESC_KOR") or d.get("FOOD_NM_KR") or d.get("PRDLST_NM", ""),
            maker=d.get("MAKER_NM") or d.get("BSSH_NM", ""),
            serving=d.get("SERVING_SIZE") or d.get("Z10500", ""),
            caffeine_mg=num("CAFFEINE", "NUTR_CONT9", "AMT_NUM13"),
            energy_kcal=num("ENERGY", "NUTR_CONT1", "AMT_NUM1"),
            raw=d,
        )


class FoodSafetyClient:
    def __init__(self, key_id: Optional[str] = None, http: Optional[HttpClient] = None) -> None:
        # 우선순위: 인자 > 환경변수 FOODSAFETY_API_KEY > sample
        self.key_id = key_id or os.environ.get("FOODSAFETY_API_KEY") or SAMPLE_KEY
        self.using_sample = self.key_id == SAMPLE_KEY
        self.http = http or HttpClient()

    # 저수준 -------------------------------------------------------
    def request(
        self,
        service_id: str,
        start: int = 1,
        end: int = 5,
        data_type: str = "json",
        filters: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        url = f"{BASE}/{self.key_id}/{service_id}/{data_type}/{start}/{end}"
        if filters:
            url += "/" + "/".join(f"{k}={v}" for k, v in filters.items())
        res: HttpResult = self.http.get(url)
        if not res.ok or res.json is None:
            raise FoodSafetyError("HTTP", f"status={res.status} {res.error} {res.text[:120]}")
        payload = res.json.get(service_id)
        if payload is None:
            raise FoodSafetyError("SHAPE", f"예상 키 '{service_id}' 없음: {list(res.json)[:3]}")
        result = payload.get("RESULT")
        if result and str(result.get("CODE", "")).upper().startswith("ERROR"):
            raise FoodSafetyError(result.get("CODE", "ERROR"), result.get("MSG", ""))
        # 일부 서비스는 정상도 RESULT.CODE=INFO-000 로 옴 — row 유무로 판단
        return payload

    # 고수준 -------------------------------------------------------
    def search_nutrition(self, food_name: str, limit: int = 10) -> list[NutritionRow]:
        """식품명 부분일치로 영양성분 조회 → 카페인(mg) 파싱."""
        payload = self.request(
            SERVICE_NUTRITION, 1, limit,
            filters={"DESC_KOR": food_name},
        )
        rows = payload.get("row", []) or []
        return [NutritionRow.from_api(r) for r in rows]

    def caffeine_mg_for(self, food_name: str) -> Optional[float]:
        """대표 카페인 함량(mg) 1건. 실험계획서 카페인표를 API 로 교체할 때 사용."""
        for row in self.search_nutrition(food_name, limit=20):
            if row.caffeine_mg is not None:
                return row.caffeine_mg
        return None

    def healthcheck(self) -> HttpResult:
        """sample 키로도 상시 동작하는 COOKRCP01 로 연결/인증 확인."""
        return self.http.get(f"{BASE}/{self.key_id}/{SERVICE_RECIPE}/json/1/1")

    def sample_key_restricted_now(self) -> bool:
        """sample 키의 09~19시 제한에 걸리는지 즉석 확인."""
        try:
            self.request(SERVICE_NUTRITION, 1, 1)
            return False
        except FoodSafetyError as e:
            return "제한" in e.message or e.code == "ERROR-310"
