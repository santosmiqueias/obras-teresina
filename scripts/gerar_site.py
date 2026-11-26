"""
Gera docs/data.json (dados do dashboard) a partir de data/obras_<ibge>.csv.

Uso:
  python scripts/gerar_site.py
Depois abra docs/index.html via um servidor local:
  python -m http.server -d docs 8000
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import pandas as pd

# Caixa aproximada do município de Teresina: pontos fora dela são descartados
# do mapa (coordenadas trocadas, de outro estado etc.).
BBOX = {"lat": (-5.45, -4.80), "lon": (-43.00, -42.55)}
CAMPOS_TEXTO = ["id_projeto", "nome", "situacao", "natureza", "tipo",
                "repassador", "orgao_responsavel", "executor",
                "dt_final_prevista", "data_paralisacao_cancelamento",
                "justificativa", "outro_municipio"]


def limpo(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, str):  # remove caracteres de controle e espaços repetidos
        v = re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f-\x9f\ufffd]", " ", v)).strip()
    return v


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ibge", type=int, default=2211001)
    ap.add_argument("--dados", default="data")
    ap.add_argument("--saida", default="docs/data.json")
    args = ap.parse_args()

    df = pd.read_csv(Path(args.dados) / f"obras_{args.ibge}.csv")
    for c in ("latitude", "longitude"):  # alguns cadastros têm texto no lugar do número
        df[c] = pd.to_numeric(df[c], errors="coerce")
    meta = json.loads((Path(args.dados) / "metadados.json").read_text(encoding="utf-8"))

    # convênios do Portal da Transparência (opcional: só se já foram coletados)
    conv_csv = Path(args.dados) / f"convenios_{args.ibge}.csv"
    convenios, conv_por_obra = [], {}
    if conv_csv.exists():
        cv = pd.read_csv(conv_csv, dtype={"numero": str, "numero_original": str})
        for r in cv.to_dict("records"):
            c = {k: limpo(v) for k, v in r.items()}
            c["obras_relacionadas"] = [o for o in (c["obras_relacionadas"] or "").split("; ") if o]
            c["vencido_incompleto"] = bool(c["vigencia_vencida"] and (c["pct_repassado"] or 0) < 99)
            for oid in c["obras_relacionadas"]:
                conv_por_obra.setdefault(oid, []).append(
                    {"numero": c["numero"], "acordado": c["valor_acordado"], "repassado": c["valor_repassado"]})
            convenios.append(c)
        meta_conv = json.loads((Path(args.dados) / "metadados_convenios.json").read_text(encoding="utf-8"))
        Path(args.saida).with_name("convenios.json").write_text(json.dumps({
            "arquivo_portal": meta_conv.get("arquivo"),
            "convenios": convenios,
        }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{len(convenios)} convênios -> {Path(args.saida).with_name('convenios.json')}")

    obras = []
    for r in df.to_dict("records"):
        lat, lon = limpo(r["latitude"]), limpo(r["longitude"])
        mapa_ok = (lat is not None and lon is not None and not r["ponto_generico"]
                   and BBOX["lat"][0] <= lat <= BBOX["lat"][1]
                   and BBOX["lon"][0] <= lon <= BBOX["lon"][1])
        previsto = None if r["valor_simbolico"] else limpo(r["valor_previsto"])
        tem_fin = bool(r["tem_dados_financeiros"])
        o = {k: limpo(r[k]) for k in CAMPOS_TEXTO}
        o.update({
            "previsto": previsto,
            "empenhado": r["valor_empenhado"] if tem_fin else None,
            "pago": r["valor_pago"] if tem_fin else None,
            "pct_pago": round(r["valor_pago"] / previsto * 100, 1) if tem_fin and previsto else None,
            "pct_fisico": limpo(r["pct_exec_fisica"]),
            "prazo_vencido": bool(r["prazo_vencido"]),
            "alerta": bool(r["situacao"] in ("Paralisada", "Inacabada") or r["prazo_vencido"]),
            "em_teresina": bool(r["provavelmente_em_teresina"]),
            "lat": round(lat, 5) if mapa_ok else None,
            "lon": round(lon, 5) if mapa_ok else None,
            "convenios": conv_por_obra.get(r["id_projeto"], []),
        })
        obras.append(o)

    saida = Path(args.saida)
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps({
        "municipio": "Teresina (PI)",
        "cod_ibge": args.ibge,
        "data_atualizacao_base": meta.get("data_atualizacao_base"),
        "coletado_em": meta.get("coletado_em"),
        "obras": obras,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(obras)} obras -> {saida} ({saida.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
