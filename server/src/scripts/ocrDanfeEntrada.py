#!/usr/bin/env python3
"""
OCR completo de DANFEs digitalizados (PDF escaneado) na pasta NOTAS FISCAL DE ENTRADA.

Pipeline:
  1. Renderiza cada página do PDF (PyMuPDF, ~250–300 DPI)
  2. Pré-processa (cinza + binarização adaptativa)
  3. OCR Tesseract por+eng (página inteira + recortes: cabeçalho, impostos, produtos)
  4. Extrai campos estruturados (NF, série, chave, CNPJ, datas, totais, ICMS, CFOP…)
  5. Cruza com SIAT (entradaSiat-YYYY-MM.json) por número da NF / fornecedor / data
  6. Grava JSON local consumido pela aba Apuração

Uso:
  python ocrDanfeEntrada.py --month=2026-07
  python ocrDanfeEntrada.py --month=2026-07 --limit=2   # teste
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import cv2
import fitz
import numpy as np
import pytesseract

ROOT = Path(__file__).resolve().parents[3]  # RAZAO-CONTADOR
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
WORK_DIR = ROOT / "tmp_ocr_work"

NETWORK_BASE = r"\\192.168.1.190\f\ALAINE - CONTADORA"

# Aceita 1.234,56 | 1234,56 | e OCR com ponto decimal (29.06 → 29,06)
MONEY_RE = re.compile(
    r"(?<![\d,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{1,6}\.\d{2})(?![\d,])"
)
DATE_RE = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
CNPJ_RE = re.compile(r"\b(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2})\b")
CFOP_RE = re.compile(r"\b([1-7]\.?\d{3})\b")
NF_NUM_RE = re.compile(
    r"(?:N[º°oO\.]?\s*(?:Fisc(?:al)?)?|NF[- ]?e?|NFE|NÚMERO|NUMERO|N[º°])\s*[:.]?\s*0*(\d{1,9})",
    re.I,
)
SERIE_RE = re.compile(r"S[eé]rie\s*[:.]?\s*0*(\d{1,3})", re.I)


def br_money(s: str) -> float | None:
    if not s:
        return None
    try:
        s = s.strip()
        # OCR: "29.06" (ponto decimal) sem milhar
        if re.fullmatch(r"\d{1,6}\.\d{2}", s) and s.count(".") == 1:
            return float(s)
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def normalize_ocr_decimals(text: str) -> str:
    """Converte pontos decimais OCR (29.06) em vírgula BR, sem quebrar 1.234,56."""
    return re.sub(r"(?<![,\d])(\d{1,6})\.(\d{2})(?!\d)", r"\1,\2", text)


def clean_cnpj(s: str | None) -> str | None:
    if not s:
        return None
    d = re.sub(r"\D", "", s)
    return d if len(d) == 14 else None


def iso_date(d: str, m: str, y: str) -> str:
    return f"{y}-{m}-{d}"


def month_folder(month: str) -> str:
    y, m = month.split("-")
    return f"{m}-{y}"


def find_entrada_dir(month: str) -> str:
    root = os.path.join(NETWORK_BASE, month_folder(month))
    if not os.path.exists(root):
        raise FileNotFoundError(root)
    for name in os.listdir(root):
        if re.search(r"NOTAS\s+FISCAL\s+DE\s+ENTRADA", name, re.I):
            return os.path.join(root, name)
    raise FileNotFoundError(f"Pasta NOTAS FISCAL DE ENTRADA não em {root}")


def render_page(page: fitz.Page, zoom: float = 2.8) -> np.ndarray:
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
    if pix.n == 4:
        img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
    elif pix.n == 3:
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    return img


def preprocess(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # aumenta contraste local
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    thr = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 11
    )
    thr = cv2.medianBlur(thr, 3)
    return thr


def ocr_image(img: np.ndarray, psm: int = 6) -> str:
    cfg = f"--oem 3 --psm {psm}"
    return pytesseract.image_to_string(img, lang="por+eng", config=cfg)


def crop(img: np.ndarray, y0: float, y1: float, x0: float = 0.0, x1: float = 1.0) -> np.ndarray:
    h, w = img.shape[:2]
    return img[int(h * y0) : int(h * y1), int(w * x0) : int(w * x1)]


def extract_chave(text: str) -> str | None:
    # remove tudo que não é dígito e procura 44 consecutivos
    digits = re.sub(r"\D", "", text)
    # chaves NF-e: UF(11–53) + modelo 55/65
    for m in re.finditer(r"(\d{44})", digits):
        chave = m.group(1)
        try:
            uf = int(chave[0:2])
        except ValueError:
            continue
        if not (11 <= uf <= 53):
            continue
        if chave[20:22] in ("55", "65") or chave[18:20] in ("55", "65"):
            return chave
    # grupos impressos 4-4-4…
    groups = re.findall(r"(?:\d{4}\s+){10}\d{4}", text)
    for g in groups:
        d = re.sub(r"\D", "", g)
        if len(d) == 44:
            try:
                uf = int(d[0:2])
            except ValueError:
                continue
            if 11 <= uf <= 53 and d[18:20] in ("55", "65"):
                return d
    return None


def extract_nf_serie(text: str, known_nfs: set[str] | None = None) -> tuple[str | None, str | None]:
    """Extrai NF/série. Se known_nfs (do SIAT) for passado, prioriza match exato no texto/dígitos."""
    serie = None
    m = SERIE_RE.search(text)
    if m:
        serie = str(int(m.group(1)))

    # Chave NF-e: série [20:23], número [23:32] (índices 0-based)
    chave = extract_chave(text)
    nf_from_chave = None
    serie_from_chave = None
    if chave and len(chave) == 44:
        try:
            nf_from_chave = str(int(chave[23:32]))
            serie_from_chave = str(int(chave[20:23]))
        except ValueError:
            pass

    digits = re.sub(r"\D", "", text)
    if known_nfs:
        hits = []
        for nf in known_nfs:
            if not nf or len(nf) < 4:
                continue
            # Nº impresso com pontos: 000.026.098
            spaced = r"\.?".join(list(nf))
            if re.search(rf"(?<!\d)0*{spaced}(?!\d)", text):
                hits.append(nf)
            elif re.search(rf"(?<!\d)0*{re.escape(nf)}(?!\d)", text):
                hits.append(nf)
            elif nf.zfill(9) in digits:
                hits.append(nf)
        if nf_from_chave and nf_from_chave in known_nfs:
            hits.append(nf_from_chave)
        hits = sorted(set(hits), key=lambda x: (-len(x), -int(x)))
        if hits:
            return hits[0], serie or serie_from_chave

    # Prioriza número vindo da chave (mais confiável que OCR do cabeçalho)
    if nf_from_chave and nf_from_chave != "0":
        return nf_from_chave, serie or serie_from_chave

    nf = None
    # Nº 000.026.098 / Nº 000026098
    m_dot = re.search(r"N[º°oO\.]\s*([\d.]+)", text, re.I)
    if m_dot:
        only = re.sub(r"\D", "", m_dot.group(1))
        if 3 <= len(only) <= 9:
            nf = str(int(only))
    m = NF_NUM_RE.search(text)
    if m:
        cand = str(int(m.group(1)))
        if cand != "0" and (nf is None or len(cand) >= len(nf)):
            nf = cand
    for pat in [
        r"N[º°o]\s*0*(\d{3,9})",
        r"NF[- ]?e?\s*N[º°o.]?\s*0*(\d{3,9})",
        r"NFE?\s*[:.]?\s*0*(\d{3,9})",
        r"\b0{0,3}(\d{4,9})\b\s*S[eé]rie",
    ]:
        m2 = re.search(pat, text, re.I)
        if m2:
            cand = str(int(m2.group(1)))
            if cand != "0" and (nf is None or len(cand) >= len(nf or "")):
                nf = cand
            break

    if nf == "0":
        nf = None
    return nf, serie or serie_from_chave


def extract_dates(text: str) -> list[str]:
    out = []
    for d, m, y in DATE_RE.findall(text):
        if 2020 <= int(y) <= 2035:
            out.append(iso_date(d, m, y))
    return out


def extract_cnpjs(text: str) -> list[str]:
    found = []
    for raw in CNPJ_RE.findall(text):
        c = clean_cnpj(raw)
        if c and c not in found:
            found.append(c)
    return found


def extract_moneys(text: str) -> list[float]:
    vals = []
    for m in MONEY_RE.findall(text):
        v = br_money(m)
        if v is not None and 0 <= v < 50_000_000:
            vals.append(v)
    return vals


def find_labeled_money(text: str, labels: list[str]) -> float | None:
    """Procura valor monetário próximo a um rótulo (mesma linha ou seguinte)."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    joined = "\n".join(lines)
    for lab in labels:
        # mesma linha
        for ln in lines:
            if re.search(lab, ln, re.I):
                ms = MONEY_RE.findall(ln)
                if ms:
                    # pega o maior da linha (costuma ser o valor do campo)
                    nums = [br_money(x) for x in ms]
                    nums = [n for n in nums if n is not None]
                    if nums:
                        return max(nums)
        # janela regex
        pat = re.compile(
            lab + r".{0,80}?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})",
            re.I | re.S,
        )
        m = pat.search(joined)
        if m:
            return br_money(m.group(1))
    return None


def _money_lines(block: str) -> list[list[float]]:
    """Linhas do bloco de imposto com 2+ valores monetários (fileiras DANFE)."""
    rows = []
    for ln in block.splitlines():
        vals = extract_moneys(ln)
        if len(vals) >= 2:
            rows.append(vals)
    return rows


def _apply_danfe_row1(result: dict, row: list[float], expected: float | None) -> bool:
    """Mapeia 1ª fileira: BC | ICMS | BC ST | ICMS ST | [trib] | Produtos."""
    if len(row) < 4:
        return False
    prod_idx = None
    if expected is not None:
        tol = max(0.05, expected * 0.02)
        for i, v in enumerate(row):
            if abs(v - expected) <= tol:
                prod_idx = i
                break
    if prod_idx is None:
        # último valor "grande" da linha costuma ser produtos
        prod_idx = len(row) - 1

    # layout clássico: índices 0..3 = BC, ICMS, BCST, ICMSST; produtos no fim
    if prod_idx >= 4:
        result["base_icms"] = row[0]
        result["valor_icms"] = row[1]
        result["base_icms_st"] = row[2]
        result["valor_icms_st"] = row[3]
        result["valor_produtos"] = expected if expected is not None else row[prod_idx]
        return True
    if prod_idx == 1 and len(row) >= 2:
        # linha degradada: BC, produtos (sem ICMS legível)
        result["base_icms"] = row[0]
        result["valor_produtos"] = expected if expected is not None else row[1]
        return True
    if len(row) >= 5:
        result["base_icms"] = row[0]
        result["valor_icms"] = row[1]
        result["base_icms_st"] = row[2]
        result["valor_icms_st"] = row[3]
        result["valor_produtos"] = expected if expected is not None else row[-1]
        return True
    return False


def _apply_danfe_row2(result: dict, row: list[float], expected: float | None) -> None:
    """2ª fileira: Frete | Seguro | Desconto | Outras | IPI | Total NF."""
    if len(row) >= 6:
        result["valor_frete"] = row[0]
        result["valor_seguro"] = row[1]
        result["valor_desconto"] = row[2]
        result["outras_despesas"] = row[3]
        result["valor_ipi"] = row[4]
        result["valor_total_nf"] = row[5]
    elif len(row) >= 2 and expected is not None:
        tol = max(0.05, expected * 0.02)
        for v in reversed(row):
            if abs(v - expected) <= tol or v >= expected * 0.9:
                result["valor_total_nf"] = v
                break


def parse_tax_block(text: str, expected_produtos: float | None = None) -> dict:
    """Extrai campos do quadro CÁLCULO DO IMPOSTO.

    Se expected_produtos (SIAT) for informado, valida/ancora a leitura dos valores.
    """
    text = normalize_ocr_decimals(text)
    block = text
    idx = re.search(
        r"C[AÁÁ]?LCULO\s+DO\s+IMPOSTO|BASE\s+DE\s+C[AÁ]L[CQ]ULO|VALOR\s+DO\s+[IK][CM]S",
        text,
        re.I,
    )
    if idx:
        block = text[idx.start() : idx.start() + 1800]
    block = normalize_ocr_decimals(block)

    result = {
        "base_icms": find_labeled_money(block, [r"BASE\s+DE\s+C[AÁ]L", r"BASE\s+ICMS", r"BASE\s+DE\s+CAL"]),
        "valor_icms": find_labeled_money(
            block,
            [r"VALOR\s+DO\s+ICMS(?!\s+ST)", r"VALOR\s+DO\s+[IK][CM]S(?!\s+ST|EUB|SUB)", r"VALOR\s+ICMS(?!\s+ST)"],
        ),
        "base_icms_st": find_labeled_money(block, [r"BASE.*ICMS\s*ST", r"BC\s*ICMS\s*ST", r"KAS\s*ST"]),
        "valor_icms_st": find_labeled_money(block, [r"VALOR\s+DO\s+ICMS\s*ST", r"ICMS\s*ST", r"SUBSTIT"]),
        "valor_produtos": find_labeled_money(
            block, [r"VALOR\s+TOTAL\s+DOS\s+PROD", r"TOTAL\s+DOS\s+PROO", r"VLR\.?\s*TOTAL\s+DOS\s+PROD"]
        ),
        "valor_frete": find_labeled_money(block, [r"VALOR\s+DO\s+FRETE", r"VLR\.?\s*FRETE"]),
        "valor_seguro": find_labeled_money(block, [r"VALOR\s+DO\s+SEGURO", r"SE[CG]ARO"]),
        "valor_desconto": find_labeled_money(block, [r"VALOR\s+DO\s+DESCONTO", r"DESCONTO"]),
        "outras_despesas": find_labeled_money(block, [r"OUTRAS\s+DESPESAS", r"DESP\.?\s*ACESS"]),
        "valor_ipi": find_labeled_money(block, [r"VALOR\s+DO\s+IPI", r"VLR\.?\s*IPI"]),
        "valor_total_nf": find_labeled_money(
            block, [r"VALOR\s+TOTAL\s+DA\s+NOTA", r"TOTAL\s+DA\s+NOTA", r"VLR\.?\s*TOTAL\s+DA\s+NF"]
        ),
        "valor_pis": find_labeled_money(text, [r"VALOR\s+(?:DO\s+)?PIS"]),
        "valor_cofins": find_labeled_money(text, [r"VALOR\s+(?:DO\s+)?COFINS"]),
        "tax_confidence": "low",
    }

    rows = _money_lines(block)
    # Prioriza fileiras posicionais DANFE (mais confiáveis que rótulos OCR)
    if rows:
        # escolhe a linha que contém o valor SIAT, senão a com mais valores
        row1 = None
        if expected_produtos is not None:
            tol = max(0.05, expected_produtos * 0.02)
            for r in rows:
                if any(abs(v - expected_produtos) <= tol for v in r) and len(r) >= 4:
                    row1 = r
                    break
        if row1 is None:
            row1 = max(rows, key=len)
        if _apply_danfe_row1(result, row1, expected_produtos):
            result["tax_confidence"] = "high"
        # 2ª fileira: a seguinte com >=4 valores ou a que tem total ≈ produtos
        idx1 = rows.index(row1) if row1 in rows else 0
        for r2 in rows[idx1 + 1 : idx1 + 3]:
            if len(r2) >= 4:
                _apply_danfe_row2(result, r2, expected_produtos or result.get("valor_produtos"))
                break

    moneys = extract_moneys(block)

    # Ancoragem SIAT se ainda faltar ICMS
    if expected_produtos is not None and expected_produtos > 0:
        tol = max(0.05, expected_produtos * 0.02)
        if result.get("valor_icms") is None:
            for i, v in enumerate(moneys):
                if abs(v - expected_produtos) <= tol and i >= 1:
                    # tipicamente: BC, ICMS, BC ST, ICMS ST, [trib], Produtos
                    if i >= 4:
                        result["base_icms"] = result["base_icms"] or moneys[i - 4]
                        result["valor_icms"] = moneys[i - 3]
                        result["base_icms_st"] = result.get("base_icms_st") or moneys[i - 2]
                        result["valor_icms_st"] = result.get("valor_icms_st") or moneys[i - 1]
                    elif i >= 1:
                        result["valor_icms"] = moneys[i - 1]
                        result["base_icms"] = result["base_icms"] or (moneys[i - 2] if i >= 2 else None)
                    result["valor_produtos"] = expected_produtos
                    result["tax_confidence"] = "high"
                    break
        result["valor_produtos"] = expected_produtos
        if result["valor_total_nf"] is not None and result["valor_total_nf"] < expected_produtos * 0.5:
            result["valor_total_nf"] = None
        # descarta ICMS absurdo (alíquota > 40% ou base ridícula)
        bc, ic = result.get("base_icms"), result.get("valor_icms")
        if bc and ic and bc > 0:
            aliq = 100 * ic / bc
            if aliq > 40 or aliq < 0 or (bc < expected_produtos * 0.05 and expected_produtos > 100):
                result["base_icms"] = None
                result["valor_icms"] = None
                result["tax_confidence"] = "low"

    if result["valor_total_nf"] is None and moneys:
        if expected_produtos:
            cands = [v for v in moneys if v >= expected_produtos * 0.9]
            result["valor_total_nf"] = max(cands) if cands else expected_produtos
        else:
            result["valor_total_nf"] = max(moneys)
    if result["valor_produtos"] is None and expected_produtos is not None:
        result["valor_produtos"] = expected_produtos

    return result


def parse_page(
    img: np.ndarray,
    source_file: str,
    page_index: int,
    known_nfs: set[str] | None = None,
    siat_by_nf: dict | None = None,
) -> dict:
    pre = preprocess(img)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    full = ocr_image(pre, psm=6)
    header = ocr_image(crop(pre, 0.0, 0.28), psm=6)
    # Impostos: combina binarizado + cinza e 2 PSMs (scans ruins)
    tax_crop_pre = crop(pre, 0.25, 0.58)
    tax_crop_gray = crop(gray, 0.25, 0.58)
    tax = "\n".join(
        [
            ocr_image(tax_crop_pre, psm=6),
            ocr_image(tax_crop_pre, psm=4),
            ocr_image(tax_crop_gray, psm=6),
        ]
    )
    products = ocr_image(crop(pre, 0.45, 0.85), psm=6)
    header2 = ocr_image(crop(pre, 0.0, 0.22, 0.45, 1.0), psm=4)

    combined = "\n".join([header, header2, tax, products, full])
    nf, serie = extract_nf_serie(header + "\n" + header2 + "\n" + full, known_nfs)
    chave = extract_chave(header + "\n" + header2) or extract_chave(full)

    # Se achou NF no SIAT, usa valor esperado para ancorar impostos
    expected_prod = None
    if nf and siat_by_nf and nf in siat_by_nf:
        expected_prod = siat_by_nf[nf].get("total_value")

    dates = extract_dates(combined)
    # filtra datas OCR absurdas (ano 2028 etc) preferindo 2026
    dates_ok = [d for d in dates if d.startswith("2026")] or dates
    cnpjs = extract_cnpjs(combined)
    company = "10876822000194"
    emit_cnpj = next((c for c in cnpjs if c != company), None)
    dest_cnpj = company if company in cnpjs else None
    taxes = parse_tax_block(tax + "\n" + full, expected_produtos=expected_prod)
    cfops = extract_cfops(products + "\n" + full)
    emitente = guess_emitente(header + "\n" + full)

    aliq = None
    if taxes.get("base_icms") and taxes.get("valor_icms") and taxes["base_icms"] > 0:
        aliq = round(100 * taxes["valor_icms"] / taxes["base_icms"], 2)
        # alíquotas interestaduais típicas BR
        if aliq > 30 or aliq < 0:
            aliq = None

    h, w = pre.shape[:2]
    return {
        "source_file": source_file,
        "page_index": page_index,
        "doc_number": nf,
        "serie": serie,
        "chave_acesso": chave,
        "issue_date": dates_ok[0] if dates_ok else None,
        "dates_found": dates_ok,
        "emit_name": emitente,
        "emit_cnpj": emit_cnpj,
        "dest_cnpj": dest_cnpj,
        "cfops": cfops,
        "cfop": cfops[0] if cfops else None,
        "base_icms": taxes.get("base_icms"),
        "valor_icms": taxes.get("valor_icms"),
        "aliquota_icms": aliq,
        "base_icms_st": taxes.get("base_icms_st"),
        "valor_icms_st": taxes.get("valor_icms_st"),
        "valor_produtos": taxes.get("valor_produtos"),
        "valor_frete": taxes.get("valor_frete"),
        "valor_seguro": taxes.get("valor_seguro"),
        "valor_desconto": taxes.get("valor_desconto"),
        "outras_despesas": taxes.get("outras_despesas"),
        "valor_ipi": taxes.get("valor_ipi"),
        "valor_pis": taxes.get("valor_pis"),
        "valor_cofins": taxes.get("valor_cofins"),
        "valor_total_nf": taxes.get("valor_total_nf"),
        "tax_confidence": taxes.get("tax_confidence"),
        "ocr_chars": len(full),
        "image_size": [w, h],
    }


def guess_emitente(text: str, company_cnpj: str = "10876822000194") -> str | None:
    lines = [ln.strip() for ln in text.splitlines() if len(ln.strip()) > 5]
    skip = re.compile(
        r"DANFE|DESTINAT|REMETENTE|CHAVE|CONSULTA|PORTAL|IDENTIFICA|FOLHA|SERIE|NF-e|NFE|"
        r"CALCULO|IMPOSTO|PRODUTO|TRANSPORT|DUPLICATA|FALCAO|FRAZAO|MADEPINUS|NOME RAZAO",
        re.I,
    )
    for ln in lines[:25]:
        if skip.search(ln):
            continue
        if re.search(r"LTDA|EIRELI|S/?A|ME\b|EPP|COMERCIO|INDUSTRIA|METAL|FERRAG", ln, re.I):
            clean = re.sub(r"[^A-Za-zÀ-ú0-9\s/\-\.\&]", " ", ln)
            clean = re.sub(r"\s+", " ", clean).strip()
            if 8 <= len(clean) <= 80:
                return clean
    return None


def extract_cfops(text: str) -> list[str]:
    found = []
    for m in CFOP_RE.findall(text):
        c = re.sub(r"\D", "", m)
        if len(c) == 4 and c[0] in "123567" and c not in found:
            if c.startswith(("51", "61", "54", "64", "11", "21", "12", "22", "56", "65", "69")):
                found.append(c)
    return found


def load_siat(month: str) -> dict | None:
    path = DATA_DIR / f"entradaSiat-{month}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_name(s: str | None) -> str:
    if not s:
        return ""
    s = s.upper()
    s = re.sub(r"[ÀÁÂÃÄ]", "A", s)
    s = re.sub(r"[ÈÉÊË]", "E", s)
    s = re.sub(r"[ÌÍÎÏ]", "I", s)
    s = re.sub(r"[ÒÓÔÕÖ]", "O", s)
    s = re.sub(r"[ÙÚÛÜ]", "U", s)
    s = s.replace("Ç", "C")
    return re.sub(r"[^A-Z0-9]", "", s)


def match_siat(note: dict, siat_notes: list[dict]) -> dict | None:
    nf = note.get("doc_number")
    if nf and nf != "0":
        cands = [n for n in siat_notes if n.get("doc_number") == nf]
        if len(cands) == 1:
            return cands[0]
        if len(cands) > 1 and note.get("emit_cnpj"):
            for c in cands:
                if clean_cnpj(c.get("counterparty_doc")) == note["emit_cnpj"]:
                    return c
            return cands[0]
    # CNPJ fornecedor + valor (±2%)
    emit = clean_cnpj(note.get("emit_cnpj"))
    val = note.get("valor_produtos") or note.get("valor_total_nf")
    if emit and val:
        for n in siat_notes:
            if clean_cnpj(n.get("counterparty_doc")) != emit:
                continue
            tv = n.get("total_value") or 0
            if tv and abs(tv - val) <= max(0.05, tv * 0.02):
                return n
    # fallback por data + nome
    if note.get("issue_date") and note.get("emit_name"):
        nn = normalize_name(note["emit_name"])
        for n in siat_notes:
            if n.get("issue_date") != note["issue_date"]:
                continue
            sn = normalize_name(n.get("counterparty_name"))
            if nn and sn and (nn[:10] in sn or sn[:10] in nn):
                return n
    return None


def merge_note(ocr: dict, siat: dict | None) -> dict:
    merged = {
        **ocr,
        "siat_match": bool(siat),
        "siat": None,
        "merged": {},
    }
    if siat:
        merged["siat"] = {
            "doc_number": siat.get("doc_number"),
            "issue_date": siat.get("issue_date"),
            "counterparty_name": siat.get("counterparty_name"),
            "counterparty_doc": siat.get("counterparty_doc"),
            "emit_uf": siat.get("emit_uf"),
            "cfops_entrada": siat.get("cfops_entrada"),
            "cfops_supplier": siat.get("cfops_supplier"),
            "destinacao": siat.get("destinacao"),
            "total_value": siat.get("total_value"),
        }
    # Preferência: SIAT para identidade; OCR para impostos
    m = merged["merged"]
    m["doc_number"] = (siat or {}).get("doc_number") or ocr.get("doc_number")
    m["issue_date"] = (siat or {}).get("issue_date") or ocr.get("issue_date")
    m["emit_name"] = (siat or {}).get("counterparty_name") or ocr.get("emit_name")
    m["emit_cnpj"] = (siat or {}).get("counterparty_doc") or ocr.get("emit_cnpj")
    m["emit_uf"] = (siat or {}).get("emit_uf")
    m["destinacao"] = (siat or {}).get("destinacao")
    m["cfops_entrada"] = (siat or {}).get("cfops_entrada") or (
        [f"2{c[1:]}" if c.startswith("6") else f"1{c[1:]}" if c.startswith("5") else c for c in (ocr.get("cfops") or [])]
    )
    m["cfops_supplier"] = (siat or {}).get("cfops_supplier") or ocr.get("cfops")
    m["valor_produtos_siat"] = (siat or {}).get("total_value")
    m["valor_produtos"] = (siat or {}).get("total_value") or ocr.get("valor_produtos")
    # total NF: só confia no OCR se >= 90% dos produtos SIAT
    ocr_total = ocr.get("valor_total_nf")
    if ocr_total and m["valor_produtos"] and ocr_total >= m["valor_produtos"] * 0.9:
        m["valor_total_nf"] = ocr_total
    else:
        m["valor_total_nf"] = m["valor_produtos"]
    m["base_icms"] = ocr.get("base_icms")
    m["valor_icms"] = ocr.get("valor_icms")
    m["aliquota_icms"] = ocr.get("aliquota_icms")
    m["tax_confidence"] = ocr.get("tax_confidence") or "low"
    m["base_icms_st"] = ocr.get("base_icms_st")
    m["valor_icms_st"] = ocr.get("valor_icms_st")
    m["valor_frete"] = ocr.get("valor_frete")
    m["valor_ipi"] = ocr.get("valor_ipi")
    m["valor_pis"] = ocr.get("valor_pis")
    m["valor_cofins"] = ocr.get("valor_cofins")
    m["chave_acesso"] = ocr.get("chave_acesso")
    m["serie"] = ocr.get("serie")
    m["source_file"] = ocr.get("source_file")
    m["page_index"] = ocr.get("page_index")

    # ICMS antecipação PI (estimativa): só se interestadual (UF != PI) e há alíquota origem
    # Fórmula memória jun/26: base * (aliq_estadual 22.5% - aliq_origem)
    if m.get("emit_uf") and m["emit_uf"] != "PI" and m.get("base_icms") and m.get("aliquota_icms") is not None:
        aliq_origem = m["aliquota_icms"]
        aliq_pi = 22.5
        aliq_final = round(aliq_pi - aliq_origem, 2)
        if aliq_final > 0:
            m["icms_antecipacao_estimada"] = round(m["base_icms"] * aliq_final / 100, 2)
            m["aliq_origem_estimada"] = aliq_origem
            m["aliq_final_estimada"] = aliq_final
            m["aliq_estadual"] = aliq_pi
    return merged


def process_month(month: str, limit: int | None = None) -> dict:
    entrada = find_entrada_dir(month)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(f for f in os.listdir(entrada) if f.lower().endswith(".pdf"))
    if limit:
        pdfs = pdfs[:limit]

    siat = load_siat(month)
    siat_notes = (siat or {}).get("notes") or []
    known_nfs = {n.get("doc_number") for n in siat_notes if n.get("doc_number")}
    # se houver NF duplicada no SIAT, fica a última
    siat_by_nf = {n["doc_number"]: n for n in siat_notes if n.get("doc_number")}

    pages_out = []
    print(f"[pasta] {entrada}")
    print(f"[pdfs] {len(pdfs)} · SIAT notes={len(siat_notes)}")

    for i, name in enumerate(pdfs, 1):
        path = os.path.join(entrada, name)
        print(f"\n[{i}/{len(pdfs)}] {name}")
        try:
            doc = fitz.open(path)
        except Exception as e:
            print(f"  ERRO abrir: {e}")
            continue
        for pi in range(len(doc)):
            print(f"  pagina {pi+1}/{len(doc)}...", flush=True)
            try:
                img = render_page(doc[pi])
                if pi == 0:
                    dbg = WORK_DIR / f"{Path(name).stem}_p0.png"
                    cv2.imwrite(str(dbg), img)
                parsed = parse_page(img, name, pi, known_nfs=known_nfs, siat_by_nf=siat_by_nf)
                if parsed["ocr_chars"] < 80 and not parsed.get("doc_number"):
                    print("  (pagina quase vazia — pulada)")
                    continue
                merged = merge_note(parsed, match_siat(parsed, siat_notes))
                pages_out.append(merged)
                m = merged["merged"]
                print(
                    f"  -> NF {m.get('doc_number')} | {m.get('emit_name')} | "
                    f"total={m.get('valor_total_nf')} ICMS={m.get('valor_icms')} "
                    f"conf={m.get('tax_confidence')} SIAT={'sim' if merged['siat_match'] else 'nao'}"
                )
            except Exception as e:
                print(f"  ERRO pagina {pi}: {e}")

    # Notas SIAT sem OCR correspondente
    matched_nfs = {
        (p["merged"].get("doc_number"), clean_cnpj(p["merged"].get("emit_cnpj")))
        for p in pages_out
        if p.get("siat_match")
    }
    unmatched_siat = []
    for n in siat_notes:
        key = (n.get("doc_number"), clean_cnpj(n.get("counterparty_doc")))
        if key not in matched_nfs and (n.get("doc_number"), None) not in {
            (a, None) for a, _ in matched_nfs
        }:
            # check by nf only
            if not any(p["merged"].get("doc_number") == n.get("doc_number") for p in pages_out):
                unmatched_siat.append(n)

    summary = {
        "pdfs": len(pdfs),
        "pages_ocr": len(pages_out),
        "matched_siat": sum(1 for p in pages_out if p["siat_match"]),
        "unmatched_siat": len(unmatched_siat),
        "with_icms": sum(1 for p in pages_out if p["merged"].get("valor_icms") is not None),
        "with_total": sum(1 for p in pages_out if p["merged"].get("valor_total_nf") is not None),
        "with_chave": sum(1 for p in pages_out if p["merged"].get("chave_acesso")),
        "total_produtos_ocr": round(
            sum(p["merged"].get("valor_produtos") or 0 for p in pages_out), 2
        ),
        "total_icms_ocr": round(
            sum(p["merged"].get("valor_icms") or 0 for p in pages_out), 2
        ),
        "total_nf_ocr": round(
            sum(p["merged"].get("valor_total_nf") or 0 for p in pages_out), 2
        ),
        "icms_antecipacao_estimada": round(
            sum(p["merged"].get("icms_antecipacao_estimada") or 0 for p in pages_out), 2
        ),
    }

    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "month": month,
        "engine": "pymupdf+tesseract-por+eng+region-ocr",
        "source_dir": entrada,
        "summary": summary,
        "notes": pages_out,
        "siat_without_pdf": [
            {
                "doc_number": n.get("doc_number"),
                "issue_date": n.get("issue_date"),
                "counterparty_name": n.get("counterparty_name"),
                "emit_uf": n.get("emit_uf"),
                "total_value": n.get("total_value"),
                "destinacao": n.get("destinacao"),
            }
            for n in unmatched_siat
        ],
    }

    out = DATA_DIR / f"entradaDanfeOcr-{month}.json"
    # versão enxuta para UI (sem ocr_preview gigante em todas — mantém preview curto)
    for n in payload["notes"]:
        n.pop("ocr_preview", None)
        # mantém preview curto se quiser debug
        if "ocr_chars" in n:
            pass
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[ok] Gravado {out}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True, help="YYYY-MM")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    process_month(args.month, args.limit)


if __name__ == "__main__":
    main()
