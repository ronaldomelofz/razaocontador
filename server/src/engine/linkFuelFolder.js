// server/src/engine/linkFuelFolder.js
// Captura cupons/notas da pasta COMBUSTÍVEL no servidor de rede.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NETWORK_BASE, attachmentsRoot, netlifyDataRoot } from '../config.js';
import { parseFuelFilename, FUEL_DOC_EXTENSIONS } from '../parsers/fuelDocument.js';

const FUEL_ACCOUNT_PREFIX = '4.02.01.01.06';
const SKIP_FILES = /^(desktop\.ini|thumbs\.db)$/i;

function fuelFolderPath(month) {
  const monthFolder = `${month.split('-')[1]}-${month.split('-')[0]}`;
  return path.join(NETWORK_BASE, monthFolder, 'COMBUSTÍVEL');
}

function daysDiff(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

function timeFromText(text) {
  const m = String(text || '').match(/(\d{2})[:\s](\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function timeDiffMinutes(t1, t2) {
  if (t1 == null || t2 == null) return 9999;
  return Math.abs(t1 - t2);
}

export function scanFuelFolder(month) {
  const dir = fuelFolderPath(month);
  if (!fs.existsSync(dir)) {
    return { dir, files: [], missing: true };
  }

  const files = fs.readdirSync(dir)
    .filter((name) => !SKIP_FILES.test(name))
    .filter((name) => FUEL_DOC_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      const parsed = parseFuelFilename(name, stat);
      return {
        name,
        path: full,
        ext: path.extname(name).toLowerCase(),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        doc_date: parsed.doc_date,
        doc_time: parsed.doc_time,
        hash: crypto.createHash('sha1').update(full + stat.mtimeMs).digest('hex').slice(0, 16),
      };
    })
    .sort((a, b) => (a.doc_date || '').localeCompare(b.doc_date || ''));

  return { dir, files, missing: false };
}

function copyFuelFile(srcPath, month, hash, ext) {
  const fileName = `${hash}${ext}`;
  const attachDir = path.join(attachmentsRoot, month, 'combustivel');
  const publicDir = path.join(netlifyDataRoot, '..', 'anexos', month, 'combustivel');
  fs.mkdirSync(attachDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const attachDest = path.join(attachDir, fileName);
  const publicDest = path.join(publicDir, fileName);
  if (!fs.existsSync(attachDest)) fs.copyFileSync(srcPath, attachDest);
  if (!fs.existsSync(publicDest)) fs.copyFileSync(srcPath, publicDest);

  return { attachDest, publicDest, fileName, url: `/anexos/${month}/combustivel/${fileName}` };
}

function findFuelEntries(db, month) {
  return db.prepare(`
    SELECT le.id, le.entry_date, le.description, le.amount, le.category, le.debit_account,
           le.status, rt.counterparty, rt.bank_account_id,
           coa_d.name AS debit_name
    FROM ledger_entries le
    JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    LEFT JOIN chart_of_accounts coa_d ON coa_d.code = le.debit_account
    WHERE le.entry_date LIKE ?
      AND (
        le.debit_account LIKE ?
        OR le.category LIKE '%combust%'
        OR le.description LIKE '%POSTO%'
        OR le.description LIKE '%COMBUST%'
        OR rt.counterparty LIKE '%POSTO%'
      )
  `).all(`${month}%`, `${FUEL_ACCOUNT_PREFIX}%`);
}

function matchEntry(file, entries, usedEntryIds) {
  const sameDay = entries.filter((e) => e.entry_date === file.doc_date && !usedEntryIds.has(e.id));
  if (sameDay.length === 1) return { entry: sameDay[0], score: 0.95 };

  const fileMins = file.doc_time ? timeFromText(file.doc_time) : null;
  let best = null;
  for (const e of sameDay) {
    const entryMins = timeFromText(e.counterparty) ?? timeFromText(e.description);
    const diff = timeDiffMinutes(fileMins, entryMins);
    const score = diff <= 30 ? 0.98 : diff <= 120 ? 0.85 : 0.7;
    if (!best || score > best.score) best = { entry: e, score };
  }
  if (best) return best;

  const near = entries.filter((e) => file.doc_date && daysDiff(e.entry_date, file.doc_date) <= 1 && !usedEntryIds.has(e.id));
  if (near.length === 1) return { entry: near[0], score: 0.6 };

  return null;
}

/**
 * @param {object} db
 * @param {string} month - YYYY-MM
 */
export function linkFuelFolder(db, month) {
  const { dir, files, missing } = scanFuelFolder(month);
  if (missing) {
    console.warn(`⚠️  Pasta COMBUSTÍVEL não encontrada: ${dir}`);
    return { records: [], linked: 0, files: 0 };
  }

  const fuelEntries = findFuelEntries(db, month);
  const insertAttach = db.prepare(`
    INSERT OR IGNORE INTO attachments
      (ledger_entry_id, raw_transaction_id, file_path, file_name, file_type, file_size, match_type, match_score, copied_path)
    VALUES (@ledger_entry_id, @raw_transaction_id, @file_path, @file_name, @file_type, @file_size, @match_type, @match_score, @copied_path)
  `);

  const usedEntryIds = new Set();
  let linked = 0;
  const records = [];

  for (const file of files) {
    const copied = copyFuelFile(file.path, month, file.hash, file.ext);
    const match = matchEntry(file, fuelEntries, usedEntryIds);
    const entry = match?.entry ?? null;

    if (entry) {
      const raw = db.prepare(`SELECT raw_transaction_id FROM ledger_entries WHERE id = ?`).get(entry.id);
      insertAttach.run({
        ledger_entry_id: entry.id,
        raw_transaction_id: raw?.raw_transaction_id ?? null,
        file_path: file.path,
        file_name: `Cupom combustível — ${file.name}`,
        file_type: file.ext.replace('.', ''),
        file_size: file.size,
        match_type: match.score >= 0.9 ? 'exact' : 'fuzzy',
        match_score: match.score,
        copied_path: copied.attachDest,
      });
      usedEntryIds.add(entry.id);
      linked += 1;
    }

    records.push({
      id: file.hash,
      file_name: file.name,
      doc_date: file.doc_date,
      doc_time: file.doc_time,
      amount: entry?.amount ?? null,
      station: entry?.counterparty || entry?.description?.replace(/.*POSTO/i, 'POSTO') || null,
      bank_account_id: entry?.bank_account_id ?? null,
      ledger_entry_id: entry?.id ?? null,
      category: entry?.category ?? 'Despesa combustível',
      debit_account: entry?.debit_account ?? '4.02.01.01.06.0001',
      status: entry ? 'conciliado' : 'documento',
      url: copied.url,
      source_path: file.path,
    });
  }

  return { records, linked, files: files.length, folder: dir };
}

export default linkFuelFolder;
