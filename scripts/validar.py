"""
Confere os dados do painel antes de publicar. Se algo estiver errado, termina
com erro e a automação não publica (o site continua com a última versão boa).

Uso: python scripts/validar.py
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

DOCS = Path("docs")
MIN_OBRAS = 500          # Teresina tem ~1.400 projetos; muito menos indica falha na coleta
MIN_EM_TERESINA = 300
MIN_CONVENIOS = 50
MAX_DIAS_BASE = 45       # a base do Obrasgov costuma ser atualizada a cada poucos dias
CAMPOS_OBRA = {"id_projeto", "nome", "situacao", "previsto", "pago", "pct_fisico", "alerta", "em_teresina", "lat", "lon"}
CAMPOS_CONV = {"numero", "objeto", "situacao", "valor_acordado", "valor_repassado", "repasses"}


def validar() -> list[str]:
    erros: list[str] = []
    d = json.loads((DOCS / "data.json").read_text(encoding="utf-8"))
    obras = d.get("obras", [])
    if len(obras) < MIN_OBRAS:
        erros.append(f"só {len(obras)} obras (mínimo {MIN_OBRAS})")
    if sum(o.get("em_teresina", False) for o in obras) < MIN_EM_TERESINA:
        erros.append("poucas obras classificadas como de Teresina")
    faltando = CAMPOS_OBRA - set(obras[0]) if obras else CAMPOS_OBRA
    if faltando:
        erros.append(f"campos ausentes nas obras: {sorted(faltando)}")
    ids = [o["id_projeto"] for o in obras]
    if len(ids) != len(set(ids)):
        erros.append("IDs de obra repetidos")
    base = d.get("data_atualizacao_base")
    if not base:
        erros.append("sem data de atualização da base")
    elif (date.today() - datetime.fromisoformat(base[:10]).date()).days > MAX_DIAS_BASE:
        erros.append(f"base do Obrasgov desatualizada ({base[:10]})")
    for o in obras:
        if o.get("pct_fisico") is not None and not (0 <= o["pct_fisico"] <= 100.5):
            erros.append(f"execução física fora de 0–100% na obra {o['id_projeto']}")
            break

    cv = json.loads((DOCS / "convenios.json").read_text(encoding="utf-8")).get("convenios", [])
    if len(cv) < MIN_CONVENIOS:
        erros.append(f"só {len(cv)} convênios (mínimo {MIN_CONVENIOS})")
    elif CAMPOS_CONV - set(cv[0]):
        erros.append(f"campos ausentes nos convênios: {sorted(CAMPOS_CONV - set(cv[0]))}")

    h = json.loads((DOCS / "historico.json").read_text(encoding="utf-8"))
    if not h.get("datas"):
        erros.append("histórico vazio")
    return erros


if __name__ == "__main__":
    erros = validar()
    if erros:
        print("Dados reprovados na validação:\n- " + "\n- ".join(erros))
        sys.exit(1)
    print("Dados aprovados na validação.")
