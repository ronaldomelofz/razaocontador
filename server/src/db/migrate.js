import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/madepinus.db');
const schemaPath = path.join(__dirname, 'schema.sql');
const coaPath = path.join(__dirname, '../data/chartOfAccounts.json');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(schemaPath, 'utf-8'));

// Seed: plano de contas do balancete Madepinus
const upsertCoa = db.prepare(`
  INSERT INTO chart_of_accounts (code, name, type) VALUES (?, ?, ?)
  ON CONFLICT(code) DO UPDATE SET name = excluded.name, type = excluded.type
`);
const coaList = JSON.parse(fs.readFileSync(coaPath, 'utf-8'));
for (const { code, name, type } of coaList) upsertCoa.run(code, name, type);

// Seed: contas bancárias com códigos COA do balancete Abr/2026
const seedAccounts = db.prepare(`
  INSERT OR IGNORE INTO bank_accounts (id, bank, agency, account_number, coa_code) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET coa_code = excluded.coa_code
`);
const accounts = [
  ['itau-29660-2', 'Itaú', '4826', '29660-2', '1.01.01.01.02.0002'],
  ['itau-57563-6', 'Itaú', '8840', '57563-6', '1.01.01.01.02.0010'],
  ['itau-31689-7', 'Itaú', '4826', '31689-7', '1.01.01.01.02.0003'],
  ['itau-05068-7', 'Itaú', '0575', '05068-7', '1.01.01.01.02.0006'],
  ['itau-33489-0', 'Itaú', '4826', '33489-0', '1.01.01.01.02.0007'],
  ['bb-847-8', 'Banco do Brasil', '3219-0', '847-8', '1.01.01.01.02.0001'],
  ['inter-9908006-0', 'Banco Inter', '0001-9', '9908006-0', '1.01.01.01.02.0004'],
  ['bnb-119424-3', 'BNB', '56', '119424-3', '1.01.01.01.02.0005'],
  ['mercadopago', 'Mercado Pago', null, null, '1.01.01.01.02.0008'],
  ['automais', 'Aplicação Auto Mais', null, null, '1.01.01.01.03.0001'],
];
for (const a of accounts) seedAccounts.run(...a);

console.log('Migração concluída:', dbPath);
console.log(`  ${coaList.length} contas no plano de contas`);
console.log(`  ${accounts.length} contas bancárias`);
db.close();
