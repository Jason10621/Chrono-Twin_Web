# Chrono-Twin

EURIF 다학제 융합 연구 — 수면 위상 지연 다중변수 예측 모형의 데이터 플랫폼.
**정보학 파트(이정욱)**: 데이터 수집 파이프라인 · 통계 분석 · 3D/대시보드 시각화.

```
Chrono-Twin_Web/
├── pipeline/         ETL · Z-score · MSFsc · 다중선형회귀  (더미 데이터로 검증 완료)
│   └── outputs/      실행 산출물 (CSV · 리포트 · 그림)
├── api_clients/      무료 API 3종 클라이언트 + 실측 테스트
│   └── live_test.py  →  python -m api_clients.live_test
├── dashboard/        파이프라인 콘솔 (목업 데이터, 순수 SVG)
│   └── index.html    →  브라우저로 바로 열기
├── backend/          FastAPI — 수집 스키마 v0.2 (led_lux·led_color_temp) · 분석 엔드포인트
├── frontend/         Next.js — 3D Chrono-Twin 아바타 · 세계 시차 지도 · 정책 대시보드 링크
│   └── public/dashboard.html   dashboard/index.html 사본 (로컬 서빙용, /dashboard.html)
└── tests/            pytest 81개 (스키마 · 파생계산 · ETL · 상관분석 · 이상치 · API)
```

## 빠른 시작

```bash
pip install -r pipeline/requirements.txt

python -m pipeline.run_pipeline          # 파이프라인 전 구간 (더미 40명×14일)
python -m api_clients.live_test          # 무료 API 3종 실제 호출 테스트
python -m pytest                         # 전체 테스트 (81개)
python dashboard/build.py                # 대시보드 재생성
```

프론트엔드(3D 아바타 인터랙티브 데모)는 별도로 실행:

```bash
cd frontend
npm install
npm run dev                              # http://localhost:3000
```

## 수집 스키마 v0.2.0

원본 6필드(`user_id`, `sleep_onset`, `sleep_wake`, `caffeine_intake`,
`bluelight_duration`, `brain_peak_score`) + **조명 환경 2필드**:

| 필드 | 타입 | 근거 |
|---|---|---|
| `led_lux` | float (lux) | 윤지후(정책) HCL 제언 — 취침 전 실내 조도 |
| `led_color_temp` | int (K) | 전윤서(생명공학) 6200K vs 3000K 멜라토닌 억제 차이 |

파생: `led_melanopic_lux = led_lux × mel-DER(CCT)`,
`led_evening_load = log₁₀(1 + melanopic_lux/100) × 1.15` (청소년 가중).

## 핵심 알고리즘 (실험계획서 대응)

| 항목 | 위치 | 공식 |
|---|---|---|
| 이상치 제거 | `pipeline/outliers.py` | `|Z| = |X−μ|/σ > 3.0` (+ 물리 하드범위 우선) |
| 상관분석 §5-2 | `pipeline/correlation.py` | Shapiro-Wilk → 피어슨/스피어만, `|r|>0.8` 다중공선성 경보 |
| MSFsc | `pipeline/transforms/mctq.py` | `MSF − (SD_f − SD_w)/2` (휴일>주중일 때만) |
| 수면 부채 X₃ | `pipeline/transforms/mctq.py` | 직전 5일 `Σ max(0, 480 − 실제수면분)` |
| 카페인 잔류 X₂ | `pipeline/transforms/pharmacokinetics.py` | `Σ C₀·(½)^(t/5.5)` |
| 블루라이트 X₁ | `pipeline/transforms/photobiology.py` | `노출분 × (0.4 + 0.8·밝기비)` |
| 다중선형회귀 | `pipeline/regression.py` | `Y = β₀ + ΣβₖXₖ + 공변량` · β*·R²·VIF · 피험자 고정효과 |
