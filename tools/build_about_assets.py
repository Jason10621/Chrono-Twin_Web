"""
About 페이지(열람 전용 자료실) 에셋 빌더
========================================

    python -X utf8 tools/build_about_assets.py                     # 전부
    python -X utf8 tools/build_about_assets.py --only s6-etl s7-report   # 일부만

원본 문서(유리프 폴더)를 사이트에 올릴 수 있는 "보기 전용" 형태로 바꾼다.

  · PDF / hwpx / docx → 페이지별 WebP 이미지  (원본 파일은 공개하지 않음)
  · 코드·텍스트        → .txt                  (뷰어에서 줄 번호와 함께 보여줌)
  · HTML 프로토타입    → 그대로 복사 (EURIF → ULIF 표기만 치환, iframe sandbox 로 실행)
  · 이미지·SVG         → 그대로 복사

개인정보 보호: 5명의 학번(5자리)은 렌더링 전에 모든 PDF 에서 가린다(원본은 수정하지 않음).
비밀값이 든 파일(.env, 키가 박힌 설문 웹 시험본, 계정 캡처 등)은 아래 ASSETS 에 넣지 않았다.

산출물:  frontend/public/about-files/**   +   frontend/src/lib/about-manifest.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pymupdf
from PIL import Image

REPO = Path(__file__).resolve().parent.parent            # Chrono-Twin_Web
ROOT = REPO.parent                                       # 유리프 (원본 자료 폴더)
WEB = Path("C:/Users/ijeon/eurif-web")                   # 팀 협업 워크스페이스 소스
OUT = REPO / "frontend" / "public" / "about-files"
MANIFEST = REPO / "frontend" / "src" / "lib" / "about-manifest.json"
CACHE = REPO / "tools" / ".cache" / "office"

PAGE_WIDTH_PX = 1000
WEBP_QUALITY = 72

def load_student_ids() -> list[str]:
    """학번은 공개 저장소에 두지 않는다 — 환경변수 ABOUT_STUDENT_IDS(쉼표 구분) 또는 tools/.student_ids(git 제외)에서 읽는다."""
    raw = os.environ.get("ABOUT_STUDENT_IDS", "")
    local = REPO / "tools" / ".student_ids"
    if not raw and local.exists():
        raw = local.read_text(encoding="utf-8")
    ids = [s for s in re.split(r"[\s,]+", raw) if s]
    if not ids:
        raise SystemExit("학번 목록이 없습니다. ABOUT_STUDENT_IDS 환경변수나 tools/.student_ids 파일(쉼표·줄바꿈 구분)을 만들어 주세요.")
    return ids


STUDENT_IDS = load_student_ids()
REDACT_FILL = (0.32, 0.32, 0.35)

# kind: pdf | office(→pdf) | html | image | code | text
# src 접두어:  (없음)=유리프 폴더 기준 · @repo/ = Chrono-Twin_Web · @web/ = eurif-web
ASSETS: list[dict] = [
    # ── 1. 문제 발견 · 주제 설정
    dict(id="s1-ideas", kind="html", src="실험 과정/선행 조사/eurif_experiment_ideas.html"),
    dict(id="s1-notes", kind="html", src="조사과정/eurif_experimental_research.html"),
    dict(id="s1-plan4", kind="pdf", src="실험 과정/구글폼 응답.pdf", special="plan4"),
    # ── 2. 분야별 자료조사
    dict(id="s2-lee", kind="pdf", src="유리프 자료조사/유리프 자료조사_이정욱.pdf"),
    dict(id="s2-yu", kind="pdf", src="유리프 자료조사/유리프 조사 - 유가빈.pdf"),
    dict(id="s2-jeon", kind="pdf", src="유리프 자료조사/유리프 조사 - 전윤서.pdf"),
    dict(id="s2-hong", kind="pdf", src="유리프 자료조사/유리프 조사 - 홍서준.pdf"),
    dict(id="s2-yun", kind="pdf", src="유리프 자료조사/유리프 - * 윤지후.pdf"),
    dict(id="s2-logs", kind="office", office="hwpx", src="유리프 자료조사/유리프 활동 보고서.hwpx"),
    dict(id="s2-report", kind="pdf", src="실험 과정/선행 조사/EURIF_활동보고서.pdf"),
    dict(id="s2-synth", kind="html", src="조사과정/자료조사 종합.html"),
    # ── 3. 모형 설계 · 시뮬레이터
    dict(id="s3-plan", kind="pdf", src="실험 과정/선행 조사/EURIF_실험계획서.pdf"),
    dict(id="s3-structure", kind="image", src="eurif_module_structure.svg"),
    dict(id="s3-sim", kind="html", src="실험 과정/선행 조사/EURIF_수면위상_시뮬레이터.html"),
    dict(id="s3-mlr", kind="html", src="multiple_linear_regression_explainer.html"),
    dict(id="s3-coding", kind="office", office="hwpx", src="유리프 자료조사/코딩 원리 정리.hwpx"),
    dict(id="s3-stages", kind="text", src="조사과정/2차시 - 전윤서 과제물.txt"),
    # ── 4. 실험 설계 · 준비
    dict(id="s4-form-blue", kind="pdf", src="실험 과정/실험 준비/일일_수면_설문지.pdf"),
    dict(id="s4-sched-blue", kind="pdf", src="실험 과정/실험 준비/블루라이트_피실험자_스케줄표.pdf"),
    dict(id="s4-form-led", kind="pdf", src="실험 과정/실험 준비/LED조명_일일_노출_수면_설문지.pdf"),
    dict(id="s4-sched-led", kind="pdf", src="실험 과정/실험 준비/LED조명_피실험자_스케줄표.pdf"),
    dict(id="s4-form-caf", kind="pdf", src="실험 과정/실험 준비/카페인_일일_섭취_수면_설문지.pdf"),
    dict(id="s4-sched-caf", kind="pdf", src="실험 과정/실험 준비/카페인_피실험자_스케줄표.pdf"),
    dict(id="s4-guide-caf", kind="pdf", src="실험 과정/실험 준비/카페인_무섭취_대조군_가이드.pdf"),
    dict(id="s4-survey", kind="html", src="조사과정/설문조사용.html"),
    dict(id="s4-direction", kind="office", office="hwpx", src="유리프 자료조사/유리프 진행 방향.hwpx"),
    # ── 5. 예비실험 (2주차)
    dict(id="s5-report", kind="pdf", src="활동 내용/2주차/EURIF_2주차_활동보고서.pdf"),
    dict(id="s5-hong", kind="pdf", src="활동 내용/2주차/조원별 활동 과제/카페인 섭취와 수면 위상 변화 분석 보고서(홍서준_2회차).pdf"),
    dict(id="s5-yu", kind="pdf", src="활동 내용/2주차/조원별 활동 과제/수면시 뇌과학적인 현상 조사 (유가빈_2주차).pdf"),
    dict(id="s5-jeon", kind="pdf", src="활동 내용/2주차/조원별 활동 과제/수면 설문 조사의 생명공학적 분석 (전윤서_2주차).pdf"),
    dict(id="s5-yun", kind="pdf", src="활동 내용/2주차/조원별 활동 과제/실험 진행 비판적 분석, 확장 방안 탐구(윤지후_2주차).pdf"),
    # ── 6. 데이터 파이프라인
    dict(id="s6-schema", kind="code", lang="py", src="@repo/pipeline/schema.py"),
    dict(id="s6-etl", kind="code", lang="py", src="@repo/pipeline/etl.py"),
    dict(id="s6-outliers", kind="code", lang="py", src="@repo/pipeline/outliers.py"),
    dict(id="s6-mctq", kind="code", lang="py", src="@repo/pipeline/transforms/mctq.py"),
    dict(id="s6-pk", kind="code", lang="py", src="@repo/pipeline/transforms/pharmacokinetics.py"),
    dict(id="s6-photo", kind="code", lang="py", src="@repo/pipeline/transforms/photobiology.py"),
    dict(id="s6-corr", kind="code", lang="py", src="@repo/pipeline/correlation.py"),
    dict(id="s6-reg", kind="code", lang="py", src="@repo/pipeline/regression.py"),
    dict(id="s6-sun", kind="code", lang="py", src="@repo/api_clients/sunrise_sunset.py"),
    dict(id="s6-test", kind="code", lang="py", src="@repo/tests/test_transforms.py"),
    dict(id="s6-report", kind="text", src="실험 과정/regression_report.txt"),
    dict(id="s6-corrmap", kind="image", src="활동 내용/2주차/02_correlation.png"),
    dict(id="s6-ledmap", kind="image", src="활동 내용/2주차/05_led_load_map.png"),
    # ── 7. 웹 플랫폼 (3주차)
    dict(id="s7-report", kind="pdf", src="활동 내용/3주차/EURIF_3주차_활동보고서.pdf"),
    dict(id="s7-yu-1", kind="pdf", src="활동 내용/3주차/조원별 활동 과제/웹사이트 적용 방안 탐구(유가빈_3주차).pdf"),
    dict(id="s7-yu-2", kind="office", office="hwpx", src="활동 내용/3주차/조원별 활동 과제/웹사이트 적용 방안 탐구(유가빈_3주차).hwpx"),
    dict(id="s7-jeon", kind="office", office="hwpx", src="활동 내용/3주차/조원별 활동 과제/웹사이트 적용 방안 탐구(전윤서_3주차).hwpx"),
    dict(id="s7-hong-1", kind="office", office="docx", src="활동 내용/3주차/조원별 활동 과제/웹사이트 적용 방안 탐구(홍서준_3주차).docx"),
    dict(id="s7-hong-2", kind="office", office="docx", src="활동 내용/3주차/조원별 활동 과제/카페인_잔존량_환산기_개발보고서(홍서준_3주차).docx"),
    dict(id="s7-dose", kind="html", src="활동 내용/3주차/조원별 활동 과제/caffeine-dose-echo.html"),
    dict(id="s7-model", kind="code", lang="ts", src="@repo/frontend/src/lib/chronoTwinModel.ts"),
    dict(id="s7-avatar", kind="code", lang="tsx", src="@repo/frontend/src/components/ChronoTwinAvatar.tsx"),
    dict(id="s7-map", kind="code", lang="tsx", src="@repo/frontend/src/components/WorldJetlagMap.tsx"),
    dict(id="s7-caffeine", kind="code", lang="tsx", src="@repo/frontend/src/components/CaffeineConverter.tsx"),
    dict(id="s7-sql", kind="code", lang="sql", src="@web/supabase/migrations/0006_task_submissions.sql"),
    dict(id="s7-prompt", kind="code", lang="ts", src="@web/src/lib/ai/prompt.ts"),
    # ── 8. AI 코치 · 정책 대시보드
    dict(id="s8-route", kind="code", lang="ts", src="@repo/frontend/src/app/api/chrono-ai/route.ts"),
    dict(id="s8-chat", kind="code", lang="tsx", src="@repo/frontend/src/components/ChronoAI.tsx"),
    dict(id="s8-whatif", kind="code", lang="tsx", src="@repo/frontend/src/components/WhatIfSection.tsx"),
    dict(id="s8-live", kind="code", lang="ts", src="@repo/frontend/src/lib/liveContext.ts"),
    dict(id="s8-css", kind="code", lang="css", src="@repo/frontend/src/app/globals.css"),
]


def resolve(src: str) -> Path:
    if src.startswith("@repo/"):
        return REPO / src[6:]
    if src.startswith("@web/"):
        return WEB / src[5:]
    path = ROOT / src
    if "*" in src:  # 파일명에 학번이 들어 있는 원본은 와일드카드로 찾는다
        found = sorted(path.parent.glob(path.name))
        if found:
            return found[0]
    return path


def display_path(src: str) -> str:
    return src.split("/", 1)[1] if src.startswith("@") else src


def fix_brand(text: str) -> str:
    """사이트 표기 통일(EURIF → ULIF). 화면에 보이는 문자열만 바꾸는 용도라 HTML 프로토타입에만 쓴다."""
    return text.replace("EURIF", "ULIF").replace("Eurif", "Ulif").replace("eurif", "ulif")


def office_to_pdf(asset: dict, src: Path) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"{asset['id']}.pdf"
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        return out
    ps1 = REPO / "tools" / "convert_office.ps1"
    if out.exists():
        out.unlink()
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1),
             "-Src", str(src), "-Out", str(out), "-Kind", asset["office"]],
            timeout=120, check=True, capture_output=True,
        )
    except subprocess.TimeoutExpired:
        subprocess.run(["taskkill", "/IM", "WINWORD.EXE", "/F"], capture_output=True)
        subprocess.run(["taskkill", "/IM", "Hwp.exe", "/F"], capture_output=True)
        raise SystemExit(f"[{asset['id']}] 오피스 변환 시간 초과: {src.name}")
    if not out.exists():
        raise SystemExit(f"[{asset['id']}] 변환 실패: {src.name}")
    return out


def redact_page(page: "pymupdf.Page", special: str | None) -> int:
    n = 0
    for sid in STUDENT_IDS:
        for r in page.search_for(sid):
            page.draw_rect(r + (-1, -1, 1, 1), color=None, fill=REDACT_FILL)
            n += 1
    # 글자가 벡터 도형으로 그려진 PDF(검색 불가): 표의 '조장/조원' 행에서 숫자 글리프(높이 ≈7.7pt)만 가림
    if special == "plan4" and page.number == 0:
        for d in page.get_drawings():
            r = d["rect"]
            if r.x0 >= 100 and 7.4 <= r.height <= 8.0 and (141 <= r.y0 <= 143 or 171 <= r.y0 <= 173):
                page.draw_rect(r + (-0.8, -0.8, 0.8, 0.8), color=None, fill=REDACT_FILL)
                n += 1
    return n


def build_pdf(asset: dict, pdf_path: Path) -> dict:
    dest = OUT / "pages" / asset["id"]
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("*.webp"):  # OneDrive 가 폴더 삭제를 막는 경우가 있어 폴더는 두고 내용만 비운다
        old.unlink()
    doc = pymupdf.open(pdf_path)
    redacted = 0
    w = h = 0
    for i, page in enumerate(doc):
        redacted += redact_page(page, asset.get("special"))
        zoom = PAGE_WIDTH_PX / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        img.save(dest / f"{i + 1:02d}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        if i == 0:
            w, h = pix.width, pix.height
    return dict(kind="pdf", pages=doc.page_count, w=w, h=h, redacted=redacted)


def build_file(asset: dict, src: Path) -> dict:
    kind = asset["kind"]
    if kind == "html":
        dest = OUT / "html" / f"{asset['id']}.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(fix_brand(src.read_text(encoding="utf-8", errors="ignore")), encoding="utf-8")
        return dict(kind="html", bytes=dest.stat().st_size)
    if kind == "image":
        dest = OUT / "img" / f"{asset['id']}{src.suffix.lower()}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
        return dict(kind="image", ext=src.suffix.lower().lstrip("."), bytes=dest.stat().st_size)
    # code / text → .txt
    dest = OUT / "text" / f"{asset['id']}.txt"
    dest.parent.mkdir(parents=True, exist_ok=True)
    text = src.read_text(encoding="utf-8", errors="ignore").replace("\r\n", "\n")
    dest.write_text(text, encoding="utf-8")
    info = dict(kind=kind, lines=text.count("\n") + 1, bytes=dest.stat().st_size)
    if kind == "code":
        info.update(lang=asset["lang"], path=display_path(asset["src"]))
    return info


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None, help="이 id 들만 다시 만든다")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    todo = [a for a in ASSETS if not args.only or a["id"] in args.only]
    if args.only and len(todo) != len(args.only):
        missing = set(args.only) - {a["id"] for a in todo}
        raise SystemExit(f"알 수 없는 id: {sorted(missing)}")

    for a in todo:
        src = resolve(a["src"])
        if not src.exists():
            raise SystemExit(f"[{a['id']}] 원본이 없습니다: {src}")
        if a["kind"] == "pdf":
            info = build_pdf(a, src)
        elif a["kind"] == "office":
            info = build_pdf(a, office_to_pdf(a, src))
        else:
            info = build_file(a, src)
        manifest[a["id"]] = info
        extra = f" (학번 가림 {info['redacted']}곳)" if info.get("redacted") else ""
        print(f"✔ {a['id']:<14} {info['kind']:<5} {info.get('pages', info.get('lines', ''))}{extra}")

    valid = {a["id"] for a in ASSETS}
    manifest = {k: v for k, v in sorted(manifest.items()) if k in valid}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"\n완료 — {len(manifest)}개 자료, 총 {total / 1024 / 1024:.1f} MB → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
