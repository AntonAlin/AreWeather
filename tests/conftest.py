import sys
from pathlib import Path

# så att `pytest` funkar från repo-roten utan pip install -e
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
