// Vincula NF de entrada (compra) e comprovantes a pagamentos PIX de fornecedores.

import fs from 'node:fs';
import path from 'node:path';
import { findDanfePdf } from './linkDanfe.js';

const VALUE_TOLERANCE = 0.05;
const DATE_WINDOW_DAYS = 30;

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
  if (!na || !nb || na.length < 3) return false;
  return na.includes(nb) || nb.includes(na);
}

function supplierFromEntry(entry) {
  if (entry.counterparty) return entry.counterparty;
  const m = entry.description?.match(/Cp\s*:\d+-(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * @param {object} db
 * @param {Array} scannedFiles
 * @param {string} month
 * @param {Function} copyAttachment
 * @param {object} insertAttach - prepared statement
 */
export function linkSupplierEntrada(db, scannedFiles, month, copyAttachment, insertAttach) {
  const payments = db.prepare(`
    SELECT le.id AS ledger_entry_id, le.entry_date, le.description, le.amount, le.category,
           rt.id AS raw_transaction_id, rt.counterparty
    FROM ledger_entries le
    JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    WHERE le.entry_date LIKE ?
      AND rt.amount < 0
      AND (
        le.category LIKE '%fornecedor%'
        OR le.description LIKE '%IBYTE%'
        OR rt.counterparty LIKE '%IBYTE%'
      )
  `).all(`${month}%`);

  const fiscalEntrada = db.prepare(`
    SELECT fd.*, sf.path AS xml_path
    FROM fiscal_documents fd
    JOIN source_files sf ON sf.id = fd.source_file_id
    WHERE fd.issue_date LIKE ?
  `).all(`${month}%`);

  const entradaPdfs = scannedFiles.filter((f) =>
    f.ext === '.pdf' && /NOTAS FISCAL DE ENTRADA/i.test(f.path),
  );

  const comprovantes = scannedFiles.filter((f) =>
    f.kind === 'comprovante' && f.ext === '.pdf',
  );

  let linked = 0;

  for (const entry of payments) {
    const supplier = supplierFromEntry(entry);
    if (!supplier) continue;

    const existing = db.prepare(`
      SELECT file_name FROM attachments WHERE ledger_entry_id = ?
    `).all(entry.ledger_entry_id);
    if (existing.some((a) => /DANFE|NF entrada|XML NF/i.test(a.file_name))) continue;

    const filesToAttach = [];

    // 1) XML NF entrada (emitente = fornecedor) por valor + nome
    for (const doc of fiscalEntrada) {
      if (!sameValue(entry.amount, doc.total_value)) continue;
      if (daysDiff(entry.entry_date, doc.issue_date) > DATE_WINDOW_DAYS) continue;
      if (!nameMatch(supplier, doc.counterparty_name)) continue;

      const danfe = findDanfePdf(doc.xml_path);
      if (danfe) {
        filesToAttach.push({ path: danfe, name: `DANFE entrada — ${path.basename(danfe)}`, type: 'pdf', score: 0.95 });
      }
      if (doc.xml_path && fs.existsSync(doc.xml_path)) {
        filesToAttach.push({ path: doc.xml_path, name: `XML NF entrada — ${path.basename(doc.xml_path)}`, type: 'xml', score: 0.95 });
      }
      break;
    }

    // 2) PDF na pasta NOTAS FISCAL DE ENTRADA (nome do arquivo contém fornecedor)
    if (filesToAttach.length === 0) {
      for (const pdf of entradaPdfs) {
        if (nameMatch(supplier, pdf.name)) {
          filesToAttach.push({ path: pdf.path, name: `NF entrada — ${pdf.name}`, type: 'pdf', score: 0.85 });
          break;
        }
      }
    }

    // 3) Comprovante PIX do banco
    for (const comp of comprovantes) {
      if (nameMatch(supplier, comp.name) || nameMatch(supplier, comp.path)) {
        const already = filesToAttach.some((f) => f.path === comp.path);
        if (!already) {
          filesToAttach.push({ path: comp.path, name: `Comprovante PIX — ${comp.name}`, type: 'pdf', score: 0.9 });
        }
        break;
      }
    }

    for (const file of filesToAttach) {
      const hash = `${entry.ledger_entry_id}-sup-${path.basename(file.path)}`.replace(/[^a-z0-9]/gi, '').slice(0, 40);
      const copied = copyAttachment(file.path, month, hash);
      insertAttach.run({
        ledger_entry_id: entry.ledger_entry_id,
        raw_transaction_id: entry.raw_transaction_id,
        file_path: file.path,
        file_name: file.name,
        file_type: file.type,
        file_size: fs.statSync(file.path).size,
        match_type: file.score >= 0.9 ? 'exact' : 'fuzzy',
        match_score: file.score,
        copied_path: copied,
      });
      linked += 1;
    }
  }

  return { linked, payments: payments.length };
}

export default linkSupplierEntrada;
