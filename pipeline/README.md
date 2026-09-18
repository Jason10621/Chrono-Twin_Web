# Chrono-Twin 데이터 파이프라인

ULIF 정보학 파트(이정욱). 수면 위상 지연 다중변수 예측 모형의 데이터 처리 전 구간을
코드로 구현하고, **더미(합성) 데이터로 미리 돌려 오류를 잡는** 모듈.

## 구성

| 파일 | 역할 |
|---|---|
| `schema.py` | Chrono-Twin 수집 스키마 (원본 6필드 + `led_lux`·`led_color_temp` 2필드). 문자열 파싱·검증 |
| `dummy_data.py` | 구글 폼 응답을 흉내낸 합성 데이터 생성. 결측·깨진시각·불가능값·이상치를 **의도적으로 주입** |
| `etl.py` | Extract → Transform(파싱·결측 대체·파생 피처) → Load. `ETLReport` 로 전 단계 로그 |
| `transforms/mctq.py` | MSF / MSFsc (2변형), 수면 부채 누적(품질 인식) |
| `transforms/pharmacokinetics.py` | 카페인 반감기 감쇠 `C(t)=C₀·(½)^(t/5.5)` |
| `transforms/photobiology.py` | 블루라이트 보정 `blAdj`, LED 멜라놉틱 조도·저녁 부하 (신규) |
| `outliers.py` | Z-score 이상치 판별 `|Z|>3.0` (표준/수정 MAD, 하드범위 우선, 그룹별 옵션) |
| `correlation.py` | **상관분석 사전 탐색 (§5-2)** — Shapiro-Wilk 정규성 → 피어슨/스피어만 선택, Y~Xₖ 상관, `|r|>0.8` 다중공선성 경보 |
| `regression.py` | 다중선형회귀 — β, R², 조정 R², VIF, 표준화 β*, **피험자 고정효과(within)** |
| `run_pipeline.py` | 전 구간 오케스트레이터 + 리포트·그림 출력 + **자체 검증** |
| `export_dashboard.py` | 대시보드용 요약 JSON 내보내기 |

## 실행

```bash
pip install -r pipeline/requirements.txt

# 전 구간 실행 (더미 40명 × 14일) → pipeline/outputs/ 에 산출물
python -m pipeline.run_pipeline --subjects 40 --days 14

# 옵션
python -m pipeline.run_pipeline --impute knn --zmethod modified --no-figures
python -m pipeline.export_dashboard          # dashboard/mock_data.json 갱신

# 테스트
python -m pytest
```

## 산출물 (`pipeline/outputs/`)

- `clean_daily.csv` — 정제된 1인-1일 레코드 (파생 피처 포함)
- `analysis_table.csv` — 회귀 입력 테이블 + 이상치 플래그
- `msfsc_by_subject.csv` — 피험자별 MSF / MSFsc
- `quarantine.csv` — 격리된 불량 레코드
- `regression_report.txt` — 회귀 결과 전문 + H4 판정 + Z-score 로그
- `figures/*.png` — 분포·상관·β*·카페인 감쇠·LED 부하 지도
- `run_log.txt` — 콘솔 로그 전체

## 파이프라인이 잡아낸 것 (더미 실행 결과)

1. **한글 폰트** — matplotlib 이 Hangul 미지원 → Malgun Gothic 자동 선택
2. **취침시각 파싱** — `"25:70"`, `"몰라요"`, `"오전 1시"` 등 → 견고한 파서 + 격리
3. **결측 전파** — 대체된 밤이 5일 수면부채 창을 오염 → `night_valid` 플래그로 창 무효화
4. **within 중심화** — Y(위상지연)가 개인 평균 기준이라 시불변 공변량(크로노타입)은
   회귀에서 자동 탈락. pooled OLS 는 사이 between 성분을 놓쳐 계수 축소 → **고정효과 모형** 추가
5. **동적 내생성** — 수면부채는 지연 종속변수로 구성 → Nickell 편향으로 β₃ 20~35% 과소추정.
   보고서 한계점 + GMM/장기 패널 필요 명시

`run_pipeline` 끝에 **정답 계수 복원 점검**이 자동으로 돌아, 시변·외생 계수(X₁·X₂·LED)가
within 모형에서 ±20% 내로 복원되면 `⇒ 파이프라인 자체검증: 통과`.
