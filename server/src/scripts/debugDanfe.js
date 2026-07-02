import Database from 'better-sqlite3';
import { dbPath } from '../config.js';
import { extractClientName, isOwnCompany, isPartner } from '../utils/extractCounterparty.js';
import { findDanfePdf } from '../engine/linkDanfe.js';

const db = new Database(dbPath);
const clients = db.prepare(`
  SELECT le.id, le.entry_date, le.description, le.amount, le.category, rt.counterparty
  FROM ledger_entries le JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  WHERE le.category LIKE '%cliente%' AND le.entry_date LIKE '2026-06%' AND rt.amount > 0
  LIMIT 10
`).all();
console.log('CLIENT ENTRIES:', clients.length);
clients.forEach((c) => {
  const hay = `${c.description} ${c.counterparty || ''}`;
  console.log(c.amount, extractClientName(c.description, c.counterparty), isOwnCompany(hay), isPartner(hay));
});

const sample = db.prepare(`
  SELECT fd.total_value, fd.issue_date, fd.counterparty_name, fd.doc_model, sf.path
  FROM fiscal_documents fd JOIN source_files sf ON sf.id = fd.source_file_id
  WHERE fd.issue_date = '2026-06-02' AND fd.doc_model = '65' LIMIT 5
`).all();
console.log('FISCAL SAMPLE:', sample);
sample.forEach((s) => console.log('PDF:', findDanfePdf(s.path)));

// Try value match for WILSON 64.9
const wilson = db.prepare(`SELECT * FROM fiscal_documents WHERE ABS(total_value - 64.9) < 0.05`).all();
console.log('WILSON MATCH:', wilson.length, wilson[0]?.counterparty_name, wilson[0]?.path);

db.close();
