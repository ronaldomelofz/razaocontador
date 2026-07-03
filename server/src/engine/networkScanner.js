// server/src/engine/networkScanner.js
// Varre a pasta UNC do servidor e indexa extratos, XMLs e anexos.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  NETWORK_BASE, BANK_FOLDER_MAP, ITAU_ACCOUNT_MAP,
  ATTACHMENT_EXTENSIONS, STATEMENT_EXTENSIONS,
} from '../config.js';

const SKIP_DIRS = new Set(['node_modules', '.git']);

function walkDir(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ATTACHMENT_EXTENSIONS.has(ext) || STATEMENT_EXTENSIONS.has(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

/** Resolve bank_account_id a partir do caminho do arquivo */
export function resolveBankAccount(filePath) {
  const upper = filePath.toUpperCase();
  for (const [folder, info] of Object.entries(BANK_FOLDER_MAP)) {
    if (upper.includes(folder)) return info;
  }
  if (upper.includes('BANCO ITAU') || upper.includes('BANCO ITA')) {
    for (const [acct, info] of Object.entries(ITAU_ACCOUNT_MAP)) {
      if (upper.includes(`CONTA ${acct}`) || upper.includes(acct.replace('-', ''))) {
        return info;
      }
    }
    if (upper.includes('29660')) return ITAU_ACCOUNT_MAP['29660-2'];
    if (upper.includes('57563')) return ITAU_ACCOUNT_MAP['57563-6'];
    if (upper.includes('AUTO MAIS') || upper.includes('APLICA')) {
      return { id: 'automais', coa: '1.01.01.01.03.0001' };
    }
  }
  return null;
}

/** Classifica arquivo: extrato | xml | comprovante | nota_fiscal | danfe | outro */
export function classifyFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  const upper = filePath.toUpperCase();

  if (ext === '.pdf' && /XML\s+\d{2}-\d{4}|\\NFE\\|\\NFCE\\|\d{44}\.PDF$/i.test(upper + base)) {
    return 'danfe';
  }
  if (STATEMENT_EXTENSIONS.has(ext) && /EXTRATO|extrato/i.test(base)) {
    return 'extrato';
  }
  if (ext === '.xml') return 'xml_nfe';
  if (upper.includes('XML')) return 'xml_nfe';
  if (upper.includes('COMBUST')) return 'combustivel';
  if (upper.includes('COMPROVANTE') || /^\d+ - \d{8}/.test(base)) return 'comprovante';
  if (upper.includes('NOTA FISCAL') || upper.includes('NOTAS FISCAL')) return 'nota_fiscal';
  if (upper.includes('FATURA CART') || upper.includes('FATURA-INTER')) return 'fatura_cartao';
  if (upper.includes('BOLETO')) return 'boleto';
  if (ATTACHMENT_EXTENSIONS.has(ext)) return 'anexo';
  return 'outro';
}

/** Extrai data e valor do nome de comprovante BB: "1 - 01062026 - Pagamento - 105,00.pdf" */
export function parseComprovanteFilename(filename) {
  const m = filename.match(/(\d+)\s*-\s*(\d{2})(\d{2})(\d{4})\s*-\s*([^-]+)\s*-\s*([\d.,]+)/i);
  if (!m) return null;
  const [, , day, month, year, tipo, valorStr] = m;
  const valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
  return {
    date: `${year}-${month}-${day}`,
    tipo: tipo.trim(),
    amount: valor,
    isPayment: /pagamento/i.test(tipo),
  };
}

/** Extrai valor do nome PIX Inter: "PIX_..._Nome.pdf" — sem valor no nome */
export function parsePixFilename(filename) {
  const dateM = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  const nameM = filename.match(/_([^_]+)\.pdf$/i);
  return {
    date: dateM ? `${dateM[1]}-${dateM[2]}-${dateM[3]}` : null,
    counterparty: nameM ? nameM[1].replace(/_/g, ' ') : null,
  };
}

export function scanMonthFolder(month) {
  const monthFolder = month.includes('-') && month.length === 7
    ? `${month.split('-')[1]}-${month.split('-')[0]}`
    : month;
  const root = path.join(NETWORK_BASE, monthFolder);
  if (!fs.existsSync(root)) {
    throw new Error(`Pasta não encontrada: ${root}`);
  }

  const allFiles = walkDir(root);
  const indexed = allFiles.map((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const bank = resolveBankAccount(filePath);
    let meta = {};
    const base = path.basename(filePath);
    if (classifyFile(filePath) === 'comprovante') {
      meta = parseComprovanteFilename(base) || parsePixFilename(base) || {};
    }
    return {
      path: filePath,
      name: base,
      ext,
      kind: classifyFile(filePath),
      bank_account_id: bank?.id ?? null,
      bank_coa: bank?.coa ?? null,
      size: fs.statSync(filePath).size,
      hash: crypto.createHash('sha1').update(filePath + fs.statSync(filePath).mtimeMs).digest('hex'),
      meta,
    };
  });

  return { root, files: indexed, stats: summarize(indexed) };
}

function summarize(files) {
  const byKind = {};
  for (const f of files) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  }
  return { total: files.length, byKind };
}

export default { scanMonthFolder, resolveBankAccount, classifyFile };
