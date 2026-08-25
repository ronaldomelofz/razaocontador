// server/src/scripts/fixRendeFacil.js
// Corrige lançamentos "BB Rende Fácil" (aplicação automática BB) já importados no banco,
// reclassificando-os sem reprocessar o mês inteiro (preserva IDs usados por overrides do Netlify Blobs).
// Depois, reexporta o JSON estático de cada mês afetado.
//
// Uso: node src/scripts/fixRendeFacil.js --months=2026-06,2026-07

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dbPath, netlifyDataRoot } from '../config.js';

const monthsArg = process.argv.find((a) => a.startsWith('--months='));
const months = monthsArg ? monthsArg.split('=')[1].split(',') : [];
if (!months.length) {
  console.error('Uso: node fixRendeFacil.js --months=2026-06,2026-07');
  process.exit(1);
}

const db = new Database(dbPath);
const CATEGORY = 'Aplicação financeira — BB Rende Fácil (transferência automática)';
const APPLICATION_ACCOUNT = '1.01.01.01.03.0002';

// Importante: le.amount é sempre armazenado em valor absoluto (Math.abs) — a direção real
// (entrada/saída do banco) só pode ser obtida pelo sinal original em raw_transactions.amount.
const findRows = db.prepare(`
  SELECT le.id, rt.amount AS raw_amount, ba.coa_code AS bank_coa
  FROM ledger_entries le
  JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
  JOIN bank_accounts ba ON ba.id = rt.bank_account_id
  WHERE le.entry_date LIKE ? AND (rt.description LIKE '%Rende F%' OR rt.counterparty LIKE '%Rende F%')
`);

const updateRow = db.prepare(`
  UPDATE ledger_entries SET debit_account = ?, credit_account = ?, category = ?, status = 'matched'
  WHERE id = ?
`);

for (const month of months) {
  const rows = findRows.all(`${month}%`);
  let fixed = 0;

  for (const r of rows) {
    const isInflow = r.raw_amount > 0; // dinheiro voltando do Rende Fácil para a conta corrente
    const debit_account = isInflow ? r.bank_coa : APPLICATION_ACCOUNT;
    const credit_account = isInflow ? APPLICATION_ACCOUNT : r.bank_coa;
    updateRow.run(debit_account, credit_account, CATEGORY, r.id);
    fixed += 1;
  }
  console.log(`✔ ${month}: ${fixed} lançamentos "Rende Fácil" reclassificados`);

  // Reexporta o JSON estático do mês (mesma query de export usada no pipeline completo)
  const outFile = path.join(netlifyDataRoot, `ledger-${month}.json`);
  if (!fs.existsSync(outFile)) {
    console.warn(`⚠️  ${outFile} não existe — pulando reexportação`);
    continue;
  }
  const existing = JSON.parse(fs.readFileSync(outFile, 'utf-8'));

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

  const attachmentsByEntry = new Map();
  for (const e of existing.entries) {
    if (e.attachments?.length) attachmentsByEntry.set(e.id, e.attachments);
  }

  const chartOfAccounts = db.prepare(`SELECT code, name, type FROM chart_of_accounts ORDER BY code`).all();
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

  const totalPending = entries.filter((e) => e.status === 'manual_review').length;

  const updated = {
    ...existing,
    generatedAt: new Date().toISOString(),
    chartOfAccounts,
    summary,
    stats: { ...existing.stats, pending: totalPending },
    entries: entries.map((e) => ({
      ...e,
      attachments: attachmentsByEntry.get(e.id) || [],
    })),
  };

  fs.writeFileSync(outFile, JSON.stringify(updated, null, 2));
  console.log(`📦 Reexportado ${outFile}`);
}

db.close();
