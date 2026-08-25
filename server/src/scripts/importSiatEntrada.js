// server/src/scripts/importSiatEntrada.js
// Importa Relatório SIAT (NF-e de entrada) → banco fiscal_documents + JSON local.
// Uso: node src/scripts/importSiatEntrada.js --month=2026-07
//      node src/scripts/importSiatEntrada.js --month=2026-07 --file="C:\path\RELATÓRIO SIAT.xls"

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { dbPath, NETWORK_BASE } from '../config.js';
import { parseSiatEntrada, findSiatFile, filterNotesByDataEntrada } from '../parsers/siatEntrada.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monthArg = process.argv.find((a) => a.startsWith('--month='));
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const month = monthArg ? monthArg.split('=')[1] : null;
if (!month) {
  console.error('Uso: node importSiatEntrada.js --month=YYYY-MM [--file=caminho.xls]');
  process.exit(1);
}

const monthFolder = `${month.split('-')[1]}-${month.split('-')[0]}`;
let siatPath = fileArg ? fileArg.slice('--file='.length) : null;
if (!siatPath) {
  const root = path.join(NETWORK_BASE, monthFolder);
  siatPath = findSiatFile(root);
}
if (!siatPath || !fs.existsSync(siatPath)) {
  console.error(`SIAT não encontrado para ${month}. Pasta: ${path.join(NETWORK_BASE, monthFolder)}`);
  process.exit(1);
}

console.log(`📄 Lendo ${siatPath}`);
const { meta, notes, items } = parseSiatEntrada(siatPath);
const ofMonth = filterNotesByDataEntrada(notes, month);
const semEntrada = notes.filter((n) => !n.data_entrada);
const outraEntrada = notes.filter(
  (n) => n.data_entrada && !String(n.data_entrada).startsWith(month),
);
console.log(`   meta:`, meta);
console.log(`   ${notes.length} notas no arquivo SIAT`);
console.log(`   ${ofMonth.length} com data de ENTRADA em ${month} (usadas na apuração)`);
if (semEntrada.length) {
  console.log(`   ${semEntrada.length} sem data_entrada (excluídas da apuração deste mês)`);
}
if (outraEntrada.length) {
  console.log(`   ${outraEntrada.length} com entrada em outro mês (excluídas)`);
}
console.log(`   ${items.length} itens · total produtos (entrada ${month}): R$ ${ofMonth.reduce((s, n) => s + n.total_value, 0).toFixed(2)}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Garante coluna doc_direction (entrada|saida) sem quebrar bases antigas
const cols = db.prepare(`PRAGMA table_info(fiscal_documents)`).all().map((c) => c.name);
if (!cols.includes('doc_direction')) {
  db.exec(`ALTER TABLE fiscal_documents ADD COLUMN doc_direction TEXT`);
  console.log('   + coluna fiscal_documents.doc_direction');
}
if (!cols.includes('emit_uf')) {
  db.exec(`ALTER TABLE fiscal_documents ADD COLUMN emit_uf TEXT`);
  console.log('   + coluna fiscal_documents.emit_uf');
}
if (!cols.includes('destinacao')) {
  db.exec(`ALTER TABLE fiscal_documents ADD COLUMN destinacao TEXT`);
  console.log('   + coluna fiscal_documents.destinacao');
}

const hash = crypto.createHash('sha1').update(fs.readFileSync(siatPath)).digest('hex');
db.prepare(`
  INSERT OR IGNORE INTO source_files (path, kind, bank_account_id, competence_month, hash)
  VALUES (?, 'siat_entrada', NULL, ?, ?)
`).run(siatPath, month, hash);
const sourceFileId = db.prepare(`SELECT id FROM source_files WHERE hash = ?`).get(hash).id;

// Remove entradas SIAT anteriores do mês (não mexe em saídas/XML)
db.prepare(`
  DELETE FROM fiscal_documents
  WHERE issue_date LIKE ?
    AND doc_direction = 'entrada'
    AND source_file_id IN (SELECT id FROM source_files WHERE kind = 'siat_entrada')
`).run(`${month}%`);

const insert = db.prepare(`
  INSERT INTO fiscal_documents
    (source_file_id, doc_number, doc_model, cfop, issue_date, counterparty_name, counterparty_doc,
     total_value, icms_value, pis_value, cofins_value, cancelled, doc_direction, emit_uf, destinacao)
  VALUES
    (@source_file_id, @doc_number, @doc_model, @cfop, @issue_date, @counterparty_name, @counterparty_doc,
     @total_value, @icms_value, @pis_value, @cofins_value, 0, @doc_direction, @emit_uf, @destinacao)
`);

const tx = db.transaction((rows) => {
  for (const n of rows) {
    insert.run({
      source_file_id: sourceFileId,
      doc_number: n.doc_number,
      doc_model: n.doc_model,
      cfop: n.cfop,
      issue_date: n.issue_date,
      counterparty_name: n.counterparty_name,
      counterparty_doc: n.counterparty_doc,
      total_value: n.total_value,
      icms_value: n.icms_value,
      pis_value: n.pis_value,
      cofins_value: n.cofins_value,
      doc_direction: 'entrada',
      emit_uf: n.emit_uf,
      destinacao: n.destinacao,
    });
  }
});
tx(ofMonth);
console.log(`✔ ${ofMonth.length} NF de entrada gravadas no banco`);

// JSON local (aba apuração + consumo offline)
const outDir = path.join(__dirname, '../data');
const outJson = path.join(outDir, `entradaSiat-${month}.json`);
const payload = {
  generatedAt: new Date().toISOString(),
  month,
  source: path.basename(siatPath),
  filter: 'data_entrada',
  meta,
  summary: {
    notes: ofMonth.length,
    totalProdutos: Math.round(ofMonth.reduce((s, n) => s + n.total_value, 0) * 100) / 100,
    excluidasSemDataEntrada: semEntrada.length,
    excluidasOutroMesEntrada: outraEntrada.length,
    byCfopEntrada: {},
    byUf: {},
    byDestinacao: {},
  },
  notes: ofMonth.map(({ items: _items, ...rest }) => rest),
  excluded: {
    semDataEntrada: semEntrada.map((n) => ({
      doc_number: n.doc_number,
      issue_date: n.issue_date,
      counterparty_name: n.counterparty_name,
      total_value: n.total_value,
      emit_uf: n.emit_uf,
    })),
    outraDataEntrada: outraEntrada.map((n) => ({
      doc_number: n.doc_number,
      issue_date: n.issue_date,
      data_entrada: n.data_entrada,
      counterparty_name: n.counterparty_name,
      total_value: n.total_value,
      emit_uf: n.emit_uf,
    })),
  },
};
for (const n of ofMonth) {
  for (const c of n.cfops_entrada) {
    payload.summary.byCfopEntrada[c] ??= { n: 0, total: 0 };
    payload.summary.byCfopEntrada[c].n += 1;
    payload.summary.byCfopEntrada[c].total += n.total_value;
  }
  payload.summary.byUf[n.emit_uf || '?'] ??= { n: 0, total: 0 };
  payload.summary.byUf[n.emit_uf || '?'].n += 1;
  payload.summary.byUf[n.emit_uf || '?'].total += n.total_value;
  const dest = n.destinacao || '(sem destinação)';
  payload.summary.byDestinacao[dest] ??= { n: 0, total: 0 };
  payload.summary.byDestinacao[dest].n += 1;
  payload.summary.byDestinacao[dest].total += n.total_value;
}
for (const map of [payload.summary.byCfopEntrada, payload.summary.byUf, payload.summary.byDestinacao]) {
  for (const k of Object.keys(map)) map[k].total = Math.round(map[k].total * 100) / 100;
}
fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), 'utf8');
console.log(`✔ JSON: ${outJson}`);

db.close();
