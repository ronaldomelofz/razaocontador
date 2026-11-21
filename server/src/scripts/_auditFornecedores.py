# -*- coding: utf-8 -*-
import json
from collections import defaultdict, Counter
from pathlib import Path

ROOT = Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR")
out = []

for month in ["2026-05", "2026-06", "2026-07"]:
    p = ROOT / "client" / "public" / "data" / f"ledger-{month}.json"
    if not p.exists():
        out.append(f"\n=== {month} MISSING ===")
        continue
    d = json.loads(p.read_text(encoding="utf-8"))
    entries = d.get("entries", [])
    out.append(f"\n=== {month} entries={len(entries)} ===")
    for s in d.get("summary", []):
        out.append(f"  bank {s.get('bank_account_id')}: n={s.get('n')} saidas={s.get('saidas')}")

    cats = Counter(e.get("category") or "?" for e in entries)
    out.append("  top categories:")
    for c, n in cats.most_common(20):
        out.append(f"    {n:4d} {c}")

    # money-out candidates to suppliers
    keywords = ("fornecedor", "boleto", "pagamento a", "nf ", "nfe", "titulo")
    debit_coa_prefix = ("2.01.01",)  # fornecedores
    cand = []
    for e in entries:
        desc = (e.get("description") or "").lower()
        cat = (e.get("category") or "").lower()
        dn = (e.get("debit_name") or "").lower()
        da = e.get("debit_account") or ""
        hit = any(k in desc or k in cat or k in dn for k in keywords) or any(da.startswith(p) for p in debit_coa_prefix)
        if hit and e.get("bank_account_id"):
            cand.append(e)

    by_bank = defaultdict(list)
    for e in cand:
        by_bank[e.get("bank_account_id")].append(e)

    out.append(f"  supplier-like payments: {len(cand)}")
    for b, items in sorted(by_bank.items(), key=lambda x: -len(x[1])):
        tot = sum(i.get("amount") or 0 for i in items)
        out.append(f"    {b}: {len(items)} tot={tot:.2f}")
        # group by description prefix
        kinds = Counter()
        for i in items:
            d0 = i.get("description") or ""
            if "boleto" in d0.lower():
                kinds["boleto"] += 1
            elif d0.lower().startswith("pix"):
                kinds["pix"] += 1
            elif "ted" in d0.lower() or "doc" in d0.lower():
                kinds["ted/doc"] += 1
            elif "transf" in d0.lower():
                kinds["transf"] += 1
            else:
                kinds["outro:" + d0[:40]] += 1
        for k, n in kinds.most_common(12):
            out.append(f"      {n}x {k}")

    # non-BB boletos specifically
    boletos = [e for e in entries if "boleto" in (e.get("description") or "").lower()]
    out.append(f"  explicit boleto lines: {len(boletos)}")
    bbanks = Counter(e.get("bank_account_id") for e in boletos)
    for b, n in bbanks.most_common():
        out.append(f"    boleto@{b}: {n}")

Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR\tmp_ocr_work\audit-fornecedores.txt").write_text(
    "\n".join(out), encoding="utf-8"
)
print("wrote audit")
print("\n".join(out[-80:]))
