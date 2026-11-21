// server/src/routes/fiscalPagamentos.js
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { netlifyDataRoot } from '../config.js';
import { buildFiscalPagamentos } from '../engine/buildFiscalPagamentos.js';

const router = Router();

function readStatic(month) {
  const p = path.join(netlifyDataRoot, `fiscal-pagamentos-${month}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

router.get('/months', (_req, res) => {
  if (!fs.existsSync(netlifyDataRoot)) return res.json({ months: [] });
  const months = fs.readdirSync(netlifyDataRoot)
    .filter((f) => /^fiscal-pagamentos-\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice('fiscal-pagamentos-'.length, -'.json'.length))
    .sort();
  res.json({ months });
});

router.get('/', (req, res) => {
  const month = req.query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month obrigatório (YYYY-MM)' });
  }
  const data = readStatic(month);
  if (!data) return res.status(404).json({ error: `Sem conciliação fiscal×pagamento para ${month}` });
  res.json(data);
});

/** Regenera a partir da UNC + extratos/SQLite (só local) */
router.post('/build', (req, res) => {
  const month = req.body?.month || req.query?.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month obrigatório (YYYY-MM)' });
  }
  try {
    const result = buildFiscalPagamentos(month);
    res.json({ ok: true, summary: result.summary, outFile: result.outFile });
  } catch (err) {
    console.error('[fiscal-pagamentos/build]', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

export default router;
