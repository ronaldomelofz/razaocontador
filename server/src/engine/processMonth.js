// server/src/engine/processMonth.js
// Ações sob demanda da UI: Conciliar e Apurar.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { dbPath, netlifyDataRoot } from '../config.js';
import { scanMonthFolder } from './networkScanner.js';
import { matchBankToFiscal } from './reconcile.js';
import { linkAttachments } from './linkAttachments.js';
import { linkFuelFolder } from './linkFuelFolder.js';
import { ingestApuracaoFromNetwork } from './ingestApuracao.js';
import { buildCompleteAssessment } from './buildCompleteAssessment.js';
import { computeMonth } from '../scripts/computeIcmsApuracao.js';
import { parseSiatEntrada, findSiatFile, filterNotesByDataEntrada } from '../parsers/siatEntrada.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

function openDb() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

function ensureFiscalCols(db) {
  const cols = db.prepare(`PRAGMA table_info(fiscal_documents)`).all().map((c) => c.name);
  if (!cols.includes('doc_direction')) db.exec(`ALTER TABLE fiscal_documents ADD COLUMN doc_direction TEXT`);
  if (!cols.includes('emit_uf')) db.exec(`ALTER TABLE fiscal_documents ADD COLUMN emit_uf TEXT`);
  if (!cols.includes('destinacao')) db.exec(`ALTER TABLE fiscal_documents ADD COLUMN destinacao TEXT`);
}

function importSiatForMonth(db, month, root, files) {
  const siatFile = findSiatFile(files) || (root && fs.existsSync(root) ? findSiatFile(root) : null);
  const siatPath = typeof siatFile === 'string' ? siatFile : siatFile?.path;
  if (!siatPath || !fs.existsSync(siatPath)) {
    return { imported: 0, path: null };
  }

  ensureFiscalCols(db);
  const { notes } = parseSiatEntrada(siatPath);
  const ofMonth = filterNotesByDataEntrada(notes, month);

  const hash = crypto.createHash('sha1').update(fs.readFileSync(siatPath)).digest('hex');
  db.prepare(`
    INSERT OR IGNORE INTO source_files (path, kind, bank_account_id, competence_month, hash)
    VALUES (?, 'siat_entrada', NULL, ?, ?)
  `).run(siatPath, month, hash);
  const sourceFileId = db.prepare(`SELECT id FROM source_files WHERE hash = ?`).get(hash).id;

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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 'entrada', ?, ?)
  `);
  for (const n of ofMonth) {
    insert.run(
      sourceFileId, n.doc_number, n.doc_model, n.cfop, n.issue_date,
      n.counterparty_name, n.counterparty_doc, n.total_value, n.emit_uf, n.destinacao,
    );
  }

  const summary = {
    notes: ofMonth.length,
    totalProdutos: 0,
    byCfopEntrada: {},
    byUf: {},
    byDestinacao: {},
  };
  for (const n of ofMonth) {
    summary.totalProdutos += n.total_value || 0;
    for (const c of n.cfops_entrada || [n.cfop].filter(Boolean)) {
      summary.byCfopEntrada[c] ??= { n: 0, total: 0 };
      summary.byCfopEntrada[c].n += 1;
      summary.byCfopEntrada[c].total += n.total_value || 0;
    }
    summary.byUf[n.emit_uf || '?'] ??= { n: 0, total: 0 };
    summary.byUf[n.emit_uf || '?'].n += 1;
    summary.byUf[n.emit_uf || '?'].total += n.total_value || 0;
    const dest = n.destinacao || '(sem destinação)';
    summary.byDestinacao[dest] ??= { n: 0, total: 0 };
    summary.byDestinacao[dest].n += 1;
    summary.byDestinacao[dest].total += n.total_value || 0;
  }
  summary.totalProdutos = Math.round(summary.totalProdutos * 100) / 100;
  fs.writeFileSync(path.join(DATA_DIR, `entradaSiat-${month}.json`), JSON.stringify({
    generatedAt: new Date().toISOString(),
    month,
    source: path.basename(siatPath),
    filter: 'data_entrada',
    summary,
    notes: ofMonth.map(({ items: _i, ...rest }) => rest),
  }, null, 2));

  return { imported: ofMonth.length, path: siatPath };
}

function persistComputedIcms(month, computed) {
  const outPath = path.join(DATA_DIR, 'icmsApuracaoCalculada.json');
  let all = {};
  if (fs.existsSync(outPath)) {
    try { all = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { all = {}; }
  }
  all[month] = computed;
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), 'utf8');
}

function updateLedgerExport(month, { fuelRecords, reconMatches }) {
  const outFile = path.join(netlifyDataRoot, `ledger-${month}.json`);
  if (!fs.existsSync(outFile)) return false;
  const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  if (fuelRecords) data.fuelRecords = fuelRecords;
  if (reconMatches?.length) {
    const matchedRaw = new Set(reconMatches.map((m) => m.raw_transaction_id));
    data.entries = (data.entries || []).map((e) => (
      matchedRaw.has(e.raw_transaction_id)
        ? { ...e, status: e.status === 'manual_review' ? 'matched' : e.status }
        : e
    ));
  }
  data.generatedAt = new Date().toISOString();
  data.stats = {
    ...(data.stats || {}),
    reconciliations: (data.stats?.reconciliations || 0) + (reconMatches?.length || 0),
    fuelDocuments: fuelRecords?.length ?? data.stats?.fuelDocuments,
    fuelLinked: fuelRecords?.filter((r) => r.status === 'conciliado').length
      ?? data.stats?.fuelLinked,
  };
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
  return true;
}

/** Conciliar: banco ↔ NF + anexos + combustível */
export function runConciliar(month) {
  if (!month) throw new Error('Informe o mês (YYYY-MM)');
  const db = openDb();
  const steps = [];

  let files = [];
  let root = null;
  try {
    const scanned = scanMonthFolder(month);
    files = scanned.files;
    root = scanned.root;
    steps.push({ step: 'scan', ok: true, files: scanned.stats.total });
  } catch (err) {
    steps.push({ step: 'scan', ok: false, error: err.message });
  }

  const bankTxs = db.prepare(`
    SELECT * FROM raw_transactions
    WHERE tx_date LIKE ?
      AND id NOT IN (SELECT raw_transaction_id FROM reconciliations)
  `).all(`${month}%`);
  const fiscalDocs = db.prepare(`SELECT * FROM fiscal_documents WHERE issue_date LIKE ?`).all(`${month}%`);
  const matches = matchBankToFiscal(bankTxs, fiscalDocs);

  const insertRecon = db.prepare(`
    INSERT INTO reconciliations (raw_transaction_id, fiscal_document_id, match_type, match_score, confirmed)
    VALUES (?, ?, ?, ?, 1)
  `);
  const markMatched = db.prepare(`
    UPDATE ledger_entries SET status = 'matched'
    WHERE raw_transaction_id = ? AND status = 'manual_review'
  `);
  const tx = db.transaction((rows) => {
    for (const m of rows) {
      insertRecon.run(m.raw_transaction_id, m.fiscal_document_id, m.match_type, m.match_score);
      markMatched.run(m.raw_transaction_id);
    }
  });
  tx(matches);
  steps.push({
    step: 'banco_fiscal',
    ok: true,
    matched: matches.length,
    pendingBank: bankTxs.length - matches.length,
    fiscalDocs: fiscalDocs.length,
  });

  let attachResult = { linked: 0 };
  if (files.length) {
    attachResult = linkAttachments(db, files, month);
    steps.push({
      step: 'anexos',
      ok: true,
      linked: attachResult.linked,
      danfe: attachResult.danfeLinked || 0,
      fornecedor: attachResult.supplierLinked || 0,
    });
  }

  const fuelResult = linkFuelFolder(db, month);
  steps.push({
    step: 'combustivel',
    ok: true,
    files: fuelResult.files,
    linked: fuelResult.linked,
  });

  const exported = updateLedgerExport(month, {
    fuelRecords: fuelResult.records,
    reconMatches: matches,
  });
  steps.push({ step: 'export_ledger', ok: exported });

  const pending = db.prepare(`
    SELECT COUNT(*) AS n FROM ledger_entries
    WHERE entry_date LIKE ? AND status = 'manual_review'
  `).get(`${month}%`).n;
  const matched = db.prepare(`
    SELECT COUNT(*) AS n FROM ledger_entries
    WHERE entry_date LIKE ? AND status = 'matched'
  `).get(`${month}%`).n;

  db.close();
  return {
    month,
    action: 'conciliar',
    steps,
    summary: {
      novasConcilicoes: matches.length,
      anexosVinculados: attachResult.linked,
      combustivelVinculados: fuelResult.linked,
      lancamentosConciliados: matched,
      lancamentosEmRevisao: pending,
      networkRoot: root,
    },
  };
}

/** Apurar: ingestão de memórias/DAR + SIAT + cálculo ICMS */
export function runApurar(month) {
  if (!month) throw new Error('Informe o mês (YYYY-MM)');
  const db = openDb();
  const steps = [];

  let ingested = { copied: [] };
  try {
    ingested = ingestApuracaoFromNetwork(month);
    steps.push({ step: 'ingest_docs', ok: true, copied: ingested.copied.length, files: ingested.copied });
  } catch (err) {
    steps.push({ step: 'ingest_docs', ok: false, error: err.message });
  }

  let files = [];
  let root = null;
  try {
    const scanned = scanMonthFolder(month);
    files = scanned.files;
    root = scanned.root;
  } catch (err) {
    steps.push({ step: 'scan', ok: false, error: err.message });
  }

  let siat = { imported: 0 };
  try {
    siat = importSiatForMonth(db, month, root, files);
    steps.push({ step: 'siat', ok: true, imported: siat.imported, path: siat.path });
  } catch (err) {
    steps.push({ step: 'siat', ok: false, error: err.message });
  }

  let computed = null;
  try {
    computed = computeMonth(month);
    persistComputedIcms(month, computed);
    steps.push({
      step: 'calculo_icms',
      ok: true,
      debitoSaidas: computed.icmsNormal?.debitoSaidas,
      antecipacao: computed.antecipacao?.total,
      notasAntecip: computed.antecipacao?.notas?.length || 0,
    });
  } catch (err) {
    steps.push({ step: 'calculo_icms', ok: false, error: err.message });
  }

  db.close();
  const assessment = buildCompleteAssessment(month);
  return {
    month,
    action: 'apurar',
    steps,
    summary: {
      docsCopiados: ingested.copied?.length || 0,
      siatNotas: siat.imported,
      icmsDebitoSaidas: computed?.icmsNormal?.debitoSaidas ?? null,
      icmsAntecipacao: computed?.antecipacao?.total ?? null,
      darsTotal: assessment.dars?.total ?? null,
      missing: assessment.missing || [],
      partial: assessment.partial,
    },
    assessment,
  };
}
