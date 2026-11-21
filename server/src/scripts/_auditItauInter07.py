# -*- coding: utf-8 -*-
import json
from collections import Counter
from pathlib import Path

ROOT = Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR")
d = json.loads((ROOT / "client/public/data/ledger-2026-07.json").read_text(encoding="utf-8"))
lines = []
for bank in ["itau-29660-2", "itau-57563-6", "inter-9908006-0", "bb-847-8"]:
    items = [e for e in d["entries"] if e.get("bank_account_id") == bank]
    lines.append(f"==== {bank} n={len(items)}")
    lines.append("debit: " + str(Counter((e.get("debit_account"), (e.get("debit_name") or "")[:40]) for e in items).most_common(20)))
    lines.append("cat: " + str(Counter(e.get("category") for e in items).most_common(15)))
    # keyword hits
    keys = ("sispag", "fornecedor", "boleto", "titulo", "placas", "una", "hd ferr", "kitsul", "lage", "rometal", "eucatex", "afo ", "metalfixe", "metalsul", "ibrap", "starrett", "tabone")
    hits = []
    for e in items:
        blob = f"{e.get('description')} {e.get('counterparty')} {e.get('category')} {e.get('debit_name')}".lower()
        if any(k in blob for k in keys):
            hits.append(e)
    lines.append(f"keyword hits {len(hits)}")
    for e in hits:
        lines.append(f"  {e.get('entry_date')} {e.get('amount')} {(e.get('description') or '')[:80]} | {e.get('category')} | {e.get('debit_account')}")
    # unclassified large outflows
    unc = [e for e in items if e.get("status") == "manual_review" or "não classificado" in (e.get("category") or "").lower()]
    lines.append(f"unclassified {len(unc)} tot={sum(e.get('amount') or 0 for e in unc):.2f}")
    for e in sorted(unc, key=lambda x: -(x.get("amount") or 0))[:25]:
        lines.append(f"  UNC {e.get('entry_date')} {e.get('amount')} {(e.get('description') or '')[:80]}")

(ROOT / "tmp_ocr_work/audit-itau-inter.txt").write_text("\n".join(lines), encoding="utf-8")
print("ok", len(lines))
