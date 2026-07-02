// server/src/engine/linkDanfe.js
// Vincula DANFE (PDF) e XML fiscal a recebimentos de clientes por valor + data + nome.

import fs from 'node:fs';
import path from 'node:path';
import { extractClientName, isOwnCompany, isPartner } from '../utils/extractCounterparty.js';

const VALUE_TOLERANCE = 0.05;
const DATE_WINDOW_DAYS = 7;

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
  if (!na || !nb || na.length < 4 || nb.length < 4) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = na.match(/.{4,}/g) || [];
  return wordsA.some((w) => nb.includes(w));
}

/** Localiza PDF DANFE correspondente ao XML (mesma chave de 44 dígitos) */
export function findDanfePdf(xmlPath) {
  if (!xmlPath || !fs.existsSync(xmlPath)) return null;
  const chave = xmlPath.match(/(\d{44})/)?.[1];
  if (!chave) return null;
  const dir = path.dirname(xmlPath);
  const parent = path.dirname(dir);
  const grandParent = path.dirname(parent);
  const candidates = [
    path.join(dir, `${chave}.pdf`),
    path.join(parent, 'PDF', `${chave}.pdf`),
    path.join(parent, `${chave}.pdf`),
    path.join(grandParent, 'PDF', `${chave}.pdf`),
    path.join(dir, '..', `${chave}.pdf`),
    path.join(dir, 'DANFE', `${chave}.pdf`),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/**
 * @param {object} db
 * @param {string} month
 * @param {Function} copyAttachment - (srcPath, month, hash) => copiedPath
 * @param {Function} insertAttach - prepared statement
 */
export function linkDanfeToClientReceipts(db, month, copyAttachment, insertAttach) {
  const clientEntries = db.prepare(`
    SELECT le.id AS ledger_entry_id, le.entry_date, le.description, le.amount, le.category,
           rt.id AS raw_transaction_id, rt.counterparty
    FROM ledger_entries le
    JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    WHERE le.entry_date LIKE ?
      AND le.category LIKE '%cliente%'
      AND rt.amount > 0
  `).all(`${month}%`);

  const fiscalDocs = db.prepare(`
    SELECT fd.*, sf.path AS xml_path
    FROM fiscal_documents fd
    JOIN source_files sf ON sf.id = fd.source_file_id
    WHERE fd.issue_date LIKE ?
      AND fd.cancelled = 0
      AND CAST(fd.doc_model AS INTEGER) IN (55, 65)
  `).all(`${month}%`);

  const usedFiscal = new Set();
  const usedPdfs = new Set();
  let linked = 0;

  for (const entry of clientEntries) {
    const hay = `${entry.description} ${entry.counterparty || ''}`;
    if (isOwnCompany(hay) || isPartner(hay)) continue;

    const clientName = extractClientName(entry.description, entry.counterparty);
    const candidates = [];

    for (const doc of fiscalDocs) {
      if (usedFiscal.has(doc.id)) continue;
      if (!sameValue(entry.amount, doc.total_value)) continue;
      if (daysDiff(entry.entry_date, doc.issue_date) > DATE_WINDOW_DAYS) continue;

      let score = 0.7;
      const nameOk = clientName && doc.counterparty_name && nameMatch(clientName, doc.counterparty_name);
      if (nameOk) score = 0.95;
      else if (clientName && doc.counterparty_name) continue;
      else if (!doc.counterparty_name && doc.doc_model === '65') score = 0.75;

      const danfePdf = findDanfePdf(doc.xml_path);
      if (danfePdf) score += 0.05;
      candidates.push({ doc, danfePdf, score });
    }

    if (candidates.length === 0) continue;

    // Se vários candidatos com mesmo valor, exige match de nome
    const sameValueCandidates = candidates.filter((c) => c.score >= 0.7);
    let pool = sameValueCandidates;
    if (pool.length > 1 && clientName) {
      pool = pool.filter((c) => c.doc.counterparty_name && nameMatch(clientName, c.doc.counterparty_name));
    }
    if (pool.length === 0) continue;

    const best = pool.reduce((a, b) => (b.score > a.score ? b : a));
    if (best.score < 0.65) continue;

    const filesToAttach = [];
    const danfe = best.danfePdf;
    if (danfe && !usedPdfs.has(danfe)) {
      filesToAttach.push({
        path: danfe,
        name: path.basename(danfe),
        type: 'pdf',
        label: 'DANFE',
        score: best.score,
      });
      usedPdfs.add(danfe);
    }
    if (best.doc.xml_path && fs.existsSync(best.doc.xml_path)) {
      filesToAttach.push({
        path: best.doc.xml_path,
        name: path.basename(best.doc.xml_path),
        type: 'xml',
        label: 'XML NF-e',
        score: best.score,
      });
    }

    for (const file of filesToAttach) {
      const hash = `${entry.ledger_entry_id}-${file.name}`.replace(/[^a-z0-9]/gi, '').slice(0, 40);
      const copied = copyAttachment(file.path, month, hash);
      insertAttach.run({
        ledger_entry_id: entry.ledger_entry_id,
        raw_transaction_id: entry.raw_transaction_id,
        file_path: file.path,
        file_name: file.label ? `${file.label} — ${file.name}` : file.name,
        file_type: file.type,
        file_size: fs.statSync(file.path).size,
        match_type: best.score >= 0.9 ? 'exact' : 'fuzzy',
        match_score: file.score,
        copied_path: copied,
      });
      linked += 1;
    }
    usedFiscal.add(best.doc.id);
  }

  return { linked, clientEntries: clientEntries.length, fiscalDocs: fiscalDocs.length };
}

export default linkDanfeToClientReceipts;
