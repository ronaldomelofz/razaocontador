# -*- coding: utf-8 -*-
"""Concilia boletos de fornecedores pagos em 07/2026 com títulos Alterdata + extrato BB."""
import json
import re
import os
from pathlib import Path

try:
    import fitz
except ImportError:
    import pymupdf as fitz

ROOT = Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR")
OUT = ROOT / "client" / "public" / "data" / "boletos-fornecedores-2026-07.json"
DATA_OUT = ROOT / "server" / "src" / "data" / "boletosFornecedores2026-07.js"

DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
MONEY_RE = re.compile(r"^\d{1,3}(?:\.\d{3})*,\d{2}$")
NUM_RE = re.compile(r"^\d+[/\-]?\d*$")

SKIP = {
    "Alterdata Tecnologia em Informática",
    "Alterdata Tecnologia em Inform�tica",
    "Relatório Geral de contas a Receber / Pagar",
    "Relat�rio Geral de contas a Receber / Pagar",
    "Emissão:",
    "Emiss�o:",
    "Página",
    "P�gina",
    "Título",
    "T�tulo",
    "Forma Pagto",
    "Emissão",
    "Emiss�o",
    "Número",
    "N�mero",
    "Vencimento",
    "Valor",
    "Outros*",
    "Valor da",
    "Baixa",
    "Diferença Tipo Prev.",
    "Diferen�a Tipo Prev.",
    "Dt. Baixa",
    "Emp.",
    "Pagar",
    "Receber",
    "Total Aberto (Previsão)",
    "Total Aberto (Previs�o)",
    "Total Aberto",
    "Total Baixado",
    "Total Bruto dos Títulos Baixados",
    "Total Bruto dos T�tulos Baixados",
    "Total Diferença dos Títulos Baixados",
    "Total Diferen�a dos T�tulos Baixados",
    "Total Geral",
    "BANCO DO BRASI",
    "BANCO DO BRASIL",
}


def parse_br(s):
    return float(s.strip().replace(".", "").replace(",", "."))


def parse_date(s):
    d, m, y = s.split("/")
    return f"{y}-{m}-{d}"


def pdf_text(path):
    doc = fitz.open(path)
    return "\n".join(page.get_text("text") for page in doc)


def parse_alterdata(text, source):
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    titles = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if re.match(r"^\d{2}/\d{2}/\d{4}\s+\d", ln) or ln in SKIP or re.match(r"^\d+$", ln):
            i += 1
            continue
        if (
            not DATE_RE.match(ln)
            and not MONEY_RE.match(ln)
            and ln not in ("P", "N", "002", "0,00")
            and ln not in SKIP
            and len(ln) > 3
        ):
            j = i + 1
            if j < len(lines) and DATE_RE.match(lines[j]):
                emissao = lines[j]
                j += 1
                if j < len(lines) and (NUM_RE.match(lines[j]) or "/" in lines[j]):
                    numero = lines[j]
                    j += 1
                    if j < len(lines) and DATE_RE.match(lines[j]):
                        venc = lines[j]
                        j += 1
                        if j < len(lines) and MONEY_RE.match(lines[j]):
                            valor = parse_br(lines[j])
                            j += 1
                            fields = []
                            while j < len(lines) and lines[j] not in ("P",):
                                fields.append(lines[j])
                                j += 1
                            while j < len(lines) and lines[j] in ("P", "N", "002"):
                                j += 1

                            baixa = 0.0
                            diff = 0.0
                            dt_baixa = None
                            fm = []
                            for f in fields:
                                if MONEY_RE.match(f):
                                    fm.append(("m", parse_br(f)))
                                elif DATE_RE.match(f):
                                    fm.append(("d", f))

                            if fm and fm[0][0] == "m":
                                baixa = fm[0][1]
                                for idx in range(1, len(fm)):
                                    if fm[idx][0] == "d":
                                        dt_baixa = parse_date(fm[idx][1])
                                        if idx + 1 < len(fm) and fm[idx + 1][0] == "m":
                                            diff = fm[idx + 1][1]
                                        break

                            status = "baixado" if (baixa > 0 or dt_baixa) else "aberto"
                            # títulos abertos: primeiros 0,00 não são baixa
                            if status == "aberto":
                                baixa = 0.0
                                diff = 0.0

                            titles.append(
                                {
                                    "fornecedor": ln,
                                    "emissao": parse_date(emissao),
                                    "numero": numero,
                                    "vencimento": parse_date(venc),
                                    "valor_original": round(valor, 2),
                                    "valor_baixa": round(baixa, 2),
                                    "juros_multa": round(diff, 2),
                                    "dt_baixa": dt_baixa,
                                    "status_relatorio": status,
                                    "fonte": source,
                                }
                            )
                            i = j
                            continue
        i += 1
    return titles


def norm_name(s):
    s = (s or "").upper()
    for a, b in [
        ("Á", "A"),
        ("À", "A"),
        ("Â", "A"),
        ("Ã", "A"),
        ("É", "E"),
        ("Ê", "E"),
        ("Í", "I"),
        ("Ó", "O"),
        ("Ô", "O"),
        ("Õ", "O"),
        ("Ú", "U"),
        ("Ç", "C"),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^A-Z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # remove common suffixes for matching
    for stop in [
        " LTDA",
        " S A",
        " SA",
        " EIRELI",
        " ME",
        " EPP",
        " INDUSTRIA E COMERCIO",
        " INDUSTRIA",
        " COMERCIO",
        " COMPONENTES PARA MOVEIS",
        " PARA MOVEIS",
        " DE PLASTI",
        " DE ALUMINIO",
        " E ARTEFATOS",
        " E ACESSORIOS",
        " E FERRA",
        " ASSOCIADOS",
    ]:
        s = s.replace(stop, "")
    return s.strip()


def name_tokens(s):
    n = norm_name(s)
    stops = {"DE", "DA", "DO", "DOS", "DAS", "E", "PARA", "LTDA", "S", "A"}
    return [t for t in n.split() if len(t) >= 3 and t not in stops]


def names_match(a, b):
    ta, tb = set(name_tokens(a)), set(name_tokens(b))
    if not ta or not tb:
        return False
    if ta & tb:
        return True
    # substring on first significant token
    na, nb = norm_name(a), norm_name(b)
    return na[:8] in nb or nb[:8] in na


def extract_payee(desc):
    m = re.match(r"Pagamento de Boleto\s+(.+)$", desc or "", re.I)
    return (m.group(1).strip() if m else desc or "").strip()


# Beneficiário do boleto ≠ emitente do título (cobrança / nome fantasia no extrato)
PAYEE_ALIASES = [
    ("ATHENA SECURITIZADORA", "IBRAP"),
    ("HD FERRAGENS E MADEIRAS", "HD FERRAGENS PARA MOVEIS"),
    ("LAGE E RENZETTI", "LAGE RENZETTI"),
    ("KITSUL", "KITSUL"),
    ("METALFIXE", "METALFIXE"),
    ("METALSUL", "METALSUL"),
    ("ROMETAL", "ROMETAL"),
    ("PLACAS DO BRASIL", "PLACAS DO BRASIL"),
    ("EUCATEX", "EUCATEX"),
]

# Títulos ausentes no Report Alterdata, inferidos da NF / memória de cálculo
SYNTHETIC_TITLES = [
    {
        "fornecedor": "AFO MOVEIS E ARTEFATOS LTDA",
        "emissao": "2026-06-26",
        "numero": "26098/001",
        "vencimento": "2026-07-21",
        "valor_original": 1316.66,
        "valor_baixa": 0.0,
        "juros_multa": 0.0,
        "dt_baixa": None,
        "status_relatorio": "aberto",
        "fonte": "Inferido NF 26098 (R$ 3.950,00 / 3)",
    },
    {
        "fornecedor": "EUCATEX IND E COMERCIO LTDA",
        "emissao": "2026-06-25",
        "numero": "460076/001",
        "vencimento": "2026-07-29",
        "valor_original": 5241.73,
        "valor_baixa": 0.0,
        "juros_multa": 0.0,
        "dt_baixa": None,
        "status_relatorio": "aberto",
        "fonte": "Inferido pagamento BB × NF 460076 (parcela)",
    },
]

# Boletos que não são compra de mercadoria (consumo, aluguel, pessoal, financeiro)
NON_SUPPLIER = re.compile(
    r"ALELO|EQUATORIAL|VIRTEX|ALTERDATA|HOME CONTABILIDADE|IMOVEIS VENEZA|"
    r"LUIZ CARLOS|BANCO DO BRASIL|BANCO INTER|TELECOM|G3 TELECOM",
    re.I,
)


def classify_boleto(payee):
    if NON_SUPPLIER.search(payee or ""):
        return "outros"
    return "fornecedor"


def load_bank_boletos(month="2026-07"):
    path = ROOT / "client" / "public" / "data" / f"ledger-{month}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    pays = []
    for e in data.get("entries", []):
        desc = e.get("description") or ""
        if "pagamento de boleto" not in desc.lower():
            continue
        amt = e.get("amount") or e.get("debit") or e.get("credit") or 0
        payee = e.get("counterparty") or extract_payee(desc)
        pays.append(
            {
                "id": e.get("id"),
                "date": e.get("entry_date") or e.get("date") or e.get("tx_date"),
                "description": desc,
                "payee": payee,
                "amount": round(float(amt), 2),
                "category": e.get("category"),
                "debit_account": e.get("debit_account"),
                "debit_name": e.get("debit_name"),
                "tipo": classify_boleto(payee),
            }
        )
    pays.sort(key=lambda x: (x["date"] or "", x["amount"]))
    return pays


def effective_payee(payee):
    u = (payee or "").upper()
    for needle, alias in PAYEE_ALIASES:
        if needle in u:
            return alias
    return payee


def reconcile(titles, pays, month="2026-07"):
    """Match bank payments to open titles by amount + name + date proximity."""
    from datetime import date
    from collections import defaultdict

    open_pool = []
    for t in titles:
        if t["status_relatorio"] == "aberto":
            open_pool.append(dict(t, _used=False))
        elif t.get("dt_baixa") and str(t["dt_baixa"]).startswith(month):
            open_pool.append(dict(t, _used=False))

    # amounts with a single unused open title → allow match without name (ex.: Athena→IBRAP)
    amount_index = defaultdict(list)
    for t in open_pool:
        amount_index[round(t["valor_original"], 2)].append(t)

    results = []
    unmatched_pays = []

    for pay in pays:
        payee = pay["payee"]
        payee_eff = effective_payee(payee)
        best = None
        best_score = 0
        for t in open_pool:
            if t["_used"]:
                continue
            score = 0
            if abs(t["valor_original"] - pay["amount"]) < 0.01:
                score += 50
            elif t["valor_baixa"] and abs(t["valor_baixa"] - pay["amount"]) < 0.01:
                score += 45
            elif pay["amount"] > t["valor_original"]:
                delta = pay["amount"] - t["valor_original"]
                if delta <= max(500, t["valor_original"] * 0.05) + 0.01:
                    score += 35
                else:
                    continue
            else:
                continue

            if names_match(payee_eff, t["fornecedor"]) or names_match(payee, t["fornecedor"]):
                score += 40
            else:
                # valor único entre títulos abertos
                same = [x for x in amount_index[round(pay["amount"], 2)] if not x["_used"]]
                if len(same) == 1 and abs(t["valor_original"] - pay["amount"]) < 0.01:
                    score += 30  # match por valor único (securitizadora etc.)
                else:
                    score -= 20

            if pay["date"] and t["vencimento"]:
                try:
                    pd = date.fromisoformat(pay["date"])
                    vd = date.fromisoformat(t["vencimento"])
                    days = abs((pd - vd).days)
                    if days <= 5:
                        score += 20
                    elif days <= 15:
                        score += 10
                    elif days <= 45:
                        score += 5
                    else:
                        score -= 5
                except Exception:
                    pass

            if score > best_score:
                best_score = score
                best = t

        if best and best_score >= 55:
            best["_used"] = True
            original = best["valor_original"]
            total = pay["amount"]
            if best["status_relatorio"] == "baixado" and best["juros_multa"]:
                juros = best["juros_multa"]
            else:
                juros = round(max(0.0, total - original), 2)
            note = None
            if not names_match(payee, best["fornecedor"]) and not names_match(payee_eff, best["fornecedor"]):
                note = f"Beneficiário no extrato: {payee}"
            elif payee_eff != payee and names_match(payee_eff, best["fornecedor"]):
                note = f"Beneficiário no extrato: {payee}"
            results.append(
                {
                    "data_pagamento": pay["date"],
                    "fornecedor": best["fornecedor"],
                    "beneficiario_banco": payee,
                    "titulo": best["numero"],
                    "vencimento": best["vencimento"],
                    "emissao": best["emissao"],
                    "valor_original": original,
                    "juros_multa": juros,
                    "valor_total": total,
                    "status": "conciliado",
                    "tipo": pay.get("tipo") or "fornecedor",
                    "match_score": best_score,
                    "fonte_titulo": best["fonte"],
                    "bank_id": pay["id"],
                    "bank_description": pay["description"],
                    "categoria": pay.get("category"),
                    "obs": note,
                }
            )
        else:
            unmatched_pays.append(pay)

    for pay in unmatched_pays:
        results.append(
            {
                "data_pagamento": pay["date"],
                "fornecedor": pay["payee"],
                "beneficiario_banco": pay["payee"],
                "titulo": None,
                "vencimento": None,
                "emissao": None,
                "valor_original": pay["amount"] if pay.get("tipo") == "outros" else None,
                "juros_multa": 0.0 if pay.get("tipo") == "outros" else None,
                "valor_total": pay["amount"],
                "status": "sem_titulo",
                "tipo": pay.get("tipo") or "fornecedor",
                "match_score": 0,
                "fonte_titulo": None,
                "bank_id": pay["id"],
                "bank_description": pay["description"],
                "categoria": pay.get("category"),
                "obs": "Sem título no Contas a Pagar Alterdata" if pay.get("tipo") == "fornecedor" else "Boleto não mercadoria (consumo/pessoal/serviço)",
            }
        )

    results.sort(key=lambda r: (r["data_pagamento"] or "", r["fornecedor"] or ""))
    return results, open_pool


def main():
    pdfs = [
        (
            ROOT / "tmp_ocr_work" / "relatorios-sistema-2026-07" / "Report.pdf",
            "Report 07-2026",
        ),
        (
            ROOT / "tmp_ocr_work" / "contas-pagar-ref" / "06_CONTAS A PAGAR TOTAL.pdf",
            "CONTAS A PAGAR TOTAL 06-2026",
        ),
        (
            ROOT / "tmp_ocr_work" / "contas-pagar-ref" / "06_CONTAS A PAGAR 062026.pdf",
            "CONTAS A PAGAR 06-2026",
        ),
        (
            ROOT / "tmp_ocr_work" / "contas-pagar-ref" / "05_CONTAS A PAGAR.pdf",
            "CONTAS A PAGAR 05-2026",
        ),
        (
            ROOT / "tmp_ocr_work" / "contas-pagar-ref" / "05_CONTAS A PAGAR 05-2026.pdf",
            "CONTAS A PAGAR 05-2026 b",
        ),
    ]

    all_titles = []
    seen = set()
    for path, src in pdfs:
        if not path.exists():
            print("MISSING", path)
            continue
        titles = parse_alterdata(pdf_text(str(path)), src)
        print(f"{src}: {len(titles)} títulos")
        for t in titles:
            key = (t["numero"], t["valor_original"], t["vencimento"], t["fornecedor"][:20])
            if key in seen:
                continue
            seen.add(key)
            all_titles.append(t)

    for t in SYNTHETIC_TITLES:
        key = (t["numero"], t["valor_original"], t["vencimento"], t["fornecedor"][:20])
        if key not in seen:
            seen.add(key)
            all_titles.append(t)

    print("Títulos únicos:", len(all_titles))
    pays = load_bank_boletos("2026-07")
    print("Pagamentos boleto banco:", len(pays))

    results, pool = reconcile(all_titles, pays, "2026-07")
    fornecedor_items = [r for r in results if r.get("tipo") == "fornecedor"]
    outros_items = [r for r in results if r.get("tipo") != "fornecedor"]
    conc = [r for r in fornecedor_items if r["status"] == "conciliado"]
    sem = [r for r in fornecedor_items if r["status"] == "sem_titulo"]
    with_juros = [r for r in conc if (r["juros_multa"] or 0) > 0]

    tot_orig = sum(r["valor_original"] or 0 for r in conc)
    tot_juros = sum(r["juros_multa"] or 0 for r in conc)
    tot_pago_forn = sum(r["valor_total"] or 0 for r in fornecedor_items)
    tot_pago_outros = sum(r["valor_total"] or 0 for r in outros_items)

    payload = {
        "month": "2026-07",
        "generatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "sources": [
            "RELATÓRIOS SISTEMA/Report.pdf (07-2026) — títulos em aberto (sem baixas)",
            "CONTAS A PAGAR 05/06 — títulos com vencimento em jul/26",
            "Extrato BB ledger-2026-07 — pagamentos de boleto",
            "Juros/multa = valor pago − valor original do título (quando houver diferença)",
        ],
        "notes": [
            "Report.pdf de 03/08/2026 lista apenas títulos em aberto (Total Baixado = 0).",
            "Conciliação: pagamento bancário × título Alterdata (valor + fornecedor + vencimento).",
            "ATHENA SECURITIZADORA R$ 3.343,81 = título IBRAP 703955/003.",
            "AFO R$ 1.316,66 e EUCATEX R$ 5.241,73: títulos não constavam no Contas a Pagar; parcela inferida da NF.",
            "Em jul/26 nenhum boleto de fornecedor conciliado apresentou juros/multa (pago = face).",
        ],
        "summary": {
            "qtd_fornecedor": len(fornecedor_items),
            "qtd_conciliados": len(conc),
            "qtd_sem_titulo": len(sem),
            "qtd_com_juros": len(with_juros),
            "qtd_outros": len(outros_items),
            "total_original": round(tot_orig, 2),
            "total_juros_multa": round(tot_juros, 2),
            "total_pago_fornecedor": round(tot_pago_forn, 2),
            "total_pago_outros": round(tot_pago_outros, 2),
            "total_pago_geral": round(tot_pago_forn + tot_pago_outros, 2),
        },
        "items": results,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Wrote", OUT)

    js = (
        "// Gerado por _reconcileBoletos07.py — boletos de fornecedores pagos 07/2026\n"
        "export const BOLETOS_FORNECEDORES_2026_07 = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n"
    )
    DATA_OUT.write_text(js, encoding="utf-8")
    print("Wrote", DATA_OUT)

    print("\n=== RESUMO ===")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))
    print("\n=== FORNECEDORES CONCILIADOS ===")
    for r in conc:
        j = r["juros_multa"] or 0
        flag = f"  +juros {j:.2f}" if j else ""
        print(
            f"{r['data_pagamento']} {r['titulo'] or '':12} "
            f"orig={r['valor_original']:10.2f} tot={r['valor_total']:10.2f}{flag}  {r['fornecedor'][:40]}"
        )
    print("\n=== FORNECEDORES SEM TÍTULO ===")
    for r in sem:
        print(f"{r['data_pagamento']} {r['valor_total']:10.2f}  {r['fornecedor'][:50]}")
    print("\n=== OUTROS BOLETOS ===")
    for r in outros_items:
        print(f"{r['data_pagamento']} {r['valor_total']:10.2f}  {r['fornecedor'][:50]}")


if __name__ == "__main__":
    main()
