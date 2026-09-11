"""
대시보드 빌드 — 템플릿 + mock_data.json → index.html
====================================================

    python dashboard/build.py

index.template.html 의 <!--CT_DATA--> 자리에 mock_data.json 을 인라인으로 끼워
단일 파일 index.html 을 만든다 (외부 fetch 불필요 → 파일 더블클릭·아티팩트 모두 동작).
mock_data.json 이 없으면 파이프라인을 돌려 먼저 생성한다.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-regen", action="store_true",
                    help="mock_data.json 재생성 없이 기존 파일로 빌드")
    args = ap.parse_args()

    data_path = HERE / "mock_data.json"
    if not args.no_regen or not data_path.exists():
        print("pipeline.export_dashboard 실행 → mock_data.json 갱신")
        subprocess.run([sys.executable, "-X", "utf8", "-m", "pipeline.export_dashboard"],
                       cwd=ROOT, check=True)

    template = (HERE / "index.template.html").read_text(encoding="utf-8")
    data = json.loads(data_path.read_text(encoding="utf-8"))
    # </script> 가 데이터 안에 있으면 조기 종료되므로 이스케이프
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    out = template.replace("<!--CT_DATA-->", blob)
    (HERE / "index.html").write_text(out, encoding="utf-8")
    kb = (HERE / "index.html").stat().st_size / 1024
    print(f"wrote dashboard/index.html  ({kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
