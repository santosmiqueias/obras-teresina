# Obras Federais em Teresina

Coleta e organiza dados públicos sobre obras com recursos federais em Teresina (PI):
situação (concluída, em execução, paralisada...), execução física e quanto do valor
já foi empenhado e pago.

**Painel:** https://santosmiqueias.github.io/obras-teresina/

O painel tem filtros por situação, órgão repassador e busca; indicadores-resumo;
gráficos por situação; dispersão "% pago × % executado"; mapa das obras com
localização precisa; e tabela das obras com alerta (paralisadas, inacabadas ou
com prazo vencido).

## Como rodar

```bash
pip install -r requirements.txt
python coletar.py      # baixa os dados da API (~10 min na 1ª vez; depois usa cache)
python processar.py    # gera data/obras_2211001.csv
python gerar_site.py   # gera docs/data.json (dados do painel)
python -m http.server -d docs 8000   # abra http://localhost:8000
```

O painel (`docs/`) é HTML/CSS/JS puro, sem etapa de build, publicado pelo
GitHub Pages a partir da pasta `docs/` da branch `main`.

Para outro município, passe o código IBGE: `python coletar.py --ibge 2211001`.

## Fonte de dados

[API de Dados Abertos do Obrasgov.br](https://api-publica.obrasgov.gestao.gov.br/obras/docs)
(Ministério da Gestão e da Inovação, licença ODbL). Endpoints usados:

| Endpoint | Para quê |
|---|---|
| `/geometria?cod_ibge=2211001` | IDs dos projetos localizados no município |
| `/projeto-investimento` | nome, situação, órgãos, valor previsto, datas, coordenadas |
| `/execucao-fisica` | % de execução física |
| `/empenho` | valores empenhados, liquidados e pagos |
| `/historico-situacao-cancelada-paralisada` | data e justificativa da paralisação |

A API não pede autenticação, aceita até 200 itens por página e informa a data da
última atualização em `/data-atualizacao`.

## Saída: `data/obras_2211001.csv`

Uma linha por projeto. Colunas principais:

| Coluna | Significado |
|---|---|
| `situacao` | situação declarada no Obrasgov |
| `valor_previsto` | soma dos investimentos previstos |
| `valor_empenhado` | soma dos empenhos |
| `valor_pago` | `pago` + `rppago` (restos a pagar pagos) |
| `pct_pago` | valor pago ÷ valor previsto (só quando há empenhos) |
| `pct_exec_fisica` | % de execução física mais recente |
| `prazo_vencido` | "Em execução" com data final prevista já vencida |
| `provavelmente_em_teresina` | filtro recomendado para análises (ver abaixo) |

## Metodologia e limitações (leia antes de tirar conclusões)

A coleta revelou problemas sérios de qualidade nos dados, sinalizados em colunas
próprias em vez de removidos:

1. **Localização pouco confiável.** 908 dos 1.375 projetos retornados para Teresina
   têm exatamente a mesma coordenada (`ponto_generico`), um ponto padrão no centro
   da capital. Muitos ficam em outras cidades do Piauí: o nome cita outro município
   (`outro_municipio`, detectado por padrões no texto) ou o projeto é estadual ou
   nacional (`abrangencia_ampla`). A coluna `provavelmente_em_teresina` exclui esses
   casos. É uma **heurística**: ainda pode deixar passar alguns casos ou excluir outros indevidamente.
2. **Valores simbólicos.** 780 projetos têm valor previsto de R$ 0,01
   (`valor_simbolico`). Somas de valor previsto incluindo esses projetos subestimam
   o total.
3. **Cobertura financeira parcial.** Só cerca de 12% dos projetos têm empenhos na API.
   Muitas obras municipais são financiadas por convênios (Transferegov), cujos
   repasses não aparecem no endpoint `/empenho`. "Sem pagamento" na tabela significa
   **sem dado**, não que nada foi pago.
4. **Empenhado ≠ pago ≠ executado.** Empenho é a reserva do recurso; pagamento é a
   saída efetiva do dinheiro; execução física é o avanço da obra.
5. **Situação depende do gestor.** Uma obra "Em execução" pode estar parada sem que o
   cadastro tenha sido atualizado. Daí o indicador `prazo_vencido`. Paralisação também
   pode ter causas legítimas (licenciamento, decisão judicial, rescisão contratual).

## Próximos passos

- [ ] Cruzar com convênios do Portal da Transparência para cobrir os repasses
- [ ] Geocodificar pelo endereço/CEP para corrigir o ponto genérico
- [x] Dashboard com mapa, filtros e indicador "% pago × executado"
- [ ] Atualização automática agendada (GitHub Actions)
