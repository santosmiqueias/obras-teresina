"""
Transforma as respostas brutas da API (data/raw/<ibge>/*.json) em uma
tabela única: data/obras_<ibge>.csv — uma linha por projeto.

Definições (veja também a seção "Metodologia" do README):
  valor_previsto     soma de investimentos_previstos (todas as fontes)
  valor_empenhado    soma de valor_empenho
  valor_pago         soma de pago + rppago (restos a pagar pagos)
  pct_pago           valor_pago / valor_previsto
  pct_exec_fisica    percentual do registro de execução física mais recente
  prazo_vencido      situação "Em execução" e dt_final_prevista já passou
  abrangencia_ampla  projeto estadual/nacional que apenas tem um ponto em
                     Teresina (nome cita "Estado" ou UF principal != PI)
  ponto_generico     coordenada igual à mais repetida da base (ponto padrão,
                     não é o endereço real da obra)
  valor_simbolico    valor_previsto <= R$ 1 (preenchimento de cadastro)
  outro_municipio    nome cita outro município do PI ("- Floriano - PI",
                     "em Uruçuí/PI"): provavelmente não fica em Teresina
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

import pandas as pd

SITUACOES_PROBLEMA = {"Paralisada", "Inacabada"}
RE_CIDADE = re.compile(
    r"(?:-\s*|\bem\s+|\bde\s+)([A-ZÀ-Úa-zà-ú][A-Za-zÀ-ú' ]{2,40}?)\s*(?:\([^)]*\))?\s*(?:-|/)\s*PI\b")


def cidade_citada(nome: str) -> str | None:
    if "municípios" in (nome or "").lower() or "municipios" in (nome or "").lower():
        return "vários municípios"
    for m in RE_CIDADE.finditer(nome or ""):
        cidade = m.group(1).strip()
        if cidade.lower() not in {"teresina", "estado do piauí", "piauí", "piaui"}:
            return cidade
    return None


def soma(itens: list[dict], *campos: str) -> float:
    return float(sum((i.get(c) or 0) for i in itens for c in campos))


def juntar(itens: list[dict], campo: str) -> str:
    return "; ".join(sorted({i[campo] for i in itens if i.get(campo)}))


def linha(d: dict, hoje: str) -> dict | None:
    if not d["projeto-investimento"]:
        return None
    p = d["projeto-investimento"][0]
    emp = d["empenho"]
    hist = sorted(d["historico-situacao-cancelada-paralisada"],
                  key=lambda h: h.get("data_historico_situacao_investimento") or "")
    exe = sorted(d["execucao-fisica"],
                 key=lambda e: (e.get("dt_atualizacao_execucao") or "",
                                e.get("dt_cadastro_execucao") or ""))
    ult_exe = exe[-1] if exe else {}
    pin = (p.get("pins") or [{}])[0]

    previsto = soma(p.get("investimentos_previstos") or [], "vl_investimento_previsto")
    pago = soma(emp, "pago", "rppago")
    nome = p.get("desc_nome") or ""

    return {
        "id_projeto": p["id_projeto_investimento"],
        "nome": nome,
        "situacao": p.get("situacao"),
        "natureza": p.get("natureza_intervencao"),
        "especie": p.get("especie_intervencao"),
        "eixo": juntar(p.get("eixos_tipos") or [], "eixo"),
        "tipo": juntar(p.get("eixos_tipos") or [], "tipo"),
        "orgao_responsavel": p.get("organizacao_resp"),
        "repassador": juntar(p.get("repassadores") or [], "organizacao_repassador"),
        "tomador": juntar(p.get("tomadores") or [], "organizacao_tomador"),
        "executor": juntar(p.get("executores") or [], "organizacao_executor"),
        "fontes_recurso": juntar(p.get("investimentos_previstos") or [], "desc_nome_fonte_recurso"),
        "valor_previsto": previsto,
        "valor_empenhado": soma(emp, "valor_empenho"),
        "valor_pago": pago,
        "pct_pago": round(pago / previsto * 100, 1) if previsto and emp else None,
        "pct_exec_fisica": ult_exe.get("percentual_execucao_fisica"),
        "exec_fisica_atualizada_em": ult_exe.get("dt_atualizacao_execucao"),
        "dt_inicial_prevista": p.get("dt_inicial_prevista"),
        "dt_final_prevista": p.get("dt_final_prevista"),
        "dt_inicial_efetiva": p.get("dt_inicial_efetiva"),
        "dt_final_efetiva": p.get("dt_final_efetiva"),
        "prazo_vencido": bool(p.get("situacao") == "Em execução"
                              and p.get("dt_final_prevista")
                              and p["dt_final_prevista"] < hoje),
        "data_paralisacao_cancelamento": hist[-1]["data_historico_situacao_investimento"] if hist else None,
        "justificativa": hist[-1]["justificativa_cancelada_paralisada"] if hist else None,
        "possui_tratativas": hist[-1]["possui_tratativas_situacao_investimento"] if hist else None,
        "tem_dados_financeiros": bool(emp),
        "abrangencia_ampla": "estado" in nome.lower() or p.get("uf_principal") != "PI",
        "valor_simbolico": previsto <= 1,
        "outro_municipio": cidade_citada(nome),
        "uf_principal": p.get("uf_principal"),
        "latitude": pin.get("latitude"),
        "longitude": pin.get("longitude"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ibge", type=int, default=2211001)
    ap.add_argument("--dados", default="data")
    args = ap.parse_args()

    raw = Path(args.dados) / "raw" / str(args.ibge)
    hoje = date.today().isoformat()
    linhas = [l for f in sorted(raw.glob("*.json"))
              if (l := linha(json.loads(f.read_text(encoding="utf-8")), hoje))]
    df = pd.DataFrame(linhas).sort_values(["situacao", "valor_previsto"], ascending=[True, False])
    coord = df.latitude.astype(str).str[:7] + "," + df.longitude.astype(str).str[:8]
    df["ponto_generico"] = coord == coord.value_counts().index[0]
    df["provavelmente_em_teresina"] = ~df.abrangencia_ampla & df.outro_municipio.isna()

    destino = Path(args.dados) / f"obras_{args.ibge}.csv"
    df.to_csv(destino, index=False, encoding="utf-8-sig")  # utf-8-sig abre certo no Excel

    local = df[df.provavelmente_em_teresina]
    print(f"{len(df)} projetos na API -> {len(local)} provavelmente em Teresina -> {destino}")
    print(f"  ponto genérico: {df.ponto_generico.sum()} | valor simbólico: {df.valor_simbolico.sum()}"
          f" | outro município no nome: {df.outro_municipio.notna().sum()}"
          f" | abrangência estadual/nacional: {df.abrangencia_ampla.sum()}\n")
    print("Projetos por situação (provavelmente em Teresina):")
    print(local.groupby("situacao").agg(qtd=("id_projeto", "count"),
                                        valor_previsto=("valor_previsto", "sum")).to_string())
    prob = local[local.situacao.isin(SITUACOES_PROBLEMA) | local.prazo_vencido]
    print(f"\nParalisadas/inacabadas ou em execução com prazo vencido: {len(prob)}")
    print(f"Com dados de empenho/pagamento: {local.tem_dados_financeiros.sum()} de {len(local)}")


if __name__ == "__main__":
    main()
