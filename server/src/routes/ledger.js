// server/src/routes/ledger.js
import { Router } from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../../data/madepinus.db'));
const router = Router();

// GET /api/ledger?month=2026-06&status=manual_review&account=itau-29660-2
router.get('/', (req, res) => {
  const { month, status, account } = req.query;
  let sql = `
    SELECT le.*, rt.bank_account_id, rt.counterparty, rt.counterparty_doc,
           coa_d.name AS debit_name, coa_c.name AS credit_name
    FROM ledger_entries le
    JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    LEFT JOIN chart_of_accounts coa_d ON coa_d.code = le.debit_account
    LEFT JOIN chart_of_accounts coa_c ON coa_c.code = le.credit_account
    WHERE 1=1
  `;
  const params = [];
  if (month) { sql += ` AND le.entry_date LIKE ?`; params.push(`${month}%`); }
  if (status) { sql += ` AND le.status = ?`; params.push(status); }
  if (account) { sql += ` AND rt.bank_account_id = ?`; params.push(account); }
  sql += ` ORDER BY le.entry_date ASC`;
  const rows = db.prepare(sql).all(...params);

  const attachStmt = db.prepare(`
    SELECT id, file_name, file_type, match_type, match_score, copied_path
    FROM attachments WHERE ledger_entry_id = ?
  `);
  const enriched = rows.map((r) => ({
    ...r,
    attachments: attachStmt.all(r.id).map((a) => ({
      ...a,
      url: a.copied_path ? `/api/attachments/file/${a.id}` : null,
    })),
  }));
  res.json(enriched);
});

// GET /api/ledger/summary?month=2026-06
router.get('/summary', (req, res) => {
  const { month } = req.query;
  const rows = db.prepare(`
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
  res.json(rows);
});

// GET /api/ledger/by-account?month=2026-06  (razão agrupado por conta contábil — visão "conta T")
router.get('/by-account', (req, res) => {
  const { month } = req.query;
  const rows = db.prepare(`
    SELECT debit_account AS account, SUM(amount) AS debit, 0 AS credit FROM ledger_entries
    WHERE entry_date LIKE ? GROUP BY debit_account
    UNION ALL
    SELECT credit_account AS account, 0 AS debit, SUM(amount) AS credit FROM ledger_entries
    WHERE entry_date LIKE ? GROUP BY credit_account
  `).all(`${month}%`, `${month}%`);

  const merged = {};
  for (const r of rows) {
    merged[r.account] ??= { account: r.account, debit: 0, credit: 0 };
    merged[r.account].debit += r.debit;
    merged[r.account].credit += r.credit;
  }
  res.json(Object.values(merged));
});

// GET /api/ledger/chart-of-accounts
router.get('/chart-of-accounts', (_req, res) => {
  const rows = db.prepare(`SELECT code, name, type FROM chart_of_accounts ORDER BY code`).all();
  res.json(rows);
});

// PATCH /api/ledger/:id — correção manual (contador ou Ronaldo)
router.patch('/:id', (req, res) => {
  const { debit_account, credit_account, category, status } = req.body;
  db.prepare(`
    UPDATE ledger_entries SET
      debit_account = COALESCE(?, debit_account),
      credit_account = COALESCE(?, credit_account),
      category = COALESCE(?, category),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(debit_account, credit_account, category, status, req.params.id);

  const updated = db.prepare(`
    SELECT le.*, rt.bank_account_id, rt.counterparty,
           coa_d.name AS debit_name, coa_c.name AS credit_name
    FROM ledger_entries le
    JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    LEFT JOIN chart_of_accounts coa_d ON coa_d.code = le.debit_account
    LEFT JOIN chart_of_accounts coa_c ON coa_c.code = le.credit_account
    WHERE le.id = ?
  `).get(req.params.id);
  res.json(updated);
});

export default router;
