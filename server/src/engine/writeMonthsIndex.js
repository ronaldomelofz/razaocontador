// server/src/engine/writeMonthsIndex.js
// Índice de competências publicáveis em client/public/data/months.json
// Fonte de verdade para a UI no Netlify (sem depender de /api/ledger/months nem fallback hardcoded).
import fs from 'node:fs';
import path from 'node:path';
import { netlifyDataRoot } from '../config.js';

/**
 * Lê todos os ledger-YYYY-MM.json e grava months.json.
 * Por padrão só inclui meses com lançamentos (> 0).
 */
export function writeMonthsIndex({ includeEmpty = false } = {}) {
  if (!fs.existsSync(netlifyDataRoot)) {
    fs.mkdirSync(netlifyDataRoot, { recursive: true });
  }

  const files = fs.readdirSync(netlifyDataRoot)
    .filter((f) => /^ledger-\d{4}-\d{2}\.json$/.test(f))
    .sort();

  const months = [];
  for (const f of files) {
    const month = f.slice('ledger-'.length, -'.json'.length);
    let entries = 0;
    let generatedAt = null;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(netlifyDataRoot, f), 'utf8'));
      entries = Array.isArray(data.entries) ? data.entries.length : 0;
      generatedAt = data.generatedAt || null;
    } catch {
      continue;
    }
    if (!includeEmpty && entries <= 0) continue;
    months.push({ month, entries, generatedAt });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    months,
  };
  const outFile = path.join(netlifyDataRoot, 'months.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  return { outFile, months: months.map((m) => m.month), details: months };
}

export function listStaticLedgerMonths({ includeEmpty = false } = {}) {
  return writeMonthsIndex({ includeEmpty }).months;
}
