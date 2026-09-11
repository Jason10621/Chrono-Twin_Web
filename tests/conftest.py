import sys
from pathlib import Path

# Chrono-Twin_Web 루트를 import 경로에 추가 (pipeline 패키지)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
