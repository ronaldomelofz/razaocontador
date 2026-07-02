// server/src/routes/reconciliation.js
import { Router } from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchBankToFiscal } from '../engine/reconcile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../../data/madepinus.db'));
const router = Router();

// POST /api/reconciliation/run  { month: '2026-06' }
router.post('/run', (req, res) => {
  const { month } = req.body;
  const bankTxs = db.prepare(`
    SELECT rt.* FROM raw_transactions rt
    LEFT JOIN reconciliations r ON r.raw_transaction_id = rt.id
    WHERE rt.tx_date LIKE ? AND r.id IS NULL AND rt.amount < 0
  `).all(`${month}%`);
  const fiscalDocs = db.prepare(`SELECT * FROM fiscal_documents WHERE issue_date LIKE ?`).all(`${month}%`);

  const matches = matchBankToFiscal(bankTxs, fiscalDocs);
  const insert = db.prepare(`
    INSERT INTO reconciliations (raw_transaction_id, fiscal_document_id, match_type, match_score)
    VALUES (@raw_transaction_id, @fiscal_document_id, @match_type, @match_score)
  `);
  const insertMany = db.transaction((rows) => rows.forEach((m) => insert.run(m)));
  insertMany(matches);

  res.json({ matched: matches.length, unmatched_bank: bankTxs.length - matches.length });
});

// GET /api/reconciliation/pending?month=2026-06
router.get('/pending', (req, res) => {
  const { month } = req.query;
  const rows = db.prepare(`
    SELECT rt.id, rt.tx_date, rt.description, rt.amount
    FROM raw_transactions rt
    LEFT JOIN reconciliations r ON r.raw_transaction_id = rt.id
    WHERE rt.tx_date LIKE ? AND r.id IS NULL
    ORDER BY rt.tx_date
  `).all(`${month}%`);
  res.json(rows);
});

export default router;
