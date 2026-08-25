# -*- coding: utf-8 -*-
"""
Gera boletos-fornecedores-YYYY-MM.json para todos os meses do ledger.
Varre TODAS as contas bancárias: boletos, PIX a fornecedores, SISPAG, títulos Inter.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

try:
    import fitz
except ImportError:
    import pymupdf as fitz

ROOT = Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR")
DATA = ROOT / "client" / "public" / "data"
COMPROV_DIR = DATA / "comprovantes"
TMP_TITLES = ROOT / "tmp_ocr_work"

BANK_SHORT = {
    "bb-847-8": "Banco do Brasil",
    "inter-9908006-0": "Banco Inter",
    "bnb-119424-3": "BNB",
    "itau-29660-2": "Itaú 29660-2",
    "itau-57563-6": "Itaú 57563-6",
    "itau-31689-7": "Itaú 31689-7",
    "itau-05068-7": "Itaú 05068-7",
    "itau-33489-0": "Itaú 33489-0",
    "mercadopago": "Mercado Pago",
}

NON_SUPPLIER = re.compile(
    r"ALELO|EQUATORIAL|VIRTEX|ALTERDATA|HOME CONTABILIDADE|IMOVEIS VENEZA|"
    r"LUIZ CARLOS|BANCO DO BRASIL S/A|BANCO INTER SA|TELECOM|G3 TELECOM|"
    r"RECEITA FEDERAL|AGUAS DE TERESINA|TIM S/A|FGTS|GOV PI|DARF|"
    r"ROGERIO SILVA|RONALDO LEAO|PRO-LABORE|PENSAO",
    re.I,
)

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
    ("STARRETT", "STARRETT"),
    ("AFO MOVEIS", "AFO"),
]

KNOWN_SUPPLIERS = re.compile(
    r"PLACAS|UNA LTDA|HD FERRAGENS|KITSUL|LAGE|RENZETTI|METALFIXE|METALSUL|"
    r"ROMETAL|STARRETT|EUCATEX|AFO MOVEIS|IBRAP|ATHENA|TABONE|IBYTE|"
    r"SISPAG FORNECEDORES|FORNECEDOR",
    re.I,
)

DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
MONEY_RE = re.compile(r"^\d{1,3}(?:\.\d{3})*,\d{2}$")
NUM_RE = re.compile(r"^\d+[/\-]?\d*$")

SKIP_ALTERDATA = {
    "Alterdata Tecnologia em Informática", "Alterdata Tecnologia em Inform�tica",
    "Relatório Geral de contas a Receber / Pagar", "Relat�rio Geral de contas a Receber / Pagar",
    "Emissão:", "Emiss�o:", "Página", "P�gina", "Título", "T�tulo", "Forma Pagto",
    "Emissão", "Emiss�o", "Número", "N�mero", "Vencimento", "Valor", "Outros*",
    "Valor da", "Baixa", "Diferença Tipo Prev.", "Diferen�a Tipo Prev.", "Dt. Baixa", "Emp.",
    "Pagar", "Receber", "Total Aberto (Previsão)", "Total Aberto (Previs�o)", "Total Aberto",
    "Total Baixado", "Total Bruto dos Títulos Baixados", "Total Bruto dos T�tulos Baixados",
    "Total Diferença dos Títulos Baixados", "Total Diferen�a dos T�tulos Baixados", "Total Geral",
    "BANCO DO BRASI", "BANCO DO BRASIL",
}


def parse_br(s):
    return float(str(s).strip().replace(".", "").replace(",", "."))


def parse_date_br(s):
    d, m, y = s.split("/")
    return f"{y}-{m}-{d}"


def norm_name(s):
    s = (s or "").upper()
    for a, b in [
        ("Á", "A"), ("À", "A"), ("Â", "A"), ("Ã", "A"), ("É", "E"), ("Ê", "E"),
        ("Í", "I"), ("Ó", "O"), ("Ô", "O"), ("Õ", "O"), ("Ú", "U"), ("Ç", "C"),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^A-Z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def name_tokens(s):
    stops = {"DE", "DA", "DO", "DOS", "DAS", "E", "PARA", "LTDA", "S", "A", "ME", "SA"}
    return [t for t in norm_name(s).split() if len(t) >= 3 and t not in stops]


def names_match(a, b):
    ta, tb = set(name_tokens(a)), set(name_tokens(b))
    if not ta or not tb:
        return False
    if ta & tb:
        return True
    na, nb = norm_name(a), norm_name(b)
    return na[:8] in nb or nb[:8] in na


def effective_payee(payee):
    u = (payee or "").upper()
    for needle, alias in PAYEE_ALIASES:
        if needle in u:
            return alias
    return payee


def classify_tipo(payee, forma):
    if forma == "sispag":
        return "fornecedor"
    if NON_SUPPLIER.search(payee or ""):
        return "outros"
    return "fornecedor"


def detect_forma(desc):
    d = (desc or "").lower()
    if "sispag" in d:
        return "sispag"
    if "pix" in d:
        return "pix"
    if "boleto" in d or "titulo" in d or "título" in d:
        return "boleto"
    if "ted" in d or "doc " in d:
        return "ted"
    return "outro"


def extract_payee(entry):
    if entry.get("counterparty"):
        return entry["counterparty"].strip()
    desc = entry.get("description") or ""
    for pat in [
        r"Pagamento de Boleto\s+(.+)$",
        r"Pagamento de Titulo\s*-?\s*(?:Inter:\s*)?(.+)$",
        r"Pix - Enviado\s+\d{2}/\d{2}\s+\d{2}:\d{2}\s+(.+)$",
        r"Pix - Enviado\s+(.+)$",
        r"SISPAG\s+(.+)$",
    ]:
        m = re.match(pat, desc, re.I)
        if m:
            return m.group(1).strip()
    return desc.strip()


def is_supplier_payment(entry):
    """True if this bank outflow looks like a supplier payment."""
    desc = entry.get("description") or ""
    cat = entry.get("category") or ""
    da = entry.get("debit_account") or ""
    blob = f"{desc} {cat} {entry.get('debit_name') or ''} {entry.get('counterparty') or ''}"

    # explicit forms
    if re.search(r"pagamento de boleto|pagamento de titulos?|sispag\s+fornecedor", desc, re.I):
        return True
    if da.startswith("2.01.01") and "pagamento a fornecedor" in cat.lower():
        return True
    if "pagamento a fornecedor" in cat.lower():
        return True
    # PIX / TED to known merchandise suppliers
    if re.search(r"pix\s*-\s*enviado|ted|doc\s", desc, re.I) and KNOWN_SUPPLIERS.search(blob):
        # exclude receita federal etc already in NON if we classify later
        if NON_SUPPLIER.search(desc):
            return False
        return True
    return False


def load_ledger(month):
    p = DATA / f"ledger-{month}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def collect_payments(ledger):
    pays = []
    for e in ledger.get("entries", []):
        if not e.get("bank_account_id"):
            continue
        if not is_supplier_payment(e):
            continue
        # skip pure internal / credit-side bank mirror nonsense: we want money leaving the account
        # In ledger, payments debit expense/supplier and credit bank — amount is positive
        payee = extract_payee(e)
        forma = detect_forma(e.get("description") or "")
        tipo = classify_tipo(payee, forma)
        bank_id = e.get("bank_account_id")
        pays.append(
            {
                "id": e.get("id"),
                "date": e.get("entry_date") or e.get("date"),
                "description": e.get("description"),
                "payee": payee,
                "amount": round(float(e.get("amount") or 0), 2),
                "category": e.get("category"),
                "debit_account": e.get("debit_account"),
                "debit_name": e.get("debit_name"),
                "credit_name": e.get("credit_name"),
                "bank_account_id": bank_id,
                "banco_curto": BANK_SHORT.get(bank_id, bank_id),
                "banco": e.get("credit_name") or BANK_SHORT.get(bank_id, bank_id),
                "forma": forma,
                "tipo": tipo,
            }
        )
    pays.sort(key=lambda x: (x["date"] or "", x["bank_account_id"] or "", x["amount"]))
    return pays


def parse_alterdata(text, source):
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    titles = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if re.match(r"^\d{2}/\d{2}/\d{4}\s+\d", ln) or ln in SKIP_ALTERDATA or re.match(r"^\d+$", ln):
            i += 1
            continue
        if (
            not DATE_RE.match(ln)
            and not MONEY_RE.match(ln)
            and ln not in ("P", "N", "002", "0,00")
            and ln not in SKIP_ALTERDATA
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
                                        dt_baixa = parse_date_br(fm[idx][1])
                                        if idx + 1 < len(fm) and fm[idx + 1][0] == "m":
                                            diff = fm[idx + 1][1]
                                        break
                            status = "baixado" if (baixa > 0 or dt_baixa) else "aberto"
                            if status == "aberto":
                                baixa = 0.0
                                diff = 0.0
                            titles.append(
                                {
                                    "fornecedor": ln,
                                    "emissao": parse_date_br(emissao),
                                    "numero": numero,
                                    "vencimento": parse_date_br(venc),
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


def load_titles_for_month(month):
    """Load Alterdata titles from local OCR copies when available."""
    titles = []
    seen = set()
    candidates = []
    if month == "2026-07":
        candidates = [
            (TMP_TITLES / "relatorios-sistema-2026-07" / "Report.pdf", "Report 07"),
            (TMP_TITLES / "contas-pagar-ref" / "06_CONTAS A PAGAR TOTAL.pdf", "CP TOTAL 06"),
            (TMP_TITLES / "contas-pagar-ref" / "06_CONTAS A PAGAR 062026.pdf", "CP 06"),
            (TMP_TITLES / "contas-pagar-ref" / "05_CONTAS A PAGAR.pdf", "CP 05"),
        ]
        # synthetic
        extras = [
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
                "fonte": "Inferido NF 26098",
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
                "fonte": "Inferido NF 460076",
            },
        ]
    elif month == "2026-06":
        candidates = [
            (TMP_TITLES / "contas-pagar-ref" / "06_CONTAS A PAGAR TOTAL.pdf", "CP TOTAL 06"),
            (TMP_TITLES / "contas-pagar-ref" / "05_CONTAS A PAGAR.pdf", "CP 05"),
        ]
        extras = []
    elif month == "2026-05":
        candidates = [
            (TMP_TITLES / "contas-pagar-ref" / "05_CONTAS A PAGAR.pdf", "CP 05"),
            (TMP_TITLES / "contas-pagar-ref" / "05_CONTAS A PAGAR 05-2026.pdf", "CP 05b"),
        ]
        extras = []
    else:
        extras = []

    for path, src in candidates:
        if not path.exists():
            continue
        doc = fitz.open(path)
        text = "\n".join(page.get_text("text") for page in doc)
        doc.close()
        for t in parse_alterdata(text, src):
            key = (t["numero"], t["valor_original"], t["vencimento"], t["fornecedor"][:20])
            if key in seen:
                continue
            seen.add(key)
            titles.append(t)
    for t in extras:
        key = (t["numero"], t["valor_original"], t["vencimento"], t["fornecedor"][:20])
        if key not in seen:
            seen.add(key)
            titles.append(t)
    return titles


def reconcile(titles, pays, month):
    open_pool = []
    for t in titles:
        if t["status_relatorio"] == "aberto":
            open_pool.append(dict(t, _used=False))
        elif t.get("dt_baixa") and str(t["dt_baixa"]).startswith(month):
            open_pool.append(dict(t, _used=False))

    amount_index = defaultdict(list)
    for t in open_pool:
        amount_index[round(t["valor_original"], 2)].append(t)

    results = []
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
                same = [x for x in amount_index[round(pay["amount"], 2)] if not x["_used"]]
                if len(same) == 1 and abs(t["valor_original"] - pay["amount"]) < 0.01:
                    score += 30
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

        base = {
            "data_pagamento": pay["date"],
            "fornecedor": payee,
            "beneficiario_banco": payee,
            "titulo": None,
            "vencimento": None,
            "emissao": None,
            "valor_original": None,
            "juros_multa": None,
            "valor_total": pay["amount"],
            "status": "sem_titulo",
            "tipo": pay["tipo"],
            "forma": pay["forma"],
            "match_score": 0,
            "fonte_titulo": None,
            "bank_id": pay["id"],
            "bank_account_id": pay["bank_account_id"],
            "banco": pay["banco"],
            "banco_curto": pay["banco_curto"],
            "bank_description": pay["description"],
            "categoria": pay.get("category"),
            "obs": None,
            "comprovante": None,
        }

        if best and best_score >= 55:
            best["_used"] = True
            original = best["valor_original"]
            total = pay["amount"]
            juros = (
                best["juros_multa"]
                if best["status_relatorio"] == "baixado" and best["juros_multa"]
                else round(max(0.0, total - original), 2)
            )
            note = None
            if not names_match(payee, best["fornecedor"]):
                note = f"Beneficiário no extrato: {payee}"
            base.update(
                {
                    "fornecedor": best["fornecedor"],
                    "titulo": best["numero"],
                    "vencimento": best["vencimento"],
                    "emissao": best["emissao"],
                    "valor_original": original,
                    "juros_multa": juros,
                    "valor_total": total,
                    "status": "conciliado",
                    "match_score": best_score,
                    "fonte_titulo": best["fonte"],
                    "obs": note,
                }
            )
        else:
            if pay["tipo"] == "outros":
                base["valor_original"] = pay["amount"]
                base["juros_multa"] = 0.0
                base["obs"] = "Boleto/pagamento não mercadoria (consumo/pessoal/serviço)"
            elif pay["forma"] == "sispag":
                base["valor_original"] = pay["amount"]
                base["juros_multa"] = 0.0
                base["obs"] = "SISPAG Itaú — sem discriminação de título no extrato"
                base["fornecedor"] = "SISPAG FORNECEDORES (Itaú)"
            else:
                base["obs"] = "Sem título no Contas a Pagar / não conciliado"
                # for pix to known supplier without title still show as fornecedor pending
                if pay["forma"] == "pix" and pay["tipo"] == "fornecedor":
                    base["valor_original"] = pay["amount"]
                    base["juros_multa"] = 0.0

        results.append(base)

    results.sort(key=lambda r: (r["data_pagamento"] or "", r["banco_curto"] or "", r["fornecedor"] or ""))
    return results


def parse_bb_comprovantes(pdf_path):
    doc = fitz.open(pdf_path)
    pages = []
    for i in range(len(doc)):
        t = doc[i].get_text("text")
        is_pix = "Comprovante Pix" in t
        is_pay = "COMPROVANTE DE PAGAMENTO" in t or is_pix
        if not is_pay:
            continue
        ben = re.search(r"BENEFICIARIO:\s*\n(.+)", t)
        if not ben and is_pix:
            ben = re.search(r"PAGO PARA:\s*(.+)", t) or re.search(r"NOME:\s*(.+)", t)
        doc_val = re.search(r"VALOR DO DOCUMENTO\s+([\d.]+,\d{2})", t)
        cob_val = re.search(r"VALOR COBRADO\s+([\d.]+,\d{2})", t)
        pix_val = re.search(r"VALOR:\s*R\$\s*([\d.]+,\d{2})", t)
        dt_pag = re.search(r"DATA DO PAGAMENTO\s+(\d{2}/\d{2}/\d{4})", t)
        if not dt_pag and is_pix:
            dt_pag = re.search(r"DATA:\s+(\d{2}/\d{2}/\d{4})", t)
        autent = re.search(r"NR\.AUTENTICACAO\s+([0-9A-F.]+)", t)
        ag = re.search(r"AGENCIA:\s*([\d-]+)", t)
        cc = re.search(r"CONTA:\s*([\d-]+)", t)
        if is_pix:
            amount = parse_br(pix_val.group(1)) if pix_val else None
            original, cobrado = amount, amount
        else:
            original = parse_br(doc_val.group(1)) if doc_val else None
            cobrado = parse_br(cob_val.group(1)) if cob_val else original
        if cobrado is None:
            continue
        juros = round((cobrado or 0) - (original or 0), 2) if original is not None else 0.0
        pages.append(
            {
                "page": i + 1,
                "page_index": i,
                "beneficiario": (ben.group(1).strip() if ben else ""),
                "data_pagamento": parse_date_br(dt_pag.group(1)) if dt_pag else None,
                "valor_documento": original,
                "valor_cobrado": cobrado,
                "juros_multa": max(0.0, juros),
                "autenticacao": autent.group(1) if autent else None,
                "agencia": ag.group(1) if ag else "3219-0",
                "conta": (cc.group(1).strip() if cc else "847-8"),
                "is_pix": is_pix,
            }
        )
    return doc, pages


def slug(s, n=24):
    s = re.sub(r"[^A-Za-z0-9]+", "-", (s or "").upper()).strip("-")
    return (s[:n] or "X")


def link_comprovantes(month, items):
    pdf = ROOT / "tmp_ocr_work" / "bb-comprovantes-07" / "04082026 123025-Comprovantes-BB.pdf"
    if month != "2026-07" or not pdf.exists():
        return items

    dest_dir = COMPROV_DIR / month
    dest_dir.mkdir(parents=True, exist_ok=True)
    doc, pages = parse_bb_comprovantes(pdf)
    used = set()
    for item in items:
        if item.get("bank_account_id") != "bb-847-8":
            continue
        best = None
        best_score = 0
        payee = item.get("beneficiario_banco") or item.get("fornecedor") or ""
        amount = item.get("valor_total")
        dt = item.get("data_pagamento")
        for p in pages:
            if p["page"] in used:
                continue
            score = 0
            if amount is not None and abs((p["valor_cobrado"] or 0) - amount) < 0.02:
                score += 50
            else:
                continue
            if dt and p["data_pagamento"] == dt:
                score += 25
            if names_match(payee, p["beneficiario"]) or names_match(item.get("fornecedor"), p["beneficiario"]):
                score += 30
            # PIX vs boleto preference
            if item.get("forma") == "pix" and p["is_pix"]:
                score += 15
            if item.get("forma") == "boleto" and not p["is_pix"]:
                score += 10
            if score > best_score:
                best_score = score
                best = p
        if best and best_score >= 50:
            used.add(best["page"])
            h = hashlib.sha1(f"{best['page']}-{amount}".encode()).hexdigest()[:8]
            fname = f"{best['data_pagamento'] or 'x'}_{h}_{slug(best['beneficiario'])}.pdf"
            dest = dest_dir / fname
            single = fitz.open()
            single.insert_pdf(doc, from_page=best["page_index"], to_page=best["page_index"])
            single.save(dest)
            single.close()
            item["comprovante"] = {
                "url": f"/data/comprovantes/{month}/{fname}",
                "file_name": fname,
                "page": best["page"],
                "autenticacao": best["autenticacao"],
                "agencia": best["agencia"],
                "conta": best["conta"],
            }
            if best["valor_documento"] is not None and item.get("valor_original") is None:
                item["valor_original"] = best["valor_documento"]
            if best["juros_multa"] and (item.get("juros_multa") or 0) == 0:
                item["juros_multa"] = best["juros_multa"]
                if best["valor_documento"] is not None:
                    item["valor_original"] = best["valor_documento"]
                    item["valor_total"] = best["valor_cobrado"]
    doc.close()
    return items


def summarize(items):
    forn = [i for i in items if i.get("tipo") == "fornecedor"]
    outros = [i for i in items if i.get("tipo") != "fornecedor"]
    conc = [i for i in forn if i.get("status") == "conciliado"]
    by_bank = defaultdict(lambda: {"qtd": 0, "total": 0.0})
    by_forma = defaultdict(lambda: {"qtd": 0, "total": 0.0})
    for i in forn:
        by_bank[i.get("banco_curto") or "?"]["qtd"] += 1
        by_bank[i.get("banco_curto") or "?"]["total"] += i.get("valor_total") or 0
        by_forma[i.get("forma") or "?"]["qtd"] += 1
        by_forma[i.get("forma") or "?"]["total"] += i.get("valor_total") or 0
    return {
        "qtd_fornecedor": len(forn),
        "qtd_conciliados": len(conc),
        "qtd_sem_titulo": sum(1 for i in forn if i.get("status") != "conciliado"),
        "qtd_com_juros": sum(1 for i in forn if (i.get("juros_multa") or 0) > 0),
        "qtd_outros": len(outros),
        "qtd_com_comprovante": sum(1 for i in items if i.get("comprovante")),
        "total_original": round(sum(i.get("valor_original") or 0 for i in conc), 2),
        "total_juros_multa": round(sum(i.get("juros_multa") or 0 for i in forn if i.get("juros_multa")), 2),
        "total_pago_fornecedor": round(sum(i.get("valor_total") or 0 for i in forn), 2),
        "total_pago_outros": round(sum(i.get("valor_total") or 0 for i in outros), 2),
        "total_pago_geral": round(sum(i.get("valor_total") or 0 for i in items), 2),
        "por_banco": {k: {"qtd": v["qtd"], "total": round(v["total"], 2)} for k, v in by_bank.items()},
        "por_forma": {k: {"qtd": v["qtd"], "total": round(v["total"], 2)} for k, v in by_forma.items()},
    }


def build_month(month):
    ledger = load_ledger(month)
    if not ledger:
        print("skip missing", month)
        return None
    pays = collect_payments(ledger)
    titles = load_titles_for_month(month)
    items = reconcile(titles, pays, month)
    items = link_comprovantes(month, items)
    summary = summarize(items)
    payload = {
        "month": month,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sources": [
            f"Extratos ledger-{month}.json (todas as contas)",
            "Contas a Pagar Alterdata (quando disponível)",
            "Comprovantes BB (quando disponível)",
        ],
        "notes": [
            "Varredura em todas as contas: BB, Inter, Itaú e demais do razão.",
            "Inclui boletos, PIX a fornecedores, SISPAG e pagamentos de título.",
            "Juros/multa = valor cobrado − valor do documento (quando houver diferença).",
        ],
        "summary": summary,
        "items": items,
    }
    out = DATA / f"boletos-fornecedores-{month}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(month, "pays", len(pays), "items", len(items), "summary", summary)
    return payload


def main():
    months = []
    for p in sorted(DATA.glob("ledger-*.json")):
        m = re.match(r"ledger-(\d{4}-\d{2})\.json$", p.name)
        if m:
            months.append(m.group(1))
    all_data = {}
    for month in months:
        payload = build_month(month)
        if payload:
            all_data[month] = payload

    # JS module for Express (latest months)
    js_parts = ["// Gerado por buildBoletosFornecedores.py\n"]
    for month, payload in all_data.items():
        const = "BOLETOS_FORNECEDORES_" + month.replace("-", "_")
        js_parts.append(f"export const {const} = {json.dumps(payload, ensure_ascii=False, indent=2)};\n")
    js_parts.append(
        "export const BOLETOS_FORNECEDORES_BY_MONTH = {\n"
        + ",\n".join(
            f'  "{m}": BOLETOS_FORNECEDORES_{m.replace("-", "_")}' for m in all_data
        )
        + "\n};\n"
    )
    (ROOT / "server" / "src" / "data" / "boletosFornecedores.js").write_text(
        "".join(js_parts), encoding="utf-8"
    )
    print("Wrote boletosFornecedores.js months=", list(all_data))


if __name__ == "__main__":
    main()
