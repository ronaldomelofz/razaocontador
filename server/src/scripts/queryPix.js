import Database from 'better-sqlite3';
import { dbPath } from '../config.js';

const db = new Database(dbPath);
const rows = db.prepare(`
  SELECT le.id, le.entry_date, le.amount, le.description, le.category, le.status, le.debit_account,
         a.file_name
  FROM ledger_entries le
  LEFT JOIN attachments a ON a.ledger_entry_id = le.id
  WHERE le.description LIKE '%IBYTE%' OR le.description LIKE '%Lilia%' OR le.description LIKE '%Viviane%'
  ORDER BY le.entry_date
`).all();
for (const r of rows) {
  console.log(`${r.entry_date} | R$ ${r.amount} | ${r.category} | ${r.status} | ${r.file_name || 'sem anexo'}`);
}
db.close();
