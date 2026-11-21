# -*- coding: utf-8 -*-
"""Extrai páginas do PDF Comprovantes-BB, vincula aos boletos e atualiza JSON/UI."""
import hashlib
import json
import re
from pathlib import Path

try:
    import fitz
except ImportError:
    import pymupdf as fitz

ROOT = Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR")
MONTH = "2026-07"
SRC_PDF = ROOT / "tmp_ocr_work" / "bb-comprovantes-07" / "04082026 123025-Comprovantes-BB.pdf"
ANEXOS = ROOT / "client" / "public" / "anexos" / MONTH / "comprovantes-bb"
JSON_PATH = ROOT / "client" / "public" / "data" / f"boletos-fornecedores-{MONTH}.json"
JS_PATH = ROOT / "server" / "src" / "data" / "boletosFornecedores2026-07.js"

BANK_LABELS = {
    "bb-847-8": "Banco do Brasil — Ag 3219-0 / Cc 847-8",
    "inter-9908006-0": "Banco Inter",
    "bnb-119424-3": "BNB",
    "itau-29660-2": "Itaú 29660-2",
    "itau-57563-6": "Itaú 57563-6",
    "itau-31689-7": "Itaú 31689-7",
    "itau-05068-7": "Itaú 05068-7",
    "itau-33489-0": "Itaú 33489-0",
    "mercadopago": "Mercado Pago",
}


def parse_br(s):
    return float(s.replace(".", "").replace(",", "."))


def parse_date(s):
    d, m, y = s.split("/")
    return f"{y}-{m}-{d}"


def slug(s, n=40):
    s = re.sub(r"[^A-Za-z0-9]+", "-", (s or "").upper()).strip("-")
    return s[:n] or "X"


def parse_comprovante_pages(pdf_path):
    doc = fitz.open(pdf_path)
    out = []
    for i in range(len(doc)):
        t = doc[i].get_text("text")
        if "COMPROVANTE DE PAGAMENTO" not in t and "Comprovante Pix" not in t:
            continue
        is_pix = "Comprovante Pix" in t
        is_parcial = "PARCIAL" in t
        ben = re.search(r"BENEFICIARIO:\s*\n(.+)", t)
        if not ben and is_pix:
            ben = re.search(r"NOME:\s*(.+)", t)
        doc_val = re.search(r"VALOR DO DOCUMENTO\s+([\d.]+,\d{2})", t)
        cob_val = re.search(r"VALOR COBRADO\s+([\d.]+,\d{2})", t)
        pix_val = re.search(r"VALOR:\s*R\$\s*([\d.]+,\d{2})", t)
        dt_pag = re.search(r"DATA DO PAGAMENTO\s+(\d{2}/\d{2}/\d{4})", t)
        if not dt_pag and is_pix:
            dt_pag = re.search(r"DATA:\s+(\d{2}/\d{2}/\d{4})", t)
        dt_venc = re.search(r"DATA DE VENCIMENTO\s+(\d{2}/\d{2}/\d{4})", t)
        nr_doc = re.search(r"NR\.\s*DOCUMENTO\s+([\d.]+)", t)
        autent = re.search(r"NR\.AUTENTICACAO\s+([0-9A-F.]+)", t)
        ag = re.search(r"AGENCIA:\s*([\d-]+)", t)
        cc = re.search(r"CONTA:\s*([\d-]+)", t)

        if is_pix:
            amount = parse_br(pix_val.group(1)) if pix_val else None
            original = amount
            cobrado = amount
        else:
            original = parse_br(doc_val.group(1)) if doc_val else None
            cobrado = parse_br(cob_val.group(1)) if cob_val else original

        if cobrado is None:
            continue

        juros = round((cobrado or 0) - (original or 0), 2) if original is not None else 0.0
        out.append(
            {
                "page": i + 1,
                "page_index": i,
                "beneficiario": (ben.group(1).strip() if ben else ""),
                "data_pagamento": parse_date(dt_pag.group(1)) if dt_pag else None,
                "data_vencimento": parse_date(dt_venc.group(1)) if dt_venc else None,
                "valor_documento": original,
                "valor_cobrado": cobrado,
                "juros_multa": juros if juros > 0 else 0.0,
                "nr_documento": nr_doc.group(1) if nr_doc else None,
                "autenticacao": autent.group(1) if autent else None,
                "agencia": ag.group(1) if ag else "3219-0",
                "conta": cc.group(1).strip() if cc else "847-8",
                "tipo": "pix" if is_pix else ("parcial" if is_parcial else "titulo"),
                "is_boleto": not is_pix,
            }
        )
    return doc, out


def export_page(doc, page_index, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    single = fitz.open()
    single.insert_pdf(doc, from_page=page_index, to_page=page_index)
    single.save(dest)
    single.close()


def names_loose(a, b):
    def tok(s):
        s = re.sub(r"[^A-Z0-9 ]+", " ", (s or "").upper())
        stops = {"DE", "DA", "DO", "DOS", "DAS", "E", "LTDA", "SA", "S", "A", "ME", "PARA"}
        return {t for t in s.split() if len(t) >= 3 and t not in stops}

    ta, tb = tok(a), tok(b)
    return bool(ta & tb) if ta and tb else False


def main():
    if not SRC_PDF.exists():
        raise SystemExit(f"PDF não encontrado: {SRC_PDF}")
    if not JSON_PATH.exists():
        raise SystemExit(f"JSON boletos não encontrado: {JSON_PATH}")

    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    ledger = json.loads(
        (ROOT / "client" / "public" / "data" / f"ledger-{MONTH}.json").read_text(encoding="utf-8")
    )
    by_id = {e["id"]: e for e in ledger.get("entries", [])}

    doc, pages = parse_comprovante_pages(SRC_PDF)
    boleto_pages = [p for p in pages if p["is_boleto"]]
    print(f"Páginas comprovante: {len(pages)} (boletos {len(boleto_pages)})")

    used = set()
    matched = 0
    ANEXOS.mkdir(parents=True, exist_ok=True)

    for item in data.get("items", []):
        entry = by_id.get(item.get("bank_id"))
        bank_id = (entry or {}).get("bank_account_id") or "bb-847-8"
        bank_name = (entry or {}).get("credit_name") or BANK_LABELS.get(bank_id, bank_id)
        item["bank_account_id"] = bank_id
        item["banco"] = bank_name
        item["banco_curto"] = "Banco do Brasil" if bank_id.startswith("bb") else BANK_LABELS.get(bank_id, bank_id)

        # match comprovante
        best = None
        best_score = 0
        payee = item.get("beneficiario_banco") or item.get("fornecedor") or ""
        amount = item.get("valor_total")
        date = item.get("data_pagamento")

        for p in boleto_pages:
            if p["page"] in used:
                continue
            score = 0
            if amount is not None and p["valor_cobrado"] is not None:
                if abs(p["valor_cobrado"] - amount) < 0.02:
                    score += 50
                elif p["valor_documento"] is not None and abs(p["valor_documento"] - amount) < 0.02:
                    score += 45
                else:
                    continue
            if date and p["data_pagamento"] == date:
                score += 25
            if names_loose(payee, p["beneficiario"]) or names_loose(item.get("fornecedor"), p["beneficiario"]):
                score += 30
            if score > best_score:
                best_score = score
                best = p

        if best and best_score >= 50:
            used.add(best["page"])
            matched += 1
            fname = (
                f"{best['data_pagamento'] or 's-data'}_"
                f"{slug(best['beneficiario'])}_"
                f"{best['valor_cobrado']:.2f}.pdf"
            ).replace(",", ".")
            # hash short to avoid collisions
            h = hashlib.sha1(f"{best['page']}-{fname}".encode()).hexdigest()[:8]
            fname = f"{best['data_pagamento'] or 'x'}_{h}_{slug(best['beneficiario'], 24)}.pdf"
            dest = ANEXOS / fname
            export_page(doc, best["page_index"], dest)
            rel = f"/anexos/{MONTH}/comprovantes-bb/{fname}"

            item["comprovante"] = {
                "url": rel,
                "file_name": fname,
                "page": best["page"],
                "nr_documento": best["nr_documento"],
                "autenticacao": best["autenticacao"],
                "agencia": best["agencia"],
                "conta": best["conta"],
            }
            # Prefer values from official receipt
            if best["valor_documento"] is not None:
                item["valor_original"] = best["valor_documento"]
            if best["valor_cobrado"] is not None:
                item["valor_total"] = best["valor_cobrado"]
            item["juros_multa"] = best["juros_multa"]
            if best["juros_multa"] > 0:
                item["obs"] = (
                    (item.get("obs") + " · " if item.get("obs") else "")
                    + f"Comprovante: documento {best['valor_documento']:.2f} + encargos {best['juros_multa']:.2f}"
                )
        else:
            item["comprovante"] = None

    doc.close()

    # refresh summary juros
    forn = [i for i in data["items"] if i.get("tipo") == "fornecedor"]
    conc = [i for i in forn if i.get("status") == "conciliado"]
    data["summary"]["total_original"] = round(sum(i.get("valor_original") or 0 for i in conc), 2)
    data["summary"]["total_juros_multa"] = round(sum(i.get("juros_multa") or 0 for i in conc), 2)
    data["summary"]["total_pago_fornecedor"] = round(sum(i.get("valor_total") or 0 for i in forn), 2)
    data["summary"]["qtd_com_comprovante"] = sum(1 for i in data["items"] if i.get("comprovante"))
    data["summary"]["banco_predominante"] = "Banco do Brasil — Ag 3219-0 / Cc 847-8"

    note = (
        "Todos os boletos de jul/26 foram pagos pelo Banco do Brasil (Ag 3219-0 / Cc 847-8). "
        "Comprovantes: PDF oficial BB (04/08/2026), uma página por pagamento."
    )
    notes = data.get("notes") or []
    if not any("Comprovantes: PDF oficial BB" in n for n in notes):
        notes.append(note)
    data["notes"] = notes

    JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    JS_PATH.write_text(
        "// Gerado — boletos fornecedores 07/2026 com banco + comprovantes\n"
        "export const BOLETOS_FORNECEDORES_2026_07 = "
        + json.dumps(data, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )

    print(f"Matched comprovantes: {matched}/{len(data['items'])}")
    print(f"Anexos em {ANEXOS}")
    print("Summary", json.dumps(data["summary"], ensure_ascii=False, indent=2))
    missing = [i for i in data["items"] if not i.get("comprovante") and i.get("tipo") == "fornecedor"]
    if missing:
        print("Sem comprovante (fornecedor):")
        for i in missing:
            print(" ", i.get("data_pagamento"), i.get("valor_total"), i.get("fornecedor"))


if __name__ == "__main__":
    main()
