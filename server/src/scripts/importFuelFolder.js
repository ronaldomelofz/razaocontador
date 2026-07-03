// server/src/scripts/importFuelFolder.js
// Importa apenas a pasta COMBUSTÍVEL e atualiza o JSON do Netlify.
// Uso: node src/scripts/importFuelFolder.js --month=2026-06

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dbPath, netlifyDataRoot } from '../config.js';
import { linkFuelFolder } from '../engine/linkFuelFolder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monthArg = process.argv.find((a) => a.startsWith('--month='));
const month = monthArg ? monthArg.split('=')[1] : null;
if (!month) {
  console.error('Uso: node src/scripts/importFuelFolder.js --month=YYYY-MM');
  process.exit(1);
}

const db = new Database(dbPath);
const fuelResult = linkFuelFolder(db, month);
db.close();

const jsonPath = path.join(netlifyDataRoot, `ledger-${month}.json`);
if (!fs.existsSync(jsonPath)) {
  console.error('JSON não encontrado. Execute o pipeline completo primeiro.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
data.fuelRecords = fuelResult.records;
data.stats = {
  ...(data.stats || {}),
  fuelDocuments: fuelResult.files,
  fuelLinked: fuelResult.linked,
};
data.generatedAt = new Date().toISOString();
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

console.log(`✅ ${fuelResult.files} documentos · ${fuelResult.linked} vinculados`);
console.log(`📦 Atualizado: ${jsonPath}`);
