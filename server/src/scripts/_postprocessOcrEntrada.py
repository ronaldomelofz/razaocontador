# -*- coding: utf-8 -*-
"""Post-processa entradaDanfeOcr: dedupe + valida ICMS."""
import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "data" / "entradaDanfeOcr-2026-07.json"
d = json.loads(path.read_text(encoding="utf-8"))


def score(page):
    m = page.get("merged") or {}
    s = 0
    if page.get("siat_match"):
        s += 100
    if m.get("valor_icms") is not None:
        s += 50
    if m.get("tax_confidence") == "high":
        s += 20
    if m.get("base_icms"):
        s += 10
    if m.get("chave_acesso"):
        s += 5
    if m.get("valor_produtos"):
        s += 5
    # penaliza NF absurda
    nf = str(m.get("doc_number") or "")
    if not nf or nf == "0" or len(nf) > 9:
        s -= 200
    return s


def sanitize_icms(m):
    prod = m.get("valor_produtos") or m.get("valor_produtos_siat") or 0
    bc = m.get("base_icms")
    ic = m.get("valor_icms")
    if ic is None:
        return
    # ICMS destacado ridículo vs produtos (ex.: 7 em NF de 6 mil)
    if prod and ic > 0 and ic < prod * 0.005 and prod > 500:
        m["valor_icms"] = None
        m["base_icms"] = None
        m["aliquota_icms"] = None
        m["icms_antecipacao_estimada"] = None
        m["tax_confidence"] = "low"
        m["icms_discard_reason"] = "icms_too_small_vs_produtos"
        return
    if bc and ic and bc > 0:
        aliq = 100 * ic / bc
        if aliq > 30 or aliq < 0:
            m["valor_icms"] = None
            m["base_icms"] = None
            m["aliquota_icms"] = None
            m["icms_antecipacao_estimada"] = None
            m["tax_confidence"] = "low"
            m["icms_discard_reason"] = "aliq_out_of_range"
            return
        m["aliquota_icms"] = round(aliq, 2)
    # recalcula antecipação
    if (
        m.get("emit_uf")
        and m["emit_uf"] != "PI"
        and m.get("base_icms")
        and m.get("aliquota_icms") is not None
    ):
        aliq_final = round(22.5 - m["aliquota_icms"], 2)
        if aliq_final > 0:
            m["icms_antecipacao_estimada"] = round(m["base_icms"] * aliq_final / 100, 2)
            m["aliq_final_estimada"] = aliq_final
        else:
            m.pop("icms_antecipacao_estimada", None)
    else:
        m.pop("icms_antecipacao_estimada", None)


raw = d.get("notes") or d.get("pages") or []

# limpa ICMS em todas as páginas
for page in raw:
    sanitize_icms(page.get("merged") or {})

# dedupe: melhor página por NF (SIAT) ou por arquivo+página se sem NF
best = {}
garbage = []
for page in raw:
    m = page.get("merged") or {}
    nf = str(m.get("doc_number") or "")
    src = m.get("source_file") or page.get("source_file") or ""
    pi = m.get("page_index") if m.get("page_index") is not None else page.get("page_index")
    if not nf or nf == "0" or len(nf) > 9:
        garbage.append(page)
        continue
    if not page.get("siat_match") and not m.get("valor_produtos") and not m.get("chave_acesso"):
        garbage.append(page)
        continue
    key = (
        nf
        if page.get("siat_match") or (m.get("valor_produtos") and len(nf) >= 4)
        else f"file:{src}:{pi}"
    )
    prev = best.get(key)
    if prev is None or score(page) > score(prev):
        best[key] = page

pages = list(best.values())
pages.sort(key=lambda p: (
    (p.get("merged") or {}).get("issue_date") or "",
    (p.get("merged") or {}).get("doc_number") or "",
))

d["pages_raw_count"] = len(raw)
d["pages_garbage_count"] = len(garbage)
d["notes"] = pages
d.pop("pages", None)

matched = sum(1 for p in pages if p.get("siat_match"))
with_icms = sum(1 for p in pages if (p.get("merged") or {}).get("valor_icms") is not None)
d["summary"] = {
    **d.get("summary", {}),
    "pages_ocr": len(pages),
    "pages_raw": d["pages_raw_count"],
    "matched_siat": matched,
    "with_icms": with_icms,
    "with_total": sum(1 for p in pages if (p.get("merged") or {}).get("valor_total_nf") is not None),
    "with_chave": sum(1 for p in pages if (p.get("merged") or {}).get("chave_acesso")),
    "total_produtos_ocr": round(sum((p.get("merged") or {}).get("valor_produtos") or 0 for p in pages), 2),
    "total_icms_ocr": round(sum((p.get("merged") or {}).get("valor_icms") or 0 for p in pages), 2),
    "total_nf_ocr": round(sum((p.get("merged") or {}).get("valor_total_nf") or 0 for p in pages), 2),
    "icms_antecipacao_estimada": round(
        sum((p.get("merged") or {}).get("icms_antecipacao_estimada") or 0 for p in pages), 2
    ),
    "deduped": True,
}

path.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(d["summary"], ensure_ascii=False, indent=2))
print("--- notas ---")
for p in pages:
    m = p["merged"]
    print(
        f"NF={m.get('doc_number')} SIAT={p.get('siat_match')} UF={m.get('emit_uf')} "
        f"prod={m.get('valor_produtos')} BC={m.get('base_icms')} ICMS={m.get('valor_icms')} "
        f"aliq={m.get('aliquota_icms')} ant={m.get('icms_antecipacao_estimada')} "
        f"conf={m.get('tax_confidence')} | {(m.get('emit_name') or '')[:45]}"
    )
