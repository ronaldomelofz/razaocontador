// server/src/engine/linkAttachments.js
// Vincula anexos do servidor a lançamentos por data + valor + nome.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { attachmentsRoot } from '../config.js';
import { parseComprovanteFilename, parsePixFilename } from './networkScanner.js';
import { linkDanfeToClientReceipts } from './linkDanfe.js';
import { linkSupplierEntrada } from './linkSupplierEntrada.js';

const VALUE_TOLERANCE = 0.05;
const DATE_WINDOW_DAYS = 2;

function daysDiff(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

function sameValue(a, b) {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= VALUE_TOLERANCE;
}

function normalizeName(s) {
  return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
}

function nameMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na) || na.slice(0, 6) === nb.slice(0, 6);
}

function copyAttachment(srcPath, month, hash) {
  const ext = path.extname(srcPath).toLowerCase();
  const destDir = path.join(attachmentsRoot, month);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${hash}${ext}`);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(srcPath, dest);
  }
  return dest;
}

/**
 * @param {object} db - better-sqlite3 instance
 * @param {Array} scannedFiles - resultado de networkScanner
 * @param {string} month - YYYY-MM
 */
export function linkAttachments(db, scannedFiles, month) {
  const entries = db.prepare(`
    SELECT le.id AS ledger_entry_id, le.entry_date, le.description, le.amount,
           rt.id AS raw_transaction_id, rt.counterparty, rt.bank_account_id
    FROM ledger_entries le
    JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    WHERE le.entry_date LIKE ?
  `).all(`${month}%`);

  const insertAttach = db.prepare(`
    INSERT OR IGNORE INTO attachments
      (ledger_entry_id, raw_transaction_id, file_path, file_name, file_type, file_size, match_type, match_score, copied_path)
    VALUES (@ledger_entry_id, @raw_transaction_id, @file_path, @file_name, @file_type, @file_size, @match_type, @match_score, @copied_path)
  `);

  const copyFn = (src, m, hash) => copyAttachment(src, m, hash);

  // 1) DANFE/XML para recebimentos de clientes
  const danfeResult = linkDanfeToClientReceipts(db, month, copyFn, insertAttach);

  // 2) NF entrada + comprovante para pagamentos de fornecedores
  const supplierResult = linkSupplierEntrada(db, scannedFiles, month, copyFn, insertAttach);

  // 3) Comprovantes PIX para pensão alimentícia
  let pensaoLinked = 0;
  const pensaoEntries = db.prepare(`
    SELECT le.id AS ledger_entry_id, le.entry_date, le.description, le.amount,
           rt.id AS raw_transaction_id, rt.counterparty
    FROM ledger_entries le JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    WHERE le.entry_date LIKE ? AND le.category LIKE '%Pensão alimentícia%'
  `).all(`${month}%`);
  const pixComprovantes = scannedFiles.filter((f) => f.kind === 'comprovante' && f.ext === '.pdf');
  for (const entry of pensaoEntries) {
    const has = db.prepare(`SELECT id FROM attachments WHERE ledger_entry_id = ?`).get(entry.ledger_entry_id);
    if (has) continue;
    const name = entry.counterparty || entry.description;
    const comp = pixComprovantes.find((f) => nameMatch(f.name, name) || nameMatch(f.path, name));
    if (!comp) continue;
    const hash = `${entry.ledger_entry_id}-pensao-${comp.name}`.replace(/[^a-z0-9]/gi, '').slice(0, 40);
    const copied = copyFn(comp.path, month, hash);
    insertAttach.run({
      ledger_entry_id: entry.ledger_entry_id,
      raw_transaction_id: entry.raw_transaction_id,
      file_path: comp.path,
      file_name: `Comprovante PIX — ${comp.name}`,
      file_type: 'pdf',
      file_size: comp.size,
      match_type: 'exact',
      match_score: 1.0,
      copied_path: copied,
    });
    pensaoLinked += 1;
  }

  const attachable = scannedFiles.filter((f) =>
    ['comprovante', 'anexo', 'nota_fiscal', 'boleto', 'fatura_cartao', 'xml_nfe'].includes(f.kind)
    && !f.name.endsWith('.zip'),
  );

  let linked = danfeResult.linked + supplierResult.linked + pensaoLinked;
  const usedFiles = new Set();

  for (const entry of entries) {
    const existing = db.prepare(`SELECT file_name FROM attachments WHERE ledger_entry_id = ?`).all(entry.ledger_entry_id);
    if (existing.some((a) => /DANFE|XML NF/i.test(a.file_name))) continue;

    let best = null;
    for (const file of attachable) {
      if (usedFiles.has(file.path)) continue;

      let score = 0;
      const parsed = parseComprovanteFilename(file.name) || {};
      const pixMeta = parsePixFilename(file.name);

      if (parsed.date && parsed.date === entry.entry_date && sameValue(parsed.amount, entry.amount)) {
        score = 1.0;
      } else if (parsed.date && daysDiff(parsed.date, entry.entry_date) <= DATE_WINDOW_DAYS && sameValue(parsed.amount, entry.amount)) {
        score = 0.9;
      } else if (pixMeta.date && daysDiff(pixMeta.date, entry.entry_date) <= DATE_WINDOW_DAYS) {
        if (pixMeta.counterparty && nameMatch(pixMeta.counterparty, entry.counterparty || entry.description)) {
          score = 0.75;
        }
      } else if (nameMatch(file.name, entry.counterparty) || nameMatch(file.name, entry.description)) {
        if (parsed.amount && sameValue(parsed.amount, entry.amount)) score = 0.8;
        else score = 0.4;
      }

      if (file.bank_account_id && file.bank_account_id === entry.bank_account_id) score += 0.05;
      if (score > 0.5 && (!best || score > best.score)) {
        best = { file, score };
      }
    }

    if (best) {
      const copied = copyAttachment(best.file.path, month, best.file.hash);
      insertAttach.run({
        ledger_entry_id: entry.ledger_entry_id,
        raw_transaction_id: entry.raw_transaction_id,
        file_path: best.file.path,
        file_name: best.file.name,
        file_type: best.file.ext.replace('.', ''),
        file_size: best.file.size,
        match_type: best.score >= 0.95 ? 'exact' : 'fuzzy',
        match_score: best.score,
        copied_path: copied,
      });
      usedFiles.add(best.file.path);
      linked += 1;
    }
  }

  return {
    linked,
    danfeLinked: danfeResult.linked,
    supplierLinked: supplierResult.linked,
    totalEntries: entries.length,
    totalFiles: attachable.length,
    clientReceipts: danfeResult.clientEntries,
  };
}

export default linkAttachments;
