// server/src/engine/buildFiscalPagamentos.js
// Concilia NF-e/NFC-e (saídas) com formas de pagamento do XML + correspondências
// em extratos bancários e relatórios de operadoras (Cielo / Credishop).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dbPath, NETWORK_BASE, netlifyDataRoot } from '../config.js';
import { collectXmlFilesForMonth } from './networkScanner.js';
import { parseNFeXML } from '../parsers/xmlFiscal.js';

const VALUE_TOL = 0.05;

function moneyBr(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(t);
}

function sameValue(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(Math.abs(Number(a)) - Math.abs(Number(b))) <= VALUE_TOL;
}

function daysDiff(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

function docTypeLabel(model) {
  const m = String(model || '');
  if (m === '55') return 'NF-e';
  if (m === '65') return 'NFC-e';
  return m || '—';
}

function isCardCode(code) {
  return ['03', '04'].includes(String(code).padStart(2, '0'));
}

function isPixCode(code) {
  return String(code).padStart(2, '0') === '17';
}

function isCashCode(code) {
  return String(code).padStart(2, '0') === '01';
}

function isDepositCode(code) {
  return ['16', '18'].includes(String(code).padStart(2, '0'));
}

/** Lê vendas Cielo (CSV detalhado) */
export function loadCieloSales(monthRoot) {
  const cardRoot = fs.readdirSync(monthRoot).find((d) => /OPERADORAS DE CART/i.test(d));
  if (!cardRoot) return [];
  const cieloDir = path.join(monthRoot, cardRoot, 'CIELO');
  if (!fs.existsSync(cieloDir)) return [];
  const csv = fs.readdirSync(cieloDir).find((f) => /Vendas_cielo.*\.csv$/i.test(f));
  if (!csv) return [];
  // Cielo costuma vir em Windows-1252; utf8 corrompe acentos (Débito → D�bito).
  const raw = fs.readFileSync(path.join(cieloDir, csv), 'latin1');
  const lines = raw.split(/\r?\n/);
  let headerIdx = lines.findIndex((l) => /Data da venda/i.test(l) && /Forma de pagamento/i.test(l));
  if (headerIdx < 0) return [];
  const sep = lines[headerIdx].includes(';') ? ';' : ',';
  const headers = lines[headerIdx].split(sep).map((h) => h.trim());
  const iDate = headers.findIndex((h) => /Data da venda/i.test(h));
  const iTime = headers.findIndex((h) => /Hora/i.test(h));
  const iForma = headers.findIndex((h) => /Forma de pagamento/i.test(h));
  const iBrand = headers.findIndex((h) => /Bandeira/i.test(h));
  const iVal = headers.findIndex((h) => /Valor bruto/i.test(h));
  const iStatus = headers.findIndex((h) => /Status/i.test(h));
  const out = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    if (cols.length < 4) continue;
    const dmy = String(cols[iDate] || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dmy) continue;
    const status = iStatus >= 0 ? String(cols[iStatus] || '') : '';
    if (status && !/aprovad/i.test(status)) continue;
    const value = moneyBr(cols[iVal]);
    if (value == null || Number.isNaN(value)) continue;
    out.push({
      source: 'cielo',
      date: `${dmy[3]}-${dmy[2]}-${dmy[1]}`,
      time: iTime >= 0 ? String(cols[iTime] || '').slice(0, 5) : null,
      forma: String(cols[iForma] || '').trim(),
      bandeira: iBrand >= 0 ? String(cols[iBrand] || '').trim() : null,
      value,
      raw_line: i + 1,
    });
  }
  return out;
}

/** Lê créditos Credishop (CSV simples) */
export function loadCredishopSales(monthRoot) {
  const cardRoot = fs.readdirSync(monthRoot).find((d) => /OPERADORAS DE CART/i.test(d));
  if (!cardRoot) return [];
  const dir = path.join(monthRoot, cardRoot, 'CREDSHOP');
  if (!fs.existsSync(dir)) return [];
  const csv = fs.readdirSync(dir).find((f) => /creditos-efetuar.*\.csv$/i.test(f));
  if (!csv) return [];
  const lines = fs.readFileSync(path.join(dir, csv), 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const cols = line.split(',');
    if (cols.length < 8) continue;
    const dmy = String(cols[0] || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dmy) continue;
    const tipo = String(cols[4] || '');
    if (/aluguel/i.test(tipo)) continue;
    const value = Number(String(cols[7] || '').replace(/^0+/, '') || '0');
    if (!value || Number.isNaN(value)) continue;
    const saleDmy = String(cols[5] || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    out.push({
      source: 'credishop',
      date: saleDmy ? `${saleDmy[3]}-${saleDmy[2]}-${saleDmy[1]}` : `${dmy[3]}-${dmy[2]}-${dmy[1]}`,
      credit_date: `${dmy[3]}-${dmy[2]}-${dmy[1]}`,
      forma: tipo || 'Credishop',
      value,
      nsu: cols[3] || null,
    });
  }
  return out;
}

function matchCardSale(payment, docDate, cardSales, used) {
  if (!isCardCode(payment.code)) return null;
  let best = null;
  for (let i = 0; i < cardSales.length; i++) {
    if (used.has(i)) continue;
    const s = cardSales[i];
    if (!sameValue(s.value, payment.value)) continue;
    const dd = daysDiff(s.date, docDate);
    if (dd > 2) continue;
    const score = dd === 0 ? 1 : 0.8;
    if (!best || score > best.score) best = { idx: i, sale: s, score };
  }
  if (!best) return null;
  used.add(best.idx);
  return {
    status: 'conciliado',
    match_type: 'operadora_cartao',
    match_score: best.score,
    source: best.sale.source,
    detail: `${best.sale.forma}${best.sale.bandeira ? ` · ${best.sale.bandeira}` : ''} · ${best.sale.date}`,
    matched_value: best.sale.value,
  };
}

function matchBankPayment(payment, docDate, bankTxs, usedTx) {
  const code = String(payment.code).padStart(2, '0');
  const candidates = bankTxs.filter((tx) => {
    if (usedTx.has(tx.id)) return false;
    if (!sameValue(tx.amount, payment.value)) return false;
    if (daysDiff(tx.tx_date, docDate) > 5) return false;
    const hay = `${tx.description || ''} ${tx.counterparty || ''}`.toUpperCase();
    if (isPixCode(code)) return /PIX/.test(hay);
    if (isDepositCode(code)) return /DEP[OÓ]SITO|TED|DOC|TRANSFER/.test(hay);
    if (isCashCode(code)) return /SAQUE|ESP[EÉ]CIE|DINHEIRO|NUMERARIO/.test(hay);
    // cartão: concentrador / cielo / rede / credishop
    if (isCardCode(code)) return /CIELO|REDECARD|CRED[EI]?SHOP|CART[AÃ]O|8840|57563|H\s*II/.test(hay);
    return true;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => daysDiff(a.tx_date, docDate) - daysDiff(b.tx_date, docDate));
  const tx = candidates[0];
  usedTx.add(tx.id);
  return {
    status: 'conciliado',
    match_type: 'extrato_bancario',
    match_score: daysDiff(tx.tx_date, docDate) === 0 ? 1 : 0.75,
    source: tx.bank_account_id,
    detail: `${tx.tx_date} · ${tx.bank_account_id} · ${(tx.description || '').slice(0, 60)}`,
    matched_value: Math.abs(tx.amount),
    raw_transaction_id: tx.id,
  };
}

/**
 * @param {string} month YYYY-MM
 */
export function buildFiscalPagamentos(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month inválido');
  const monthFolder = `${month.slice(5, 7)}-${month.slice(0, 4)}`;
  const root = path.join(NETWORK_BASE, monthFolder);

  const xmlFiles = collectXmlFilesForMonth(month);
  const docs = [];
  for (const file of xmlFiles) {
    try {
      const doc = parseNFeXML(file.path);
      if (!doc?.issue_date?.startsWith(month)) continue;
      if (doc.doc_direction === 'entrada') continue;
      if (!['55', '65'].includes(String(doc.doc_model))) continue;
      if (doc.cancelled) continue;
      docs.push({ ...doc, source_path: file.path });
    } catch { /* skip */ }
  }

  let cardSales = [];
  if (fs.existsSync(root)) {
    try { cardSales = [...loadCieloSales(root), ...loadCredishopSales(root)]; } catch { /* */ }
  }

  const db = new Database(dbPath);
  const bankTxs = db.prepare(`
    SELECT id, tx_date, amount, description, counterparty, bank_account_id
    FROM raw_transactions
    WHERE tx_date LIKE ?
  `).all(`${month}%`);
  db.close();

  const usedCard = new Set();
  const usedTx = new Set();
  const items = [];

  for (const doc of docs) {
    const payments = (doc.payments?.length ? doc.payments : [{
      code: '99',
      label: doc.payment_method || 'Não informado no XML',
      value: doc.total_value,
    }]);

    const paymentRows = [];
    for (const pay of payments) {
      let match = null;
      if (isCardCode(pay.code)) {
        match = matchCardSale(pay, doc.issue_date, cardSales, usedCard)
          || matchBankPayment(pay, doc.issue_date, bankTxs, usedTx);
      } else {
        match = matchBankPayment(pay, doc.issue_date, bankTxs, usedTx)
          || (isCardCode(pay.code) ? matchCardSale(pay, doc.issue_date, cardSales, usedCard) : null);
      }
      paymentRows.push({
        forma: pay.label,
        forma_code: pay.code,
        valor: pay.value,
        match_status: match?.status || 'pendente',
        match_type: match?.match_type || null,
        match_detail: match?.detail || null,
        match_source: match?.source || null,
      });
    }

    const allOk = paymentRows.every((p) => p.match_status === 'conciliado');
    const someOk = paymentRows.some((p) => p.match_status === 'conciliado');

    items.push({
      date: doc.issue_date,
      time: doc.issue_time,
      doc_number: doc.doc_number,
      doc_type: docTypeLabel(doc.doc_model),
      doc_model: doc.doc_model,
      counterparty: doc.counterparty_name,
      total_value: doc.total_value,
      payment_summary: doc.payment_method
        || paymentRows.map((p) => `${p.forma} R$ ${Number(p.valor || 0).toFixed(2)}`).join(' + '),
      payments: paymentRows,
      status: allOk ? 'conciliado' : someOk ? 'parcial' : 'pendente',
    });
  }

  items.sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.doc_number) - Number(b.doc_number));

  const summary = {
    qtd_total: items.length,
    qtd_nfe: items.filter((i) => i.doc_model === '55').length,
    qtd_nfce: items.filter((i) => i.doc_model === '65').length,
    qtd_conciliados: items.filter((i) => i.status === 'conciliado').length,
    qtd_parciais: items.filter((i) => i.status === 'parcial').length,
    qtd_pendentes: items.filter((i) => i.status === 'pendente').length,
    total_valor: Math.round(items.reduce((s, i) => s + (i.total_value || 0), 0) * 100) / 100,
    card_sales_indexed: cardSales.length,
    bank_txs: bankTxs.length,
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    month,
    networkRoot: root,
    summary,
    items,
  };

  fs.mkdirSync(netlifyDataRoot, { recursive: true });
  const outFile = path.join(netlifyDataRoot, `fiscal-pagamentos-${month}.json`);
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));

  return { ...payload, outFile };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const month = process.argv.find((a) => a.startsWith('--month='))?.split('=')[1];
  if (!month) {
    console.error('Uso: node buildFiscalPagamentos.js --month=YYYY-MM');
    process.exit(1);
  }
  const r = buildFiscalPagamentos(month);
  console.log(JSON.stringify({
    month: r.month,
    outFile: r.outFile,
    summary: r.summary,
  }, null, 2));
}
