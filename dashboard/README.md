# Chrono-Twin 파이프라인 콘솔 (대시보드 목업)

파이프라인 결과를 한 화면에 보여주는 대시보드. **더미(합성) 데이터**로 미리 제작.
외부 차트 라이브러리 없이 순수 SVG 로 렌더.

## 빌드

```bash
python dashboard/build.py
```

`index.template.html` + `mock_data.json` → **단일 파일 `index.html`** (JSON 인라인 삽입).
파일을 브라우저로 바로 열거나, Claude Artifact 로 게시 가능(래퍼 없는 아티팩트 네이티브 형식).

`mock_data.json` 이 없으면 빌드가 `python -m pipeline.export_dashboard` 를 먼저 실행.

## 패널

| # | 패널 | 내용 |
|---|---|---|
| 01 | 실행 개요 | 정제 표본 · 이상치 제거 · 통합 R² · MSFsc 중앙값 · 자체검증 |
| 02 | ETL | 필드별 결측 대체·파싱 실패 막대, 처리 로그 |
| 03 | 수집 스키마 | 필드 표 — `led_lux`·`led_color_temp` v0.2 강조 |
| 04 | **상관분석 (§5-2)** | 정규성 검정 → 계수 선택, Y~Xₖ Pearson/Spearman 막대, 피어슨·스피어만 토글 히트맵, `|r|>0.8` 다중공선성 경보 |
| 05 | 다중선형회귀 (§5-3) | 6개 모형 비교표, within 모형 β* 막대, VIF·자체검증, H4 판정 |
| 06 | **LED 조명 환경 (신규)** | 색온도×조도 저녁 부하 히트맵, mel-DER 곡선, 4개 평가 카드 |
| 07 | MSFsc | 피험자별 보정 중간수면시각 정렬 차트 |
| 08 | 분포·카페인 | 변수 히스토그램, 카페인 반감기 곡선 |

## 실데이터 전환

실험 데이터 수집 후 `pipeline.export_dashboard` 를 실제 구글 폼 CSV 로 돌리면
`mock_data.json` 이 갱신되고, `build.py` 재실행으로 대시보드가 그대로 반영됨
(`meta.is_mock` 가 `false` 로 바뀜).

## 디자인

ULIF 수면위상 시뮬레이터와 동일 계열 — 다크 콘솔, IBM Plex Mono + Noto Sans KR,
teal/blue/amber 액센트. 계기판 성격이라 단일(다크) 테마로 커밋.
