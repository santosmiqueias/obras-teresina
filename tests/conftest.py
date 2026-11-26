import sys
from pathlib import Path

# permite importar os scripts (scripts/*.py) nos testes
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
