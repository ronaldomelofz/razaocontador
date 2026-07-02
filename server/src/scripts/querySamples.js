import Database from 'better-sqlite3';
import { dbPath } from '../config.js';

const db = new Database(dbPath);
const rows = db.prepare(`
  SELECT le.id, le.entry_date, le.description, le.amount, le.category, rt.counterparty
  FROM ledger_entries le JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  WHERE le.category LIKE '%cliente%' AND le.entry_date LIKE '2026-06%'
  ORDER BY le.amount DESC LIMIT 15
`).all();
console.log('CLIENTES:', JSON.stringify(rows, null, 2));

const partners = db.prepare(`
  SELECT le.id, le.entry_date, le.description, le.amount, le.category, rt.counterparty
  FROM ledger_entries le JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  WHERE (le.description LIKE '%RONALDO%' OR le.description LIKE '%ARIOSTO%' OR rt.counterparty LIKE '%RONALDO%' OR rt.counterparty LIKE '%ARIOSTO%')
  AND le.entry_date LIKE '2026-06%'
`).all();
console.log('SOCIOS:', JSON.stringify(partners, null, 2));

const fiscal = db.prepare(`
  SELECT fd.id, fd.doc_number, fd.issue_date, fd.counterparty_name, fd.total_value, sf.path
  FROM fiscal_documents fd JOIN source_files sf ON sf.id = fd.source_file_id
  WHERE fd.issue_date LIKE '2026-06%' AND fd.total_value > 100
  ORDER BY fd.total_value DESC LIMIT 10
`).all();
console.log('FISCAL:', JSON.stringify(fiscal, null, 2));

const attach = db.prepare(`
  SELECT le.id, le.description, le.amount, a.file_name, le.category
  FROM ledger_entries le
  LEFT JOIN attachments a ON a.ledger_entry_id = le.id
  WHERE le.category LIKE '%cliente%' AND le.entry_date LIKE '2026-06%'
  LIMIT 10
`).all();
console.log('ATTACH_CLIENT:', JSON.stringify(attach, null, 2));

const socios = db.prepare(`
  SELECT id, description, amount, category FROM ledger_entries
  WHERE (category LIKE '%sócio%' OR category LIKE '%socio%') AND entry_date LIKE '2026-06%'
`).all();
console.log('SOCIOS:', socios.length, JSON.stringify(socios.slice(0, 5), null, 2));

const clients = db.prepare(`SELECT COUNT(*) AS n FROM ledger_entries WHERE category LIKE '%cliente%' AND entry_date LIKE '2026-06%'`).get();
const withDanfe = db.prepare(`
  SELECT COUNT(DISTINCT le.id) AS n FROM ledger_entries le
  JOIN attachments a ON a.ledger_entry_id = le.id
  WHERE le.category LIKE '%cliente%' AND le.entry_date LIKE '2026-06%' AND a.file_name LIKE '%DANFE%'
`).get();
const without = db.prepare(`
  SELECT le.id, le.description, le.amount FROM ledger_entries le
  WHERE le.category LIKE '%cliente%' AND le.entry_date LIKE '2026-06%'
    AND le.id NOT IN (SELECT ledger_entry_id FROM attachments WHERE file_name LIKE '%DANFE%')
  LIMIT 8
`).all();
console.log('COBERTURA DANFE:', { clientes: clients.n, comDanfe: withDanfe.n, semDanfe: clients.n - withDanfe.n });
console.log('EX SEM DANFE:', JSON.stringify(without, null, 2));

const wilson = db.prepare(`
  SELECT le.description, a.file_name FROM ledger_entries le
  JOIN attachments a ON a.ledger_entry_id = le.id
  WHERE le.description LIKE '%WILSON%' AND le.entry_date LIKE '2026-06%'
`).all();
console.log('WILSON ANEXOS:', wilson);

db.close();
