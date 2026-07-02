// server/src/parsers/pdfDocument.js
// Extrai texto de PDFs nativos (não-escaneados). Para PDFs escaneados (imagem),
// use pdfScan.js (stub) com tesseract.js — requer anexo manual, Drive não faz OCR.

import fs from 'node:fs';
import pdfParse from 'pdf-parse';

export async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

/** Extrai valor e vencimento de guias DAR/DARF/GFD (regex genérico, ajustar por tipo) */
export function parseGuiaImposto(text) {
  const valorMatch = text.match(/Valor (a recolher|Total a Recolher|Total do Documento)[\s\S]{0,30}?([\d.,]+)/i);
  const vencMatch = text.match(/Vencimento[:\s]*?(\d{2}\/\d{2}\/\d{4})/i);
  return {
    valor: valorMatch ? Number(valorMatch[2].replace(/\./g, '').replace(',', '.')) : null,
    vencimento: vencMatch ? vencMatch[1] : null,
    raw_excerpt: text.slice(0, 500),
  };
}
