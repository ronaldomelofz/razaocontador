// server/src/routes/boletosFornecedores.js
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOLETOS_FORNECEDORES_BY_MONTH } from '../data/boletosFornecedores.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

function loadFromPublic(month) {
  const p = path.join(__dirname, '../../../client/public/data', `boletos-fornecedores-${month}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

router.get('/months', (_req, res) => {
  const months = new Set(Object.keys(BOLETOS_FORNECEDORES_BY_MONTH || {}));
  const dir = path.join(__dirname, '../../../client/public/data');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^boletos-fornecedores-(\d{4}-\d{2})\.json$/);
      if (m) months.add(m[1]);
    }
  }
  res.json({ months: [...months].sort() });
});

router.get('/', (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Informe month=YYYY-MM' });
  }
  const data = loadFromPublic(month) || BOLETOS_FORNECEDORES_BY_MONTH?.[month];
  if (!data) {
    return res.status(404).json({ error: `Sem conciliação de boletos para ${month}` });
  }
  res.json(data);
});

export default router;
