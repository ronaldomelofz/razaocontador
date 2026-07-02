// server/src/routes/export.js
import { Router } from 'express';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '../../data/madepinus.db'));
const router = Router();

// GET /api/export/excel?month=2026-06
router.get('/excel', async (req, res) => {
  const { month } = req.query;
  const rows = db.prepare(`
    SELECT le.entry_date, le.description, le.debit_account, le.credit_account, le.amount, le.category, le.status,
           rt.bank_account_id, coa_d.name AS debit_name, coa_c.name AS credit_name
    FROM ledger_entries le
    JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    LEFT JOIN chart_of_accounts coa_d ON coa_d.code = le.debit_account
    LEFT JOIN chart_of_accounts coa_c ON coa_c.code = le.credit_account
    WHERE le.entry_date LIKE ?
    ORDER BY le.entry_date
  `).all(`${month}%`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Razão ${month}`);
  ws.columns = [
    { header: 'Data', key: 'entry_date', width: 12 },
    { header: 'Histórico', key: 'description', width: 40 },
    { header: 'Conta Débito', key: 'debit_account', width: 20 },
    { header: 'Nome Débito', key: 'debit_name', width: 28 },
    { header: 'Conta Crédito', key: 'credit_account', width: 20 },
    { header: 'Nome Crédito', key: 'credit_name', width: 28 },
    { header: 'Valor (R$)', key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Categoria', key: 'category', width: 32 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Banco', key: 'bank_account_id', width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="livro_razao_${month}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/export/pdf?month=2026-06 (livro razão completo)
router.get('/pdf', (req, res) => {
  const { month } = req.query;
  const rows = db.prepare(`
    SELECT le.entry_date, le.description, le.debit_account, le.credit_account, le.amount, le.category, le.status,
           coa_d.name AS debit_name, coa_c.name AS credit_name
    FROM ledger_entries le
    LEFT JOIN chart_of_accounts coa_d ON coa_d.code = le.debit_account
    LEFT JOIN chart_of_accounts coa_c ON coa_c.code = le.credit_account
    WHERE le.entry_date LIKE ?
    ORDER BY le.entry_date
  `).all(`${month}%`);

  const summary = db.prepare(`
    SELECT rt.bank_account_id,
           SUM(CASE WHEN le.debit_account = ba.coa_code THEN le.amount ELSE 0 END) AS entradas,
           SUM(CASE WHEN le.credit_account = ba.coa_code THEN le.amount ELSE 0 END) AS saidas
    FROM ledger_entries le JOIN raw_transactions rt ON rt.id = le.raw_transaction_id
    JOIN bank_accounts ba ON ba.id = rt.bank_account_id
    WHERE le.entry_date LIKE ? GROUP BY rt.bank_account_id
  `).all(`${month}%`);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="livro_razao_${month}.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(16).text('MADEPINUS — Livro Razão', { underline: true });
  doc.fontSize(10).text(`Falcão & Frazão Ltda | CNPJ 10.876.822/0001-94 | Competência: ${month}`);
  doc.moveDown();

  doc.fontSize(11).text('Resumo por conta bancária:', { underline: true });
  summary.forEach((s) => {
    doc.fontSize(9).text(`${s.bank_account_id}: entradas R$ ${(s.entradas || 0).toFixed(2)} · saídas R$ ${(s.saidas || 0).toFixed(2)}`);
  });
  doc.moveDown();

  doc.fontSize(11).text(`Lançamentos (${rows.length}):`, { underline: true });
  doc.moveDown(0.5);
  rows.forEach((r) => {
    doc.fontSize(8).text(
      `${r.entry_date} | R$ ${r.amount.toFixed(2)} | D: ${r.debit_account} ${r.debit_name || ''} | C: ${r.credit_account} ${r.credit_name || ''}`,
    );
    doc.fontSize(7).text(`   ${r.description} [${r.category}] ${r.status === 'manual_review' ? '⚠️' : ''}`);
  });
  doc.end();
});

export default router;
