// Reclassifica lançamentos ainda em manual_review com o motor atual (sem reimportar extratos).
// Uso: node src/scripts/reclassifyPendingMonth.js --month=2026-09
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dbPath, netlifyDataRoot } from '../config.js';
import { classifyTransaction } from '../engine/classify.js';

const month = process.argv.find((a) => a.startsWith('--month='))?.split('=')[1];
if (!month || !/^\d{4}-\d{2}$/.test(month)) {
  console.error('Uso: node reclassifyPendingMonth.js --month=YYYY-MM');
  process.exit(1);
}

const db = new Database(dbPath);
const rows = db.prepare(`
  SELECT le.id, le.status, le.category,
         rt.description, rt.counterparty, rt.amount AS raw_amount,
         ba.coa_code AS bank_coa, rt.bank_account_id
  FROM ledger_entries le
  JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  JOIN bank_accounts ba ON ba.id = rt.bank_account_id
  WHERE le.entry_date LIKE ? AND le.status = 'manual_review'
`).all(`${month}%`);

const update = db.prepare(`
  UPDATE ledger_entries
  SET debit_account = ?, credit_account = ?, category = ?, status = ?
  WHERE id = ?
`);

let fixed = 0;
const byCat = {};
for (const r of rows) {
  const result = classifyTransaction(
    { description: r.description, counterparty: r.counterparty, amount: r.raw_amount },
    r.bank_coa,
  );
  if (result.status !== 'matched') continue;
  update.run(result.debit_account, result.credit_account, result.category, result.status, r.id);
  fixed += 1;
  byCat[result.category] = (byCat[result.category] || 0) + 1;
}

console.log(JSON.stringify({ month, pendingBefore: rows.length, fixed, remaining: rows.length - fixed, byCat }, null, 2));

const outFile = path.join(netlifyDataRoot, `ledger-${month}.json`);
if (!fs.existsSync(outFile)) {
  console.warn('Ledger JSON ausente — só DB atualizado');
  db.close();
  process.exit(0);
}

const existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
const entries = db.prepare(`
  SELECT le.*, rt.bank_account_id, rt.counterparty, rt.counterparty_doc,
         coa_d.name AS debit_name, coa_c.name AS credit_name
  FROM ledger_entries le
  JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  LEFT JOIN chart_of_accounts coa_d ON coa_d.code = le.debit_account
  LEFT JOIN chart_of_accounts coa_c ON coa_c.code = le.credit_account
  WHERE le.entry_date LIKE ?
  ORDER BY le.entry_date, le.id
`).all(`${month}%`);

const attachmentsByEntry = new Map();
for (const e of existing.entries || []) {
  if (e.attachments?.length) attachmentsByEntry.set(e.id, e.attachments);
}

const chartOfAccounts = db.prepare(`SELECT code, name, type FROM chart_of_accounts ORDER BY code`).all();
const summary = db.prepare(`
  SELECT rt.bank_account_id,
         SUM(CASE WHEN le.debit_account = ba.coa_code THEN le.amount ELSE 0 END) AS entradas,
         SUM(CASE WHEN le.credit_account = ba.coa_code THEN le.amount ELSE 0 END) AS saidas,
         COUNT(*) AS n,
         SUM(CASE WHEN le.status = 'manual_review' THEN 1 ELSE 0 END) AS pendentes
  FROM ledger_entries le
  JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  JOIN bank_accounts ba ON ba.id = rt.bank_account_id
  WHERE le.entry_date LIKE ?
  GROUP BY rt.bank_account_id
`).all(`${month}%`);

const attachStmt = db.prepare(`
  SELECT id, file_name, file_type, match_type, match_score, copied_path
  FROM attachments WHERE ledger_entry_id = ?
`);

existing.entries = entries.map((e) => {
  const fromJson = attachmentsByEntry.get(e.id);
  const fromDb = attachStmt.all(e.id).map((a) => ({
    id: a.id,
    file_name: a.file_name,
    file_type: a.file_type,
    match_type: a.match_type,
    match_score: a.match_score,
    url: a.copied_path ? `/anexos/${month}/${path.basename(a.copied_path)}` : null,
  }));
  return { ...e, attachments: fromJson?.length ? fromJson : fromDb };
});
existing.summary = summary;
existing.chartOfAccounts = chartOfAccounts;
existing.generatedAt = new Date().toISOString();
existing.stats = {
  ...(existing.stats || {}),
  pending: entries.filter((e) => e.status === 'manual_review').length,
  imported: entries.length,
};
fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
console.log('Reexportado', outFile);
db.close();
