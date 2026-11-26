import pandas as pd

from gerar_site import mudancas, serie_historica


def foto(linhas):
    return pd.DataFrame(linhas, columns=["id_projeto", "situacao", "pct_exec_fisica", "valor_empenhado",
                                         "valor_pago", "prazo_vencido", "provavelmente_em_teresina"])


ANTES = foto([
    ["A", "Em execução", 40.0, 100.0, 50.0, False, True],
    ["B", "Em execução", 10.0, None, None, False, True],
    ["C", "Concluída", 100.0, None, None, False, True],
])
DEPOIS = foto([
    ["A", "Em execução", 55.0, 100.0, 80.0, True, True],   # avançou, pagou e venceu o prazo
    ["B", "Paralisada", 10.0, None, None, False, True],    # paralisou
    ["C", "Concluída", 100.4, None, None, False, True],    # variação < 1 ponto: ignorada
    ["D", "Cadastrada", None, None, None, False, True],    # obra nova
])


def tipos(lista, oid):
    return sorted(m["tipo"] for m in lista if m["id"] == oid)


def test_mudancas_detecta_cada_tipo():
    m = mudancas(ANTES, DEPOIS)
    assert tipos(m, "A") == ["execucao", "pagamento", "prazo_vencido"]
    assert tipos(m, "B") == ["situacao"]
    assert tipos(m, "C") == []
    assert tipos(m, "D") == ["nova"]


def test_mudanca_de_situacao_guarda_de_e_para():
    b = next(x for x in mudancas(ANTES, DEPOIS) if x["id"] == "B")
    assert (b["de"], b["para"]) == ("Em execução", "Paralisada")


def test_sem_mudancas_quando_fotos_iguais():
    assert mudancas(ANTES, ANTES) == []


def test_serie_guarda_so_pontos_que_mudaram():
    s = serie_historica([("2026-01-01", ANTES), ("2026-01-08", ANTES), ("2026-01-15", DEPOIS)])
    assert [p[0] for p in s["A"]] == ["2026-01-01", "2026-01-15"]
    assert s["A"][-1][2] == 55.0
    assert [p[0] for p in s["D"]] == ["2026-01-15"]
