"""
Limpa os convênios do município e liga cada um às obras do Obrasgov quando o
número do convênio aparece no cadastro da obra.

Entrada: data/convenios_raw_teresina.csv e data/raw/<ibge>/*.json
Saída:   data/convenios_<ibge>.csv

Escopo e definições:
  - só convênios com fim de vigência a partir de 2015;
  - convênios com o Governo do Estado ficam de fora: eles aparecem em Teresina
    só porque a sede do governo fica na capital, mas valem para o Piauí todo;
  - valor_acordado = VALOR CONVÊNIO; valor_repassado = VALOR LIBERADO
    (o quanto a União já transferiu ao convenente);
  - sem_repasse: convênio em andamento que ainda não recebeu nenhum repasse;
  - vigencia_vencida: em andamento, com data final de vigência já passada.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

import pandas as pd

GRUPOS_SITUACAO = {
    "Em andamento": {"EM EXECUÇÃO", "NORMAL", "ADIMPLENTE", "INADIMPLENTE", "INADIMPLÊNCIA SUSPENSA"},
    "Prestação de contas": {"AGUARDANDO PRESTAÇÃO DE CONTAS", "PRESTAÇÃO DE CONTAS EM ANÁLISE",
                            "PRESTAÇÃO DE CONTAS ENVIADA PARA ANÁLISE", "PRESTAÇÃO DE CONTAS EM COMPLEMENTAÇÃO",
                            "PRESTAÇÃO DE CONTAS INICIADA POR ANTECIPAÇÃO", "PRESTAÇÃO DE CONTAS APROVADA",
                            "PRESTAÇÃO DE CONTAS APROVADA COM RESSALVAS", "PRESTAÇÃO DE CONTAS REJEITADA"},
    "Concluído": {"CONCLUÍDO", "BAIXADO", "ARQUIVADO"},
    "Cancelado ou anulado": {"CONVÊNIO ANULADO", "EXCLUÍDO", "CANCELADO", "RESCINDIDO"},
}
RECEBEDORES = {
    "Administração Pública Municipal": "Prefeitura de Teresina",
    "Entidades Sem Fins Lucrativos": "Entidades sem fins lucrativos",
    "Administração Pública": "Outros órgãos públicos",
    "Entidades Empresariais Privadas": "Empresas",
}
RE_NUM = re.compile(r"(?<![\d.,])(\d{6})(?![\d.,])")


def numero(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce")


def data_iso(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, format="%d/%m/%Y", errors="coerce").dt.strftime("%Y-%m-%d")


def grupo(situacao: str) -> str:
    return next((g for g, ss in GRUPOS_SITUACAO.items() if situacao in ss), "Outros")


def obras_por_convenio(raw_dir: Path, numeros: set[str]) -> dict[str, list[str]]:
    """Procura números de convênio nos textos do cadastro de cada obra."""
    mapa: dict[str, list[str]] = {}
    for f in raw_dir.glob("*.json"):
        d = json.loads(f.read_text(encoding="utf-8"))
        if not d["projeto-investimento"]:
            continue
        p = d["projeto-investimento"][0]
        textos = [p.get(k) or "" for k in ("desc_nome", "desc_projeto", "desc_meta_global", "obs_pertinentes_intervencao")]
        textos += [e.get("descricao_empenho") or "" for e in d["empenho"]]
        for n in set(RE_NUM.findall(" ".join(textos))) & numeros:
            mapa.setdefault(n, []).append(p["id_projeto_investimento"])
    return mapa


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ibge", type=int, default=2211001)
    ap.add_argument("--municipio", default="teresina")
    ap.add_argument("--dados", default="data")
    args = ap.parse_args()

    dados = Path(args.dados)
    df = pd.read_csv(dados / f"convenios_raw_{args.municipio}.csv", dtype=str)
    df = df[df["TIPO CONVENENTE"].isin(RECEBEDORES)]
    fim = pd.to_datetime(df["DATA FINAL VIGÊNCIA"], format="%d/%m/%Y", errors="coerce")
    df = df[fim >= "2015-01-01"].copy()

    hoje = date.today().isoformat()
    out = pd.DataFrame({
        "numero": df["NÚMERO CONVÊNIO"],
        "numero_original": df["NÚMERO ORIGINAL"],
        "objeto": df["OBJETO DO CONVÊNIO"].str.replace(r"\s+", " ", regex=True).str.strip(),
        "situacao": df["SITUAÇÃO CONVÊNIO"],
        "grupo_situacao": df["SITUAÇÃO CONVÊNIO"].map(grupo),
        "instrumento": df["TIPO INSTRUMENTO"],
        "recebedor": df["TIPO CONVENENTE"].map(RECEBEDORES),
        "convenente": df["NOME CONVENENTE"],
        "orgao_superior": df["NOME ÓRGÃO SUPERIOR"],
        "concedente": df["NOME ÓRGÃO CONCEDENTE"],
        "valor_acordado": numero(df["VALOR CONVÊNIO"]),
        "valor_repassado": numero(df["VALOR LIBERADO"]),
        "contrapartida": numero(df["VALOR CONTRAPARTIDA"]),
        "inicio_vigencia": data_iso(df["DATA INÍCIO VIGÊNCIA"]),
        "fim_vigencia": data_iso(df["DATA FINAL VIGÊNCIA"]),
        "ultimo_repasse": data_iso(df["DATA ÚLTIMA LIBERAÇÃO"]),
        "valor_ultimo_repasse": numero(df["VALOR ÚLTIMA LIBERAÇÃO"]),
    })
    andamento = out.grupo_situacao == "Em andamento"
    out["pct_repassado"] = (out.valor_repassado / out.valor_acordado * 100).round(1).where(out.valor_acordado > 0)
    out["sem_repasse"] = andamento & (out.valor_repassado.fillna(0) == 0)
    out["vigencia_vencida"] = andamento & (out.fim_vigencia < hoje)

    mapa = obras_por_convenio(dados / "raw" / str(args.ibge), set(out.numero))
    out["obras_relacionadas"] = out.numero.map(lambda n: "; ".join(sorted(mapa.get(n, []))))

    out = out.sort_values("valor_acordado", ascending=False)
    destino = dados / f"convenios_{args.ibge}.csv"
    out.to_csv(destino, index=False, encoding="utf-8-sig")

    validos = out[out.grupo_situacao != "Cancelado ou anulado"]
    pref = validos[validos.recebedor == "Prefeitura de Teresina"]
    print(f"{len(out)} convênios (desde 2015, sem Governo do Estado) -> {destino}")
    print(f"Prefeitura: {len(pref)} convênios válidos, acordado R$ {pref.valor_acordado.sum() / 1e6:.1f} mi,"
          f" repassado R$ {pref.valor_repassado.sum() / 1e6:.1f} mi")
    print(f"Em andamento sem nenhum repasse: {int(out.sem_repasse.sum())} | ligados a obras: {(out.obras_relacionadas != '').sum()}")


if __name__ == "__main__":
    main()
