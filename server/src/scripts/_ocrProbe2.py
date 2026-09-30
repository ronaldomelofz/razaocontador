"""Probe: barcode/QR + OCR melhorado + API Surya."""
import os
import re
import fitz
import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
from pyzbar import pyzbar

ENTRADA = r'\\192.168.1.190\f\ALAINE - CONTADORA\07-2026\NOTAS FISCAL DE ENTRADA'
OUT = r'e:\PROJETOS-CURSOR\RAZAO-CONTADOR\tmp_ocr_work'
os.makedirs(OUT, exist_ok=True)

pdfs = sorted([f for f in os.listdir(ENTRADA) if f.lower().endswith('.pdf')])
print('pdfs', len(pdfs))

# Test first 3 PDFs for barcode + OCR
for name in pdfs[:3]:
    path = os.path.join(ENTRADA, name)
    doc = fitz.open(path)
    print(f'\n=== {name} pages={len(doc)} ===')
    for pi, page in enumerate(doc):
        # high res for barcode
        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))
        img_path = os.path.join(OUT, f'{os.path.splitext(name)[0]}_p{pi}.png')
        pix.save(img_path)
        # also try from pixmap samples
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
        if pix.n == 4:
            img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        elif pix.n == 3:
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # barcode attempts at multiple thresholds
        found = []
        for mat in [gray, cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11)]:
            for bar in pyzbar.decode(mat):
                data = bar.data.decode('utf-8', errors='ignore')
                found.append((bar.type, data))
        # also scan raw image
        for bar in pyzbar.decode(img):
            data = bar.data.decode('utf-8', errors='ignore')
            found.append((bar.type, data))

        # unique
        uniq = list({(t, d) for t, d in found})
        print(f'  page {pi}: barcodes={uniq}')

        # chave 44 digits in OCR
        # preprocess
        thr = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 15)
        # slight denoise
        thr = cv2.medianBlur(thr, 3)
        pre_path = os.path.join(OUT, f'{os.path.splitext(name)[0]}_p{pi}_bin.png')
        cv2.imwrite(pre_path, thr)

        cfg = '--oem 3 --psm 6'
        text = pytesseract.image_to_string(pre_path, lang='por+eng', config=cfg)
        chaves = re.findall(r'\d{44}', re.sub(r'\D', '', text))  # wrong - need spaced
        # chave often printed as groups of 4
        spaced = re.findall(r'(?:\d{4}\s*){11}', text)
        digits = re.sub(r'\D', '', text)
        chaves2 = re.findall(r'\d{44}', digits)
        print(f'  OCR chars={len(text)} chaves={chaves2[:2]} spaced_groups={len(spaced)}')
        # print interesting lines
        for line in text.splitlines():
            l = line.strip()
            if not l:
                continue
            if re.search(r'NF|DANFE|CHAVE|CNPJ|ICMS|TOTAL|CFOP|VALOR|EMIT|DEST', l, re.I) or re.search(r'\d{2}\.\d{3}\.\d{3}/\d{4}', l):
                print('   >', l[:120])

print('\n--- surya api ---')
try:
    import surya
    print('surya attrs', [a for a in dir(surya) if not a.startswith('_')][:30])
except Exception as e:
    print('surya fail', e)

try:
    from surya.recognition import RecognitionPredictor
    from surya.detection import DetectionPredictor
    print('surya predictors ok')
except Exception as e:
    print('surya predictors', e)
