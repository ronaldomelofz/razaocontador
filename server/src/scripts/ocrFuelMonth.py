# -*- coding: utf-8 -*-
"""OCR/parse cupons COMBUSTÍVEL e gera fuelOcr2026-MM.js"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import fitz
import numpy as np
import pytesseract
from PIL import Image

ROOT = Path(r"E:\PROJETOS-CURSOR\RAZAO-CONTADOR")
NETWORK = Path(r"\\192.168.1.190\f\ALAINE - CONTADORA")
OUT_JS = ROOT / "server" / "src" / "data"
WORK = ROOT / "tmp_ocr_work" / "fuel"

MONEY_RE = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2})")
LITERS_RE = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2,3})\s*(?:LT|L\b|LITROS?)", re.I)
DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
TIME_RE = re.compile(r"(\d{2}):(\d{2})(?::\d{2})?")


def parse_br(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


def money_candidates(text: str) -> list[float]:
    vals = []
    for m in MONEY_RE.finditer(text):
        try:
            v = parse_br(m.group(1))
            if 5 <= v <= 5000:
                vals.append(v)
        except ValueError:
            pass
    return vals


def normalize_ocr_decimals(text: str) -> str:
    """Corrige artefatos comuns do Tesseract em valores BR."""
    t = text
    t = t.replace("),", ",").replace("),", ",")
    t = re.sub(r"(\d)[Oo](\d{2})\b", r"\1,\2", t)  # 100o0 → 100,0? careful
    t = re.sub(r"(\d{2,3})[lI](\d{2})\b", r"\1,\2", t)
    t = re.sub(r"(\d{1,3})[.:](\d{2})(?!\d)", r"\1,\2", t)
    t = t.replace("30:),00", "309,00").replace("301),00", "301,00")
    return t


def pick_amount(text: str) -> float | None:
    t = normalize_ocr_decimals(text).upper()
    # Preferência: valor pago / a pagar / total
    for pat in [
        r"VALOR\s+PAGO\s*R?\$?\s*([\d.]+,\d{2})",
        r"VALOR\s+A\s+PAGAR\s*R?\$?\s*([\d.]+,\d{2})",
        r"VALOR\s+TOTAL\s*R?\$?\s*([\d.]+,\d{2})",
        r"VALOR\s+TO[ZT]AL\s*[R8$g]*\s*([\d.]+,\d{2})",
        r"TOTAL\s*R?\$?\s*([\d.]+,\d{2})",
    ]:
        m = re.search(pat, t, re.I)
        if m:
            v = parse_br(m.group(1))
            if v >= 20:
                return v

    # Linha de produto combustível: qtd · unitário · total (pegar o último ≥ 20)
    for line in t.splitlines():
        if not re.search(r"DIESEL|GASOLINA|ETANOL|OLEO|ÓLEO|S10", line, re.I):
            continue
        nums = [parse_br(x) for x in MONEY_RE.findall(line)]
        totals = [n for n in nums if n >= 20]
        if totals:
            return totals[-1]

    # Bloco após VALOR A PAGAR (até 120 chars)
    m = re.search(r"VALOR\s+A\s+PAGAR[\s\S]{0,120}?(\d{1,3}(?:\.\d{3})*,\d{2})", t, re.I)
    if m:
        v = parse_br(m.group(1))
        if v >= 20:
            return v

    cands = [v for v in money_candidates(normalize_ocr_decimals(text)) if v >= 20]
    if not cands:
        return None
    return max(cands)


def pick_liters(text: str) -> float | None:
    m = LITERS_RE.search(text)
    if m:
        return parse_br(m.group(1))
    m = re.search(r"(\d{1,3},\d{2,3})\s*LT", text, re.I)
    if m:
        return parse_br(m.group(1))
    return None


def pick_product(text: str) -> str | None:
    up = text.upper()
    for name in [
        "OLEO DIESEL B S10",
        "ÓLEO DIESEL B S10",
        "DIESEL S10 ADITIVADO",
        "DIESEL S10 COMUM",
        "DIESEL S10",
        "GASOLINA ADITIVADA",
        "GASOLINA COMUM",
        "ETANOL ADITIVADO",
        "ETANOL COMUM",
        "ETANOL",
        "GNV",
        "GLP",
    ]:
        if name in up:
            return name.title().replace("Oleo", "Óleo")
    return None


def pick_station(text: str) -> str | None:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines[:15]:
        up = ln.upper()
        if re.search(r"PLANALTO\s+PETROLE", up):
            if "BOLA" in up or "BOTA" in up or "ABOLEU" in up:
                return "PLANALTO PETROLEO BOLA LTDA"
            if "UNIAO" in up or "UNIÃO" in up:
                return "PLANALTO PETROLEO UNIAO LTDA"
            return "PLANALTO PETROLEO LTDA"
        if "AVALLON" in up:
            return "AVALLON COMBUSTIVEIS LTDA"
        if "MAXXI" in up or "MAXI DM" in up:
            return "MAXXI DM PETROLEO LTDA"
        if any(k in up for k in ("POSTO", "PETROLE", "COMBUST")):
            if len(ln) > 6 and "DOCUMENTO" not in up and "CHAVE" not in up:
                return ln[:80]
    for ln in lines[:8]:
        if re.search(r"LTDA|EIRELI|S/?A\b", ln, re.I):
            return ln[:80]
    return None


def pick_payment(text: str) -> str | None:
    up = text.upper()
    if "CARTÃO DE CRÉDITO" in up or "CARTAO DE CREDITO" in up:
        return "Cartão de Crédito"
    if "CARTÃO DE DÉBITO" in up or "CARTAO DE DEBITO" in up:
        return "Cartão de Débito"
    if "PIX" in up:
        return "PIX"
    if "DINHEIRO" in up:
        return "Dinheiro"
    if "A PRAZO" in up or "CREDITO LOJA" in up:
        return "A prazo"
    return None


def pick_datetime(text: str, fallback_date: str | None = None) -> tuple[str | None, str | None]:
    dates = DATE_RE.findall(text)
    times = TIME_RE.findall(text)
    doc_date = None
    if dates:
        d, m, y = dates[0]
        # prefer 2026 dates
        for dd, mm, yy in dates:
            if yy.startswith("20"):
                d, m, y = dd, mm, yy
                break
        doc_date = f"{y}-{m}-{d}"
    elif fallback_date:
        doc_date = fallback_date
    doc_time = f"{times[0][0]}:{times[0][1]}" if times else None
    return doc_date, doc_time


def parse_nfce_chave_date(name: str) -> str | None:
    # 44 digits: AAMM... positions 2-5 after model? chave: cUF(2)+AAMM(4)+CNPJ(14)+mod(2)+serie(3)+nNF(9)+tpEmis(1)+cNF(8)+cDV(1)
    digits = re.sub(r"\D", "", name)
    if len(digits) >= 6 and digits.startswith("22"):  # PI + year starts often 22 for 2022? Actually UF 22 = PI
        # AAMM at positions 2-5 (0-index after UF)
        aamm = digits[2:6]
        yy, mm = aamm[:2], aamm[2:]
        if mm in [f"{i:02d}" for i in range(1, 13)]:
            return f"20{yy}-{mm}-01"  # day unknown from chave alone
    return None


def extract_text_pdf(path: Path) -> str:
    doc = fitz.open(path)
    parts = [doc[i].get_text("text") for i in range(len(doc))]
    doc.close()
    return "\n".join(parts).strip()


def ocr_pdf(path: Path) -> str:
    WORK.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(path)
    texts = []
    for i in range(len(doc)):
        page = doc[i]
        mat = fitz.Matrix(2.5, 2.5)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        mode = "RGB" if pix.n >= 3 else "L"
        img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
        if mode == "RGB":
            gray = img.convert("L")
        else:
            gray = img
        arr = np.array(gray)
        # contraste simples
        arr = np.clip((arr.astype(np.float32) - 20) * 1.15, 0, 255).astype(np.uint8)
        pre = Image.fromarray(arr)
        cfg = "--oem 3 --psm 6"
        texts.append(pytesseract.image_to_string(pre, lang="por+eng", config=cfg))
        # also try psm 4 for receipts
        texts.append(pytesseract.image_to_string(pre, lang="por+eng", config="--oem 3 --psm 4"))
    doc.close()
    return "\n".join(texts)


def parse_cupom(path: Path, text: str, filename_date: str | None) -> dict:
    amount = pick_amount(text)
    liters = pick_liters(text)
    product = pick_product(text)
    station = pick_station(text)
    payment = pick_payment(text)
    doc_date, doc_time = pick_datetime(text, filename_date)
    is_fuel = True
    if product and re.search(r"SELANTE|COLA|GLP|EMPILHA", product, re.I):
        is_fuel = False
    if station and re.search(r"FERRAGEM|EMPILHA", station, re.I) and not product:
        is_fuel = False
    return {
        "doc_date": doc_date,
        "doc_time": doc_time,
        "amount": amount,
        "liters": liters,
        "station": station,
        "product": product,
        "payment": payment,
        "is_fuel": is_fuel,
        "ocr_chars": len(text),
    }


def month_folder(month: str) -> str:
    y, m = month.split("-")
    return f"{m}-{y}"


def filename_meta(name: str) -> tuple[str | None, str | None]:
    m = re.match(r"Digitalizado_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})", name, re.I)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}", f"{m.group(4)}:{m.group(5)}"
    # 44-digit chave — do not treat as DDMMYYYY
    digits = re.sub(r"\D", "", name)
    if len(digits) >= 44:
        return parse_nfce_chave_date(name), None
    return None, None


def js_escape(s: str | None) -> str:
    if s is None:
        return "null"
    return json.dumps(s, ensure_ascii=False)


def main():
    month = "2026-08"
    for a in sys.argv[1:]:
        if a.startswith("--month="):
            month = a.split("=", 1)[1]

    folder = NETWORK / month_folder(month) / "COMBUSTÍVEL"
    if not folder.exists():
        raise SystemExit(f"Pasta não encontrada: {folder}")

    by_file: dict[str, dict] = {}
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() not in {".pdf", ".jpg", ".jpeg", ".png"}:
            continue
        if path.name.lower() in {"desktop.ini", "thumbs.db"}:
            continue
        fb_date, fb_time = filename_meta(path.name)
        text = extract_text_pdf(path) if path.suffix.lower() == ".pdf" else ""
        if len(text) < 40:
            print(f"OCR {path.name}...")
            try:
                text = ocr_pdf(path)
            except Exception as err:
                print(f"  FAIL OCR: {err}")
                text = text or ""
        parsed = parse_cupom(path, text, fb_date)
        if not parsed.get("doc_time") and fb_time:
            parsed["doc_time"] = fb_time
        if not parsed.get("doc_date") and fb_date and not re.match(r"^\d{44}", re.sub(r"\D", "", path.name)):
            parsed["doc_date"] = fb_date
        # For chave NFC-e, prefer emission date from text
        print(
            f"{path.name}: amount={parsed.get('amount')} liters={parsed.get('liters')} "
            f"station={parsed.get('station')} chars={parsed.get('ocr_chars')}"
        )
        by_file[path.name] = parsed

    # Write JS module
    lines = [
        f"// Valores extraídos dos cupons NFC-e (OCR/leitura documental) — {month[5:]}/{month[:4]}",
        "// Gerado por ocrFuelMonth.py — não editar à mão sem necessidade",
        "",
        "export const FUEL_OCR_BY_FILENAME = {",
    ]
    for name, o in by_file.items():
        if o.get("amount") is None and not o.get("station"):
            continue
        entry = {
            "doc_date": o.get("doc_date"),
            "doc_time": o.get("doc_time"),
            "amount": o.get("amount"),
            "station": o.get("station"),
            "product": o.get("product"),
            "liters": o.get("liters"),
            "plate": None,
            "payment": o.get("payment"),
            "is_fuel": o.get("is_fuel", True),
        }
        lines.append(f"  {json.dumps(name, ensure_ascii=False)}: {json.dumps(entry, ensure_ascii=False)},")
    lines.append("};")
    lines.append("")
    lines.append(
        """export function enrichFuelRecord(record) {
  const ocr = FUEL_OCR_BY_FILENAME[record.file_name];
  if (!ocr) return record;
  return {
    ...record,
    doc_date: ocr.doc_date || record.doc_date,
    doc_time: ocr.doc_time || record.doc_time,
    amount: ocr.amount ?? record.amount,
    station: ocr.station || record.station,
    product: ocr.product,
    liters: ocr.liters,
    plate: ocr.plate,
    payment: ocr.payment,
    is_fuel: ocr.is_fuel !== false,
    note: ocr.note,
    nf: ocr.nf,
    status: record.ledger_entry_id ? 'conciliado' : (ocr.amount != null ? 'documento' : record.status),
  };
}
"""
    )
    out = OUT_JS / f"fuelOcr{month}.js"
    # filename fuelOcr2026-08.js — hyphen invalid in import sometimes; use fuelOcr2026_08.js pattern like before fuelOcr2026-07.js which HAS hyphen!

    # existing files use fuelOcr2026-07.js with hyphen — OK for ESM path import
    out.write_text("\n".join(lines), encoding="utf-8")
    print("Wrote", out)
    print("with_amount", sum(1 for o in by_file.values() if o.get("amount") is not None), "/", len(by_file))


if __name__ == "__main__":
    main()
