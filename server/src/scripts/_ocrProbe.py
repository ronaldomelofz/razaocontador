import fitz
import pytesseract
import os
import sys

entrada = r'\\192.168.1.190\f\ALAINE - CONTADORA\07-2026\NOTAS FISCAL DE ENTRADA'
print('exists', os.path.exists(entrada))
files = [f for f in os.listdir(entrada) if f.lower().endswith('.pdf')]
files = sorted(files, key=lambda f: os.path.getsize(os.path.join(entrada, f)))
print('count', len(files), 'menor', files[0], os.path.getsize(os.path.join(entrada, files[0])))
path = os.path.join(entrada, files[0])
doc = fitz.open(path)
print('pages', len(doc))
pix = doc[0].get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
out = r'e:\PROJETOS-CURSOR\RAZAO-CONTADOR\tmp_ocr_test.png'
pix.save(out)
print('img bytes', os.path.getsize(out))
text = pytesseract.image_to_string(out, lang='por+eng')
print('OCR len', len(text))
print(text[:3500])
