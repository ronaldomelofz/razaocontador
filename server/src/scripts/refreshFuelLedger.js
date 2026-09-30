// Atualiza fuelRecords do ledger-YYYY-MM.json sem reprocessar extratos
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dbPath, netlifyDataRoot } from '../config.js';
import { linkFuelFolder } from '../engine/linkFuelFolder.js';

const month = process.argv.find((a) => a.startsWith('--month='))?.split('=')[1] || '2026-08';
const db = new Database(dbPath);
const result = linkFuelFolder(db, month);
db.close();

const ledgerPath = path.join(netlifyDataRoot, `ledger-${month}.json`);
const data = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
data.fuelRecords = result.records;
data.stats = {
  ...data.stats,
  fuelDocuments: result.files,
  fuelLinked: result.linked,
  attachments: (data.stats?.attachments || 0), // mantém; anexos combustível já estão na cópia
};
data.generatedAt = new Date().toISOString();
fs.writeFileSync(ledgerPath, JSON.stringify(data, null, 2));

const withAmount = result.records.filter((r) => r.amount != null).length;
console.log(JSON.stringify({
  month,
  files: result.files,
  linked: result.linked,
  withAmount,
  totalAmount: Math.round(result.records.reduce((s, r) => s + (r.amount || 0), 0) * 100) / 100,
  records: result.records.map((r) => ({
    file: r.file_name,
    date: r.doc_date,
    amount: r.amount,
    liters: r.liters,
    station: r.station,
    status: r.status,
  })),
}, null, 2));
