"""
Coleta dados de obras com recursos federais em um município, a partir da
API de Dados Abertos do Obrasgov.br (https://api-publica.obrasgov.gestao.gov.br/obras/docs).

Fluxo:
  1. /geometria?cod_ibge=...      -> IDs dos projetos localizados no município
  2. /projeto-investimento        -> dados cadastrais, situação, valor previsto
  3. /execucao-fisica             -> percentual de execução física
  4. /empenho                     -> valores empenhados, liquidados e pagos
  5. /historico-situacao-cancelada-paralisada -> motivo e data da paralisação

Uso:
  python scripts/coletar.py                      # Teresina (IBGE 2211001)
  python scripts/coletar.py --ibge 2211001 --workers 4

As respostas brutas ficam em cache (data/raw/), então rodar de novo só
busca o que faltou.
"""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

BASE = "https://api-publica.obrasgov.gestao.gov.br/obras"
PAGE_SIZE = 200  # máximo aceito pela API
ENDPOINTS_POR_PROJETO = [
    "projeto-investimento",
    "execucao-fisica",
    "empenho",
    "historico-situacao-cancelada-paralisada",
]

session = requests.Session()
session.headers["Accept"] = "application/json"


def get(endpoint: str, params: dict, tentativas: int = 5) -> dict:
    """GET com nova tentativa e espera crescente em caso de erro/limite."""
    for i in range(tentativas):
        try:
            r = session.get(f"{BASE}/{endpoint}", params=params, timeout=90)
            if r.status_code == 200:
                return r.json()
            if r.status_code not in (429, 500, 502, 503, 504):
                r.raise_for_status()
        except requests.RequestException:
            if i == tentativas - 1:
                raise
        time.sleep(2 ** i)
    raise RuntimeError(f"Falha após {tentativas} tentativas: {endpoint} {params}")


def get_todas_paginas(endpoint: str, params: dict) -> list[dict]:
    itens, pagina = [], 1
    while True:
        d = get(endpoint, {**params, "pagina": pagina, "tamanho_da_pagina": PAGE_SIZE})
        itens.extend(d.get("data", []))
        if pagina >= (d.get("total_pages") or 0):
            return itens
        pagina += 1


def coletar_projeto(pid: str, raw_dir: Path) -> None:
    arquivo = raw_dir / f"{pid}.json"
    if arquivo.exists():
        return
    dados = {ep: get_todas_paginas(ep, {"id_projeto_investimento": pid})
             for ep in ENDPOINTS_POR_PROJETO}
    arquivo.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ibge", type=int, default=2211001, help="código IBGE do município")
    ap.add_argument("--workers", type=int, default=4, help="requisições em paralelo")
    ap.add_argument("--saida", default="data")
    args = ap.parse_args()

    saida = Path(args.saida)
    raw_dir = saida / "raw" / str(args.ibge)
    raw_dir.mkdir(parents=True, exist_ok=True)

    atualizacao = get("data-atualizacao", {})
    print(f"Base atualizada em: {atualizacao.get('data_ultima_atualizacao')}")

    geos = get_todas_paginas("geometria", {"cod_ibge": args.ibge})
    (saida / f"geometrias_{args.ibge}.json").write_text(
        json.dumps(geos, ensure_ascii=False), encoding="utf-8")
    ids = sorted({g["id_projeto_investimento"] for g in geos})
    print(f"{len(geos)} geometrias -> {len(ids)} projetos distintos no município")

    falhas = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futuros = {ex.submit(coletar_projeto, pid, raw_dir): pid for pid in ids}
        for n, f in enumerate(as_completed(futuros), 1):
            try:
                f.result()
            except Exception as e:  # noqa: BLE001
                falhas.append((futuros[f], str(e)))
            if n % 50 == 0 or n == len(ids):
                print(f"  {n}/{len(ids)} projetos coletados")

    (saida / "metadados.json").write_text(json.dumps({
        "fonte": BASE,
        "cod_ibge": args.ibge,
        "data_atualizacao_base": atualizacao.get("data_ultima_atualizacao"),
        "coletado_em": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "projetos": len(ids),
        "falhas": falhas,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Concluído. Falhas: {len(falhas)}. Agora rode: python scripts/processar.py")


if __name__ == "__main__":
    main()
