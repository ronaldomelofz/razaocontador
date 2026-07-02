// server/src/routes/attachments.js
import { Router } from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { dbPath } from '../config.js';

const db = new Database(dbPath);
const router = Router();

// GET /api/attachments?ledgerEntryId=123
router.get('/', (req, res) => {
  const { ledgerEntryId, month } = req.query;
  let sql = `
    SELECT a.*, le.entry_date, le.description, le.amount
    FROM attachments a
    JOIN ledger_entries le ON le.id = a.ledger_entry_id
    WHERE 1=1
  `;
  const params = [];
  if (ledgerEntryId) { sql += ` AND a.ledger_entry_id = ?`; params.push(ledgerEntryId); }
  if (month) { sql += ` AND le.entry_date LIKE ?`; params.push(`${month}%`); }
  sql += ` ORDER BY le.entry_date`;
  res.json(db.prepare(sql).all(...params));
});

// GET /api/attachments/file/:id — serve arquivo copiado
router.get('/file/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Anexo não encontrado' });
  const filePath = row.copied_path || row.file_path;
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não disponível' });
  res.sendFile(path.resolve(filePath));
});

export default router;
