"""
Baixa o arquivo de convênios do Portal da Transparência (CGU) e guarda só os
convênios de um município.

Fonte: https://portaldatransparencia.gov.br/download-de-dados/convenios
(arquivo nacional atualizado periodicamente; não exige chave de API).

Uso:
  python scripts/coletar_convenios.py                  # Teresina (PI)
  python scripts/coletar_convenios.py --uf PI --municipio TERESINA

Saída: data/convenios_raw_<municipio>.csv (UTF-8, todas as colunas originais)
"""

from __future__ import annotations

import argparse
import io
import json
import re
import time
import zipfile
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

PAGINA = "https://portaldatransparencia.gov.br/download-de-dados/convenios"


def data_mais_recente(sessao: requests.Session) -> str:
    """Lê na página de download a data do arquivo mais recente (AAAAMMDD)."""
    html = sessao.get(PAGINA, timeout=60).text
    m = re.search(r'"ano"\s*:\s*"(\d{4})"\s*,\s*"mes"\s*:\s*"(\d{2})"\s*,\s*"dia"\s*:\s*"(\d{2})"', html)
    if m:
        return "".join(m.groups())
    # Plano B: procura um arquivo existente nos últimos 60 dias
    for i in range(60):
        d = (date.today() - timedelta(days=i)).strftime("%Y%m%d")
        if sessao.head(f"{PAGINA}/{d}", timeout=30, allow_redirects=True).status_code == 200:
            return d
    raise RuntimeError("Não foi possível descobrir o arquivo de convênios mais recente.")


def baixar(sessao: requests.Session, url: str, tentativas: int = 4) -> bytes:
    for i in range(tentativas):
        try:
            r = sessao.get(url, timeout=600)
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if i == tentativas - 1:
                raise
            time.sleep(5 * 2 ** i)
    raise AssertionError


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", default="PI")
    ap.add_argument("--municipio", default="TERESINA", help="nome como aparece no arquivo, em maiúsculas")
    ap.add_argument("--saida", default="data")
    args = ap.parse_args()

    sessao = requests.Session()
    data_arquivo = data_mais_recente(sessao)
    print(f"Arquivo mais recente: {data_arquivo}. Baixando…")
    conteudo = baixar(sessao, f"{PAGINA}/{data_arquivo}")
    print(f"  {len(conteudo) / 1e6:.0f} MB baixados")

    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        nome = next(n for n in z.namelist() if n.endswith("_Convenios.csv"))
        partes = []
        with z.open(nome) as f:
            for bloco in pd.read_csv(io.TextIOWrapper(f, encoding="latin1"), sep=";", dtype=str, chunksize=100_000):
                partes.append(bloco[(bloco["UF"] == args.uf) & (bloco["NOME MUNICÍPIO"] == args.municipio)])
    df = pd.concat(partes, ignore_index=True)

    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    slug = args.municipio.lower().replace(" ", "_")
    df.to_csv(saida / f"convenios_raw_{slug}.csv", index=False, encoding="utf-8")
    (saida / "metadados_convenios.json").write_text(json.dumps({
        "fonte": PAGINA,
        "arquivo": data_arquivo,
        "uf": args.uf,
        "municipio": args.municipio,
        "coletado_em": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "convenios": len(df),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(df)} convênios de {args.municipio}/{args.uf} -> {saida}/convenios_raw_{slug}.csv")


if __name__ == "__main__":
    main()
