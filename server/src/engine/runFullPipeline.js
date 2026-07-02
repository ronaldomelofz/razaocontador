// server/src/engine/runFullPipeline.js
// Pipeline completo: varre rede → parse extratos/XML → classifica → concilia → vincula anexos → exporta Netlify
//
// Uso: node src/engine/runFullPipeline.js --month=2026-06

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dbPath, netlifyDataRoot } from '../config.js';
import { scanMonthFolder, resolveBankAccount } from './networkScanner.js';
import { parseStatement } from '../parsers/bankStatement.js';
import { parseNFeXML } from '../parsers/xmlFiscal.js';
import { classifyTransaction } from './classify.js';
import { matchBankToFiscal } from './reconcile.js';
import { linkAttachments } from './linkAttachments.js';

const monthArg = process.argv.find((a) => a.startsWith('--month='));
const month = monthArg ? monthArg.split('=')[1] : null;
if (!month) {
  console.error('Uso: node runFullPipeline.js --month=YYYY-MM');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const monthFolder = `${month.split('-')[1]}-${month.split('-')[0]}`;
console.log(`\n🔍 Varrendo pasta de rede para ${month} (${monthFolder})...`);
const { root, files, stats } = scanMonthFolder(month);
console.log(`   ${stats.total} arquivos encontrados:`, stats.byKind);

const insertSourceFile = db.prepare(`
  INSERT OR IGNORE INTO source_files (path, kind, bank_account_id, competence_month, hash)
  VALUES (@path, @kind, @bank_account_id, @competence_month, @hash)
`);
const getSourceFileId = db.prepare(`SELECT id FROM source_files WHERE hash = ?`);
const insertRawTx = db.prepare(`
  INSERT INTO raw_transactions
    (source_file_id, bank_account_id, tx_date, description, counterparty, counterparty_doc, amount, external_ref, raw_json)
  VALUES (@source_file_id, @bank_account_id, @tx_date, @description, @counterparty, @counterparty_doc, @amount, @external_ref, @raw_json)
`);
const insertLedger = db.prepare(`
  INSERT INTO ledger_entries
    (raw_transaction_id, entry_date, description, debit_account, credit_account, amount, category, status)
  VALUES (@raw_transaction_id, @entry_date, @description, @debit_account, @credit_account, @amount, @category, @status)
`);
const insertFiscal = db.prepare(`
  INSERT INTO fiscal_documents
    (source_file_id, doc_number, doc_model, cfop, issue_date, counterparty_name, counterparty_doc, total_value, icms_value, pis_value, cofins_value)
  VALUES (@source_file_id, @doc_number, @doc_model, @cfop, @issue_date, @counterparty_name, @counterparty_doc, @total_value, @icms_value, @pis_value, @cofins_value)
`);
const getBankAccount = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`);
const updateBankCoa = db.prepare(`UPDATE bank_accounts SET coa_code = ? WHERE id = ?`);

// Limpa dados do mês para reprocessamento
db.prepare(`DELETE FROM attachments WHERE ledger_entry_id IN (SELECT id FROM ledger_entries WHERE entry_date LIKE ?)`).run(`${month}%`);
db.prepare(`DELETE FROM reconciliations WHERE raw_transaction_id IN (SELECT id FROM raw_transactions WHERE tx_date LIKE ?)`).run(`${month}%`);
db.prepare(`DELETE FROM ledger_entries WHERE entry_date LIKE ?`).run(`${month}%`);
db.prepare(`DELETE FROM raw_transactions WHERE tx_date LIKE ?`).run(`${month}%`);
db.prepare(`DELETE FROM fiscal_documents WHERE issue_date LIKE ?`).run(`${month}%`);

let totalImported = 0;
let totalPending = 0;
const fiscalDocs = [];

// Processa extratos bancários
const statements = files.filter((f) => f.kind === 'extrato' && f.bank_account_id);
for (const file of statements) {
  const bankAccount = getBankAccount.get(file.bank_account_id);
  if (!bankAccount) {
    console.warn(`⚠️  Conta ${file.bank_account_id} não cadastrada — pulando ${file.name}`);
    continue;
  }
  if (file.bank_coa) updateBankCoa.run(file.bank_coa, file.bank_account_id);
  const coaCode = file.bank_coa || bankAccount.coa_code || file.bank_account_id;

  const hash = crypto.createHash('sha1').update(fs.readFileSync(file.path)).digest('hex');
  insertSourceFile.run({
    path: file.path, kind: 'extrato', bank_account_id: file.bank_account_id,
    competence_month: month, hash,
  });
  const sourceFileId = getSourceFileId.get(hash).id;

  let txs;
  try {
    txs = parseStatement(file.path, file.bank_account_id);
    txs = txs.filter((t) => t.tx_date.startsWith(month));
  } catch (err) {
    console.error(`❌ Erro em ${file.name}:`, err.message);
    continue;
  }

  const insertMany = db.transaction((rows) => {
    for (const tx of rows) {
      const info = insertRawTx.run({
        source_file_id: sourceFileId,
        bank_account_id: file.bank_account_id,
        tx_date: tx.tx_date,
        description: tx.description,
        counterparty: tx.counterparty || null,
        counterparty_doc: tx.counterparty_doc || null,
        amount: tx.amount,
        external_ref: tx.external_ref || null,
        raw_json: JSON.stringify(tx),
      });
      const classification = classifyTransaction(tx, coaCode);
      insertLedger.run({
        raw_transaction_id: info.lastInsertRowid,
        entry_date: tx.tx_date,
        description: tx.description,
        debit_account: classification.debit_account,
        credit_account: classification.credit_account,
        amount: Math.abs(tx.amount),
        category: classification.category,
        status: classification.status,
      });
      totalImported += 1;
      if (classification.status === 'manual_review') totalPending += 1;
    }
  });
  insertMany(txs);
  console.log(`✔ Extrato ${file.name} — ${txs.length} lançamentos`);
}

// Processa XMLs fiscais
const xmlFiles = files.filter((f) => f.ext === '.xml');
for (const file of xmlFiles) {
  try {
    const doc = parseNFeXML(file.path);
    if (!doc || !doc.issue_date?.startsWith(month)) continue;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(file.path)).digest('hex');
    insertSourceFile.run({
      path: file.path, kind: 'xml_nfe', bank_account_id: null,
      competence_month: month, hash,
    });
    const sourceFileId = getSourceFileId.get(hash).id;
    const info = insertFiscal.run({
      source_file_id: sourceFileId,
      doc_number: doc.doc_number,
      doc_model: doc.doc_model,
      cfop: doc.cfop,
      issue_date: doc.issue_date,
      counterparty_name: doc.counterparty_name,
      counterparty_doc: doc.counterparty_doc,
      total_value: doc.total_value,
      icms_value: doc.icms_value,
      pis_value: doc.pis_value,
      cofins_value: doc.cofins_value,
    });
    fiscalDocs.push({ id: info.lastInsertRowid, ...doc });
  } catch {
    // XML inválido ou não-NFe
  }
}
console.log(`✔ ${fiscalDocs.length} documentos fiscais (XML) importados`);

// Conciliação banco ↔ fiscal
const bankTxs = db.prepare(`
  SELECT * FROM raw_transactions WHERE tx_date LIKE ? AND id NOT IN (SELECT raw_transaction_id FROM reconciliations)
`).all(`${month}%`);
const allFiscal = db.prepare(`SELECT * FROM fiscal_documents WHERE issue_date LIKE ?`).all(`${month}%`);
const matches = matchBankToFiscal(bankTxs, allFiscal);
const insertRecon = db.prepare(`
  INSERT INTO reconciliations (raw_transaction_id, fiscal_document_id, match_type, match_score, confirmed)
  VALUES (?, ?, ?, ?, 1)
`);
for (const m of matches) {
  insertRecon.run(m.raw_transaction_id, m.fiscal_document_id, m.match_type, m.match_score);
}
console.log(`✔ ${matches.length} conciliações banco ↔ fiscal`);

// Vincula anexos
console.log('\n📎 Vinculando anexos...');
const attachResult = linkAttachments(db, files, month);
console.log(`✔ ${attachResult.linked} anexos vinculados (${attachResult.danfeLinked || 0} DANFE cliente · ${attachResult.supplierLinked || 0} NF entrada/comprovante fornecedor)`);

// Exporta JSON para Netlify
fs.mkdirSync(netlifyDataRoot, { recursive: true });
const chartOfAccounts = db.prepare(`SELECT code, name, type FROM chart_of_accounts ORDER BY code`).all();
const entries = db.prepare(`
  SELECT le.*, rt.bank_account_id, rt.counterparty, rt.counterparty_doc,
         coa_d.name AS debit_name, coa_c.name AS credit_name
  FROM ledger_entries le
  JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  LEFT JOIN chart_of_accounts coa_d ON coa_d.code = le.debit_account
  LEFT JOIN chart_of_accounts coa_c ON coa_c.code = le.credit_account
  WHERE le.entry_date LIKE ?
  ORDER BY le.entry_date, le.id
`).all(`${month}%`);

const attachments = db.prepare(`
  SELECT a.*, le.entry_date
  FROM attachments a
  JOIN ledger_entries le ON le.id = a.ledger_entry_id
  WHERE le.entry_date LIKE ?
`).all(`${month}%`);

// Copia anexos para pasta pública do Netlify
const publicAnexosDir = path.join(netlifyDataRoot, '..', 'anexos', month);
fs.mkdirSync(publicAnexosDir, { recursive: true });
for (const a of attachments) {
  if (a.copied_path && fs.existsSync(a.copied_path)) {
    const dest = path.join(publicAnexosDir, path.basename(a.copied_path));
    if (!fs.existsSync(dest)) fs.copyFileSync(a.copied_path, dest);
  }
}

const summary = db.prepare(`
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

const exportData = {
  month,
  generatedAt: new Date().toISOString(),
  company: 'FALCÃO & FRAZÃO LTDA (MADEPINUS)',
  cnpj: '10.876.822/0001-94',
  networkRoot: root,
  stats: { imported: totalImported, pending: totalPending, attachments: attachResult.linked, fiscal: fiscalDocs.length, reconciliations: matches.length },
  chartOfAccounts,
  summary,
  entries: entries.map((e) => ({
    ...e,
    attachments: attachments
      .filter((a) => a.ledger_entry_id === e.id)
      .map((a) => ({
        id: a.id,
        file_name: a.file_name,
        file_type: a.file_type,
        match_type: a.match_type,
        match_score: a.match_score,
        url: a.copied_path ? `/anexos/${month}/${path.basename(a.copied_path)}` : null,
      })),
  })),
};

const outFile = path.join(netlifyDataRoot, `ledger-${month}.json`);
fs.writeFileSync(outFile, JSON.stringify(exportData, null, 2));
console.log(`\n📦 Exportado para ${outFile}`);
console.log(`\n✅ Pipeline concluído: ${totalImported} lançamentos, ${totalPending} pendentes, ${attachResult.linked} anexos.`);

db.close();
