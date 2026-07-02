// server/src/engine/runPipeline.js
// Executa o pipeline completo para um mês: varre server/data/uploads/<banco>/<mes>/,
// faz parse, classifica, grava raw_transactions + ledger_entries no SQLite.
//
// Uso: node src/engine/runPipeline.js --month=2026-06

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { parseStatement } from '../parsers/bankStatement.js';
import { classifyTransaction } from './classify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../../data/madepinus.db'));

const monthArg = process.argv.find((a) => a.startsWith('--month='));
const month = monthArg ? monthArg.split('=')[1] : null;
if (!month) {
  console.error('Uso: node runPipeline.js --month=YYYY-MM');
  process.exit(1);
}

const uploadsRoot = path.join(__dirname, '../../data/uploads');
const bankDirs = fs.existsSync(uploadsRoot) ? fs.readdirSync(uploadsRoot) : [];

const insertSourceFile = db.prepare(`
  INSERT OR IGNORE INTO source_files (path, kind, bank_account_id, competence_month, hash)
  VALUES (@path, 'extrato', @bank_account_id, @competence_month, @hash)
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
const getBankAccount = db.prepare(`SELECT * FROM bank_accounts WHERE id = ?`);

let totalImported = 0;
let totalPending = 0;

for (const bankAccountId of bankDirs) {
  const bankAccount = getBankAccount.get(bankAccountId);
  if (!bankAccount) {
    console.warn(`⚠️  ${bankAccountId} não cadastrado em bank_accounts — pulando.`);
    continue;
  }
  const monthDir = path.join(uploadsRoot, bankAccountId, month);
  if (!fs.existsSync(monthDir)) continue;

  for (const file of fs.readdirSync(monthDir)) {
    const fullPath = path.join(monthDir, file);
    const ext = file.split('.').pop().toLowerCase();
    if (!['csv', 'txt', 'xlsx'].includes(ext)) continue; // ofx/pdf tratados por outros scripts

    const hash = crypto.createHash('sha1').update(fs.readFileSync(fullPath)).digest('hex');
    insertSourceFile.run({ path: fullPath, bank_account_id: bankAccountId, competence_month: month, hash });
    const sourceFileId = getSourceFileId.get(hash).id;

    let txs;
    try {
      txs = parseStatement(fullPath, bankAccountId);
    } catch (err) {
      console.error(`Erro ao processar ${fullPath}:`, err.message);
      continue;
    }

    const insertMany = db.transaction((rows) => {
      for (const tx of rows) {
        const info = insertRawTx.run({
          source_file_id: sourceFileId,
          bank_account_id: bankAccountId,
          tx_date: tx.tx_date,
          description: tx.description,
          counterparty: tx.counterparty || null,
          counterparty_doc: tx.counterparty_doc || null,
          amount: tx.amount,
          external_ref: tx.external_ref || null,
          raw_json: JSON.stringify(tx),
        });
        const classification = classifyTransaction(tx, bankAccount.coa_code || bankAccountId);
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
    console.log(`✔ ${fullPath} — ${txs.length} lançamentos`);
  }
}

console.log(`\nPipeline concluído para ${month}: ${totalImported} lançamentos, ${totalPending} pendentes de revisão.`);
db.close();
