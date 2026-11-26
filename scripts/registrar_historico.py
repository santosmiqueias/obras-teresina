"""
Guarda uma "foto" do estado de cada obra a cada atualização da base do
Obrasgov.br, para acompanhar a evolução ao longo do tempo.

O Obrasgov só informa o valor atual (situação, % executado, valores pagos);
ele não guarda histórico. Por isso o histórico deste projeto começa na data
da primeira coleta e cresce a cada execução semanal da automação.

Entrada: data/obras_<ibge>.csv e data/metadados.json
Saída:   data/historico/obras_<AAAA-MM-DD>.csv (data da base do Obrasgov)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

COLUNAS = ["id_projeto", "situacao", "pct_exec_fisica", "valor_empenhado", "valor_pago",
           "prazo_vencido", "provavelmente_em_teresina"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ibge", type=int, default=2211001)
    ap.add_argument("--dados", default="data")
    args = ap.parse_args()

    dados = Path(args.dados)
    meta = json.loads((dados / "metadados.json").read_text(encoding="utf-8"))
    data_base = (meta.get("data_atualizacao_base") or meta["coletado_em"])[:10]

    df = pd.read_csv(dados / f"obras_{args.ibge}.csv", usecols=COLUNAS)
    pasta = dados / "historico"
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"obras_{data_base}.csv"
    df.sort_values("id_projeto").to_csv(destino, index=False, encoding="utf-8")
    fotos = sorted(pasta.glob("obras_*.csv"))
    print(f"Foto de {len(df)} obras em {destino} ({len(fotos)} no histórico)")


if __name__ == "__main__":
    main()
