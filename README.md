# Obras Federais em Teresina

Coleta e organiza dados públicos sobre obras com recursos federais em Teresina (PI):
situação (concluída, em execução, paralisada...), execução física, quanto do valor
já foi empenhado e pago e quanto a União já repassou em convênios.

**Painel:** https://santosmiqueias.github.io/obras-teresina/

O painel tem:

- **manchete e destaques** gerados a partir dos dados (obras paralisadas, inacabadas
  ou com prazo vencido);
- **"O que mudou"**: repasses mais recentes e mudanças nas obras desde a semana anterior;
- **gráficos por situação** e a comparação **"o dinheiro acompanha a obra?"**
  (quanto foi construído × quanto foi pago, obra por obra);
- **mapa** no estilo Google Maps (ruas ou satélite, alfinetes e agrupamento);
- **convênios**: valor acordado × repassado, repasses por ano e por ministério;
- **tabelas** com filtros, busca e exportação em CSV;
- uma **página para cada obra** (`obra.html?id=...`) com linha do tempo, convênio
  e histórico de repasses, mapa da localização e link compartilhável.

## Atualização automática

Tudo roda no próprio GitHub, sem depender de nenhum computador. O workflow
[`atualizar-e-publicar.yml`](.github/workflows/atualizar-e-publicar.yml)
(GitHub Actions):

1. **toda segunda-feira** roda os testes e coleta os dados mais recentes da API do
   Obrasgov.br e o arquivo de convênios do Portal da Transparência;
2. grava uma foto semanal do estado de cada obra em `data/historico/`;
3. gera os dados do painel e **valida** antes de publicar (`scripts/validar.py`):
   se algo vier errado, nada é publicado e o site continua com a última versão boa;
4. salva no repositório e publica o painel no GitHub Pages;
5. se qualquer etapa falhar, **abre uma issue** avisando.

O workflow [`testes.yml`](.github/workflows/testes.yml) roda os testes a cada
mudança nos scripts.

Para atualizar na hora: aba **Actions** → *Atualizar dados e publicar painel* →
**Run workflow**.

## Estrutura

```
├── scripts/
│   ├── coletar.py              # baixa os dados da API (cache em data/raw/, fora do git)
│   ├── processar.py            # gera data/obras_2211001.csv
│   ├── registrar_historico.py  # grava a foto semanal em data/historico/
│   ├── coletar_convenios.py    # baixa convênios e ordens bancárias (Portal da Transparência)
│   ├── processar_convenios.py  # gera data/convenios_ e data/repasses_2211001.csv
│   ├── gerar_site.py           # gera docs/data.json, convenios.json e historico.json
│   └── validar.py              # confere os dados antes de publicar
├── tests/                      # testes automatizados (pytest)
├── data/
│   ├── obras_2211001.csv       # obras, uma linha por projeto
│   ├── convenios_2211001.csv   # convênios, uma linha por convênio
│   ├── repasses_2211001.csv    # cada repasse (ordem bancária) com data e valor
│   ├── historico/              # fotos semanais do estado das obras
│   └── metadados*.json         # datas das bases e das coletas
├── docs/                       # site (HTML/CSS/JS puro, sem build)
│   ├── index.html              # painel
│   ├── obra.html               # página de cada obra
│   ├── assets/                 # estilo.css, comum.js, painel.js, obra.js
│   ├── vendor/                 # Leaflet e Leaflet.markercluster (servidos pelo site)
│   └── *.json                  # dados gerados pelos scripts
└── .github/workflows/          # automação e testes
```

## Rodar manualmente (opcional)

```bash
pip install -r requirements.txt
python scripts/coletar.py      # ~10 min na 1ª vez
python scripts/processar.py
python scripts/registrar_historico.py
python scripts/coletar_convenios.py   # ~70 MB, alguns segundos
python scripts/processar_convenios.py
python scripts/gerar_site.py
python scripts/validar.py
python -m http.server -d docs 8000   # abra http://localhost:8000
```

Testes: `pip install -r requirements-dev.txt` e depois `python -m pytest`.

Para outro município, passe o código IBGE: `python scripts/coletar.py --ibge 2211001`.

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

## Convênios (Portal da Transparência)

[Arquivo de convênios](https://portaldatransparencia.gov.br/download-de-dados/convenios)
da CGU, sem necessidade de chave de API. Escopo e definições:

- convênios com vigência a partir de 2015 cujo convenente fica em Teresina;
- **convênios com o Governo do Estado e outros órgãos estaduais ficam de fora**:
  aparecem em Teresina só porque a sede fica na capital, mas valem para o Piauí todo;
- os repasses individuais vêm do arquivo de **ordens bancárias** (data e valor de
  cada transferência), usado na linha do tempo e no gráfico de repasses por ano;
- `valor_repassado` = valor liberado pela União; `sem_repasse` = convênio em
  andamento sem nenhum repasse; `vigencia_vencida` = em andamento com vigência
  encerrada;
- obra e convênio são ligados (`obras_relacionadas`) só quando o número do
  convênio aparece no cadastro da obra no Obrasgov, o que acontece em poucos casos.

## Histórico

O Obrasgov só informa o estado **atual** de cada obra; ele não guarda histórico.
Por isso, a cada atualização o projeto grava uma foto (`data/historico/obras_<data>.csv`)
com situação, % executado e valores pagos. Comparando a foto mais recente com a
anterior, o painel mostra o que mudou (obra paralisada, avanço da execução, novos
pagamentos, prazo vencido). O histórico começou em 25/11/2026 e cresce toda semana.

## Mapa

Fundo de ruas e de satélite da Esri (uso gratuito com atribuição, adequado a projetos
não comerciais). As bibliotecas Leaflet e Leaflet.markercluster ficam em `docs/vendor/`.
Só aparecem no mapa as obras com coordenada precisa.

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

- [x] Cruzar com convênios do Portal da Transparência para cobrir os repasses
- [ ] Geocodificar pelo endereço/CEP para corrigir o ponto genérico
- [x] Dashboard com mapa, filtros e indicador "% pago × executado"
- [x] Atualização automática agendada (GitHub Actions)
- [x] Histórico semanal e "o que mudou"
- [x] Página por obra com linha do tempo e repasses
- [x] Testes automatizados e validação antes de publicar
- [ ] Ligar mais obras a convênios (comparação por semelhança de texto)
- [ ] Expandir para outros municípios do Piauí
