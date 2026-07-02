// server/src/parsers/bankStatement.js
// Parsers para os 3 formatos de extrato encontrados no Drive do cliente:
//   - Itaú: XLSX/TXT/OFX (padrão "Data,Lançamento,Razão Social,CPF/CNPJ,Valor,Saldo")
//   - BB: CSV/TXT/XLSX (padrão agência;conta;...;data;...;historico;valor;D/C;detalhamento)
//   - Inter: CSV (padrão "Data;Descrição;Valor;Saldo")
// Cada parser retorna um array de { tx_date, description, counterparty, counterparty_doc, amount, external_ref }

import xlsx from 'xlsx';
import fs from 'node:fs';
import dayjs from 'dayjs';

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(/\./g, '').replace(',', '.').trim());
}

function toISODate(d) {
  // aceita DD/MM/YYYY ou DD.MM.YYYY
  const m = String(d).trim().match(/(\d{2})[./](\d{2})[./](\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Itaú — linhas tipo: Data,Lançamento,Razão Social,CPF/CNPJ,Valor,Saldo */
export function parseItauCSV(filePath, { sep = ',' } = {}) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line.split(sep);
    if (parts.length < 3) continue;
    const dateStr = parts[0];
    const iso = toISODate(dateStr);
    if (!iso) continue;
    const historico = (parts[1] || '').trim();
    if (/SALDO/i.test(historico)) continue;
    let counterparty = '', doc = '', valueRaw = '';
    if (parts.length >= 5) {
      counterparty = (parts[2] || '').trim();
      doc = (parts[3] || '').trim();
      valueRaw = parts[4];
    } else {
      valueRaw = parts[2];
    }
    const amount = toNumber(valueRaw);
    if (!valueRaw || Number.isNaN(amount)) continue;
    out.push({
      tx_date: iso,
      description: historico,
      counterparty,
      counterparty_doc: doc,
      amount,
      external_ref: null,
    });
  }
  return out;
}

/** BB — linhas tipo: agencia;conta;;data;databalancete;...;historico;documento;valor;D/C;detalhamento */
export function parseBBCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 10) continue;
    const dateStr = parts[3];
    const iso = toISODate(dateStr);
    if (!iso) continue;
    const historico = (parts[9] || '').trim();
    if (/Saldo Anterior|S A L D O/i.test(historico)) continue;
    const valueRaw = parts[10];
    const dc = (parts[11] || '').trim();
    let amount = toNumber(valueRaw);
    if (dc === 'D') amount = -Math.abs(amount);
    const detalhamento = (parts[12] || '').trim();
    out.push({
      tx_date: iso,
      description: `${historico} ${detalhamento}`.trim(),
      counterparty: detalhamento,
      counterparty_doc: null,
      amount,
      external_ref: parts[7] || null,
    });
  }
  return out;
}

/** Inter — linhas tipo: DD/MM/YYYY;Descrição: "Cp :xxx-NOME";Valor;Saldo */
export function parseInterCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const iso = toISODate(parts[0]);
    if (!iso) continue;
    const description = (parts[1] || '').replace(/"/g, '').trim();
    const amount = toNumber(parts[2]);
    if (Number.isNaN(amount)) continue;
    const nameMatch = description.match(/-([A-ZÀ-Ú][^"]+)$/i);
    out.push({
      tx_date: iso,
      description,
      counterparty: nameMatch ? nameMatch[1].trim() : null,
      counterparty_doc: null,
      amount,
      external_ref: null,
    });
  }
  return out;
}

/** XLSX genérico no padrão Itaú (Data,Lançamento,Razão Social,CPF/CNPJ,Valor,Saldo) */
export function parseItauXLSX(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
  const out = [];
  for (const row of rows) {
    const [dateStr, historico, counterparty, doc, valueRaw] = row;
    const iso = toISODate(dateStr);
    if (!iso || !historico) continue;
    if (/SALDO/i.test(historico)) continue;
    const amount = toNumber(valueRaw);
    if (!valueRaw || Number.isNaN(amount)) continue;
    out.push({
      tx_date: iso,
      description: String(historico).trim(),
      counterparty: counterparty ? String(counterparty).trim() : '',
      counterparty_doc: doc ? String(doc).trim() : '',
      amount,
      external_ref: null,
    });
  }
  return out;
}

/** Detecta o parser certo pelo bank_account_id + extensão do arquivo */
export function parseStatement(filePath, bankAccountId) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (bankAccountId.startsWith('itau')) {
    if (ext === 'xlsx') return parseItauXLSX(filePath);
    return parseItauCSV(filePath, { sep: ext === 'txt' ? ';' : ',' });
  }
  if (bankAccountId.startsWith('bb')) {
    return parseBBCSV(filePath);
  }
  if (bankAccountId.startsWith('inter')) {
    return parseInterCSV(filePath);
  }
  throw new Error(`Sem parser definido para ${bankAccountId} (${filePath})`);
}
