# -*- coding: utf-8 -*-
"""Gera taxAssessment2026-07.js a partir de icmsApuracaoCalculada.json"""
import json
from pathlib import Path

DATA = Path(r"e:\PROJETOS-CURSOR\RAZAO-CONTADOR\server\src\data")
calc = json.loads((DATA / "icmsApuracaoCalculada.json").read_text(encoding="utf-8"))["2026-07"]

notas = []
for n in calc["antecipacao"]["notas"]:
    notas.append(
        {
            "data": n.get("data"),
            "nf": n.get("nf"),
            "fornecedor": n.get("fornecedor"),
            "uf": n.get("uf"),
            "valor": n.get("valor"),
            "baseCalculo": n.get("baseCalculo"),
            "aliqOrigem": n.get("aliqOrigem"),
            "aliqEstadual": 22.5,
            "aliqFinal": n.get("aliqFinal"),
            "icmsDestacado": n.get("icmsDestacado"),
            "icmsInternoPI": n.get("icmsInternoPI"),
            "valorAPagar": n.get("valorAPagar"),
            "fonte": n.get("fonteAliq"),
            "confianca": n.get("confianca"),
            "obs": "NF só no OCR (fora do SIAT do mês)" if n.get("onlyOcr") else None,
            "dar": None,
        }
    )

saidas = []
for s in calc["icmsNormal"]["saidas"]:
    saidas.append(
        {
            "cfop": s["cfop"],
            "desc": s["desc"],
            "vContabil": s["vContabil"],
            "baseCalculo": s["baseCalculo"],
            "aliquota": s["aliquota"],
            "debito": s["debito"],
            "nDocs": s["n"],
        }
    )

body = {
    "period": "2026-07",
    "company": {
        "name": "FALCÃO & FRAZÃO LTDA",
        "cnpj": "10.876.822/0001-94",
        "ie": "194762769",
    },
    "regime": "Lucro Real (apuração mensal) — PIS/COFINS não-cumulativos",
    "partial": True,
    "calculated": True,
    "missing": ["balancete", "memoria_icms_oficial", "memoria_irpj_csll", "dar"],
    "sourceDocs": {
        "saidasXml": "fiscal_documents (XMLs de venda CFOP 5.102/5.405)",
        "entradasSiat": "entradaSiat-2026-07.json",
        "entradasOcr": "entradaDanfeOcr-2026-07.json",
        "baseLegal": "Decreto 21.866/2023 RICMS-PI arts. 78-82 e art. 21, I, c (alíquota interna 22,5%)",
    },
    "balancete": {
        "receitaBrutaMes": calc["icmsNormal"]["receitaBruta"],
        "deducoes": {"icmsSVenda": calc["icmsNormal"]["debitoSaidas"]},
        "observacao": "Receita/ICMS estimados pelos XMLs de saída (ainda sem Balancete oficial de jul/26).",
    },
    "icms": {
        "mes": "jul/26",
        "status": "calculado — conferir com Memória ICMS da contadora",
        "formulaAntecipacao": calc["formulaAntecipacao"],
        "entradas": [],
        "saidas": saidas,
        "totais": {
            "saidasVContabil": calc["icmsNormal"]["receitaBruta"],
            "saidasBaseCalculo": saidas[0]["baseCalculo"],
            "debitoSaidas": calc["icmsNormal"]["debitoSaidas"],
            "creditoEntradas": None,
            "saldoAnteriorCredor": None,
            "icmsAntecipadoEntradas": calc["antecipacao"]["total"],
            "totalCreditos": None,
            "icmsApuracaoNormal": None,
            "observacao": "Apuração normal completa depende da Memória oficial. Entregues: DÉBITO ICMS sobre vendas + ANTECIPAÇÃO estimada.",
        },
        "antecipacaoTributaria": {
            "base": calc["baseLegal"],
            "formula": calc["formulaAntecipacao"],
            "total": calc["antecipacao"]["total"],
            "observacao": calc["antecipacao"]["observacao"],
            "notas": notas,
        },
    },
}

header = """// server/src/data/taxAssessment2026-07.js
// Gerado por computeIcmsApuracao.js — jul/2026 (parcial, calculado).
// Fórmula antecipação (art. 78 RICMS-PI): base × (22,5% − alíq. interestadual)
// = (base × 22,5%) − ICMS destacado na NF de entrada.

"""
out = DATA / "taxAssessment2026-07.js"
out.write_text(
    header
    + "export const TAX_ASSESSMENT_2026_07 = "
    + json.dumps(body, ensure_ascii=False, indent=2)
    + ";\n",
    encoding="utf-8",
)
print("ok", body["icms"]["totais"]["debitoSaidas"], body["icms"]["antecipacaoTributaria"]["total"])
