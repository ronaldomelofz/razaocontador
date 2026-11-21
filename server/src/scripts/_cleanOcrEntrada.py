# -*- coding: utf-8 -*-
import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "data" / "entradaDanfeOcr-2026-07.json"
d = json.loads(path.read_text(encoding="utf-8"))


def valid_chave(ch):
    if not ch or len(ch) != 44 or not str(ch).isdigit():
        return False
    if ch[18:20] not in ("55", "65"):
        return False
    uf = int(ch[0:2])
    return 11 <= uf <= 53


def nf_from_chave(ch):
    if not valid_chave(ch):
        return None
    return str(int(ch[23:32]))


clean = []
for p in d["notes"]:
    m = p.get("merged") or {}
    ch = m.get("chave_acesso")
    if valid_chave(ch):
        nfc = nf_from_chave(ch)
        if nfc:
            m["doc_number"] = nfc
    else:
        m["chave_acesso"] = None
        ch = None

    aliq = m.get("aliquota_icms")
    ic = m.get("valor_icms")
    if ic and aliq is not None and 0 < aliq < 4:
        m["valor_icms"] = None
        m["base_icms"] = None
        m["aliquota_icms"] = None
        m.pop("icms_antecipacao_estimada", None)
        m["tax_confidence"] = "low"

    if (
        m.get("emit_uf")
        and m["emit_uf"] != "PI"
        and m.get("base_icms")
        and m.get("aliquota_icms") is not None
    ):
        af = round(22.5 - m["aliquota_icms"], 2)
        if af > 0:
            m["icms_antecipacao_estimada"] = round(m["base_icms"] * af / 100, 2)
        else:
            m.pop("icms_antecipacao_estimada", None)

    nf = str(m.get("doc_number") or "")
    keep = False
    if p.get("siat_match") and nf and len(nf) <= 9:
        keep = True
    elif m.get("valor_produtos") and m["valor_produtos"] > 0 and nf and 3 <= len(nf) <= 9:
        keep = True
    elif valid_chave(ch) and m.get("valor_icms") is not None:
        keep = True
    if keep:
        clean.append(p)

d["notes"] = clean
d["summary"].update(
    {
        "pages_ocr": len(clean),
        "matched_siat": sum(1 for p in clean if p.get("siat_match")),
        "with_icms": sum(1 for p in clean if (p.get("merged") or {}).get("valor_icms") is not None),
        "with_chave": sum(1 for p in clean if (p.get("merged") or {}).get("chave_acesso")),
        "total_produtos_ocr": round(
            sum((p.get("merged") or {}).get("valor_produtos") or 0 for p in clean), 2
        ),
        "total_icms_ocr": round(
            sum((p.get("merged") or {}).get("valor_icms") or 0 for p in clean), 2
        ),
        "total_nf_ocr": round(
            sum((p.get("merged") or {}).get("valor_total_nf") or 0 for p in clean), 2
        ),
        "icms_antecipacao_estimada": round(
            sum((p.get("merged") or {}).get("icms_antecipacao_estimada") or 0 for p in clean), 2
        ),
        "cleaned": True,
    }
)
path.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(d["summary"], ensure_ascii=False, indent=2))
for p in clean:
    m = p["merged"]
    name = (m.get("emit_name") or "")[:40]
    print(
        "NF=%s SIAT=%s UF=%s prod=%s ICMS=%s aliq=%s ant=%s | %s"
        % (
            m.get("doc_number"),
            p.get("siat_match"),
            m.get("emit_uf"),
            m.get("valor_produtos"),
            m.get("valor_icms"),
            m.get("aliquota_icms"),
            m.get("icms_antecipacao_estimada"),
            name,
        )
    )
