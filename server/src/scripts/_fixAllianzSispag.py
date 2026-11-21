# -*- coding: utf-8 -*-
import json
from collections import defaultdict
from pathlib import Path

try:
    import fitz
except ImportError:
    import pymupdf as fitz

ROOT = Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR")
src = ROOT / "tmp_ocr_work/itau-sispag-186/comprovante-2026-08-04T17-20-38-383768748Z.pdf"
doc = fitz.open(src)
page_index = 12  # page 13
single = fitz.open()
single.insert_pdf(doc, from_page=page_index, to_page=page_index)
out_dir = ROOT / "client/public/data/comprovantes/2026-07"
out_dir.mkdir(parents=True, exist_ok=True)
fname = "2026-07-17_allianz_sispag_186.05.pdf"
dest = out_dir / fname
single.save(dest)
single.close()
doc.close()
print("saved", dest, dest.stat().st_size)

jp = ROOT / "client/public/data/boletos-fornecedores-2026-07.json"
data = json.loads(jp.read_text(encoding="utf-8"))
updated = False
for item in data["items"]:
    if item.get("bank_id") == 6023 or (
        str(item.get("forma")) == "sispag" and abs((item.get("valor_total") or 0) - 186.05) < 0.01
    ):
        item.update(
            {
                "fornecedor": "ALLIANZ SEGUROS S A",
                "beneficiario_banco": "ALLIANZ SEGUROS S A",
                "titulo": "boleto Allianz (Santander)",
                "vencimento": "2026-07-17",
                "valor_original": 186.05,
                "juros_multa": 0.0,
                "valor_total": 186.05,
                "status": "conciliado",
                "tipo": "outros",
                "forma": "boleto",
                "match_score": 100,
                "fonte_titulo": "Comprovante Itau SISPAG (pag. boleto)",
                "obs": (
                    "Boleto Allianz Seguros (CNPJ 61.573.796/0001-66) pago via SISPAG Itau. "
                    "Extrato mostrava apenas 'SISPAG FORNECEDORES'."
                ),
                "banco_curto": "Itau 29660-2",
                "banco": "Banco Itau - Ag: 4826 Cc: 29660-2",
                "comprovante": {
                    "url": f"/data/comprovantes/2026-07/{fname}",
                    "file_name": fname,
                    "page": 13,
                    "autenticacao": "31779054F76B8D14F7BD822C875A4B6D3DEC72D6",
                    "agencia": "4826",
                    "conta": "29660-2",
                    "cnpj_beneficiario": "61.573.796/0001-66",
                    "banco_boleto": "033 - Santander",
                },
            }
        )
        updated = True
        print("updated", item["fornecedor"], item["status"])

if not updated:
    raise SystemExit("item not found")

forn = [i for i in data["items"] if i.get("tipo") == "fornecedor"]
outros = [i for i in data["items"] if i.get("tipo") != "fornecedor"]
conc = [i for i in forn if i.get("status") == "conciliado"]
by_bank = defaultdict(lambda: {"qtd": 0, "total": 0.0})
by_forma = defaultdict(lambda: {"qtd": 0, "total": 0.0})
for i in forn:
    by_bank[i.get("banco_curto") or "?"]["qtd"] += 1
    by_bank[i.get("banco_curto") or "?"]["total"] += i.get("valor_total") or 0
    by_forma[i.get("forma") or "?"]["qtd"] += 1
    by_forma[i.get("forma") or "?"]["total"] += i.get("valor_total") or 0

data["summary"] = {
    "qtd_fornecedor": len(forn),
    "qtd_conciliados": len(conc),
    "qtd_sem_titulo": sum(1 for i in forn if i.get("status") != "conciliado"),
    "qtd_com_juros": sum(1 for i in forn if (i.get("juros_multa") or 0) > 0),
    "qtd_outros": len(outros),
    "qtd_com_comprovante": sum(1 for i in data["items"] if i.get("comprovante")),
    "total_original": round(sum(i.get("valor_original") or 0 for i in conc), 2),
    "total_juros_multa": round(sum(i.get("juros_multa") or 0 for i in forn if i.get("juros_multa")), 2),
    "total_pago_fornecedor": round(sum(i.get("valor_total") or 0 for i in forn), 2),
    "total_pago_outros": round(sum(i.get("valor_total") or 0 for i in outros), 2),
    "total_pago_geral": round(sum(i.get("valor_total") or 0 for i in data["items"]), 2),
    "por_banco": {k: {"qtd": v["qtd"], "total": round(v["total"], 2)} for k, v in by_bank.items()},
    "por_forma": {k: {"qtd": v["qtd"], "total": round(v["total"], 2)} for k, v in by_forma.items()},
}
note = (
    "SISPAG R$ 186,05 (17/07, Itau 29660-2) = boleto ALLIANZ SEGUROS S A "
    "(comprovante Itau, pagamento de boleto Santander)."
)
notes = data.get("notes") or []
if not any("ALLIANZ" in n for n in notes):
    notes.append(note)
data["notes"] = notes
jp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

# refresh JS module month 07 only by regenerating from all JSONs lightly
from pathlib import Path as P
DATA = ROOT / "client/public/data"
all_data = {}
for p in sorted(DATA.glob("boletos-fornecedores-*.json")):
    m = p.name.replace("boletos-fornecedores-", "").replace(".json", "")
    all_data[m] = json.loads(p.read_text(encoding="utf-8"))
js_parts = ["// Gerado — boletos fornecedores\n"]
for month, payload in all_data.items():
    const = "BOLETOS_FORNECEDORES_" + month.replace("-", "_")
    js_parts.append(f"export const {const} = {json.dumps(payload, ensure_ascii=False, indent=2)};\n")
js_parts.append(
    "export const BOLETOS_FORNECEDORES_BY_MONTH = {\n"
    + ",\n".join(f'  "{m}": BOLETOS_FORNECEDORES_{m.replace("-", "_")}' for m in all_data)
    + "\n};\n"
)
(ROOT / "server/src/data/boletosFornecedores.js").write_text("".join(js_parts), encoding="utf-8")
print("summary", json.dumps(data["summary"], ensure_ascii=False, indent=2))
