"""
Chrono-Twin 데이터 파이프라인 (ULIF 정보학 파트 · 이정욱)
========================================================

  dummy_data  : 더미(합성) 구글 폼 응답 생성
  schema      : Chrono-Twin 수집 스키마 (led_lux · led_color_temp 포함)
  etl         : Extract → Transform → Load (파싱 · 결측 처리 · 파생 피처)
  outliers    : Z-score 이상치 판별 (|Z| > 3.0)
  transforms/ : MCTQ(MSFsc) · 카페인 약동학 · 광생물학(LED)
  correlation : 상관분석 사전 탐색 (§5-2) — 정규성·피어슨/스피어만·다중공선성
  regression  : 다중선형회귀 (β, R², VIF, 표준화 β*)
  run_pipeline: 전 구간 오케스트레이터 + 리포트/그림 출력

사용:
    python -m pipeline.run_pipeline --subjects 40 --days 14
"""
__version__ = "0.2.0"
