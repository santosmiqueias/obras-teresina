import math

import pandas as pd

from gerar_site import limpo
from processar import cidade_citada
from processar_convenios import e_orgao_estadual, grupo, numero


def test_cidade_citada_detecta_outro_municipio():
    assert cidade_citada("UNIDADE ESCOLAR BERNARDO SABINO - Luzilândia - PI") == "Luzilândia"
    assert cidade_citada("Implantação do sistema de esgotamento em Floriano (3ª etapa)/PI") == "Floriano"
    assert cidade_citada("Pavimentação nos municípios de Batalha e Esperantina") == "vários municípios"
    assert cidade_citada("PAC 2 - Cobertura de Quadra Escolar 001/2013 - Prata do Piauí - PI") == "Prata do Piauí"
    assert cidade_citada("701843 - Espaço Educativo - Construção - Socorro do Piauí/PI") == "Socorro do Piauí"


def test_cidade_citada_ignora_teresina_e_estado():
    assert cidade_citada("UNIDADE OPERACIONAL DA PRF EM TERESINA 02") is None
    assert cidade_citada("Obra em Teresina - PI") is None
    assert cidade_citada("Pavimentação Asfáltica em vias de Teresina - PI") is None
    assert cidade_citada("Recuperação de estradas no Município de Teresina - PI") is None
    assert cidade_citada("Dessalinização no Estado do Piauí - PI") is None


def test_numero_converte_formato_brasileiro():
    s = numero(pd.Series(["1.234.567,89", "0,00", "abc"]))
    assert s[0] == 1234567.89 and s[1] == 0
    assert math.isnan(s[2])


def test_grupo_de_situacao():
    assert grupo("EM EXECUÇÃO") == "Em andamento"
    assert grupo("PRESTAÇÃO DE CONTAS REJEITADA") == "Prestação de contas"
    assert grupo("CONVÊNIO ANULADO") == "Cancelado ou anulado"
    assert grupo("ALGO NOVO") == "Outros"


def test_limpo_remove_controle_e_nan():
    assert limpo(float("nan")) is None
    assert limpo("Teresina \x0b PI") == "Teresina PI"
    assert limpo(3.5) == 3.5


def test_orgao_estadual_sai_mas_associacao_fica():
    assert e_orgao_estadual("Administração Pública", "FUNDO DE SAUDE DO ESTADO DO PIAUI")
    assert not e_orgao_estadual("Entidades Sem Fins Lucrativos", "ASSOCIACAO ESPORTE & VIDA DO ESTADO DO PIAUI")
    assert not e_orgao_estadual("Administração Pública", "FUNDACAO UNIVERSIDADE FEDERAL DO PIAUI")
